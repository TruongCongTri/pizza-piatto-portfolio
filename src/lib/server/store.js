import "server-only";

import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { announceLocally, changeCommand } from "./events";

/* Reservations live in Upstash Redis when it is configured (needed on
   Vercel, whose filesystem is read-only), otherwise in a JSON file under
   .data/ for local development or a single long-running server. Short-lived
   values (sign-in codes, rate limits) share the same store. Every change
   also tells the open staff desks (./events). */

const REDIS_URL =
  process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

export const DATA_DIR = path.resolve(
  process.cwd(),
  process.env.RESERVATIONS_DATA_DIR || ".data",
);

/* ---------- Upstash Redis (REST) ---------- */

const KEYS = {
  reservations: "pp:reservations",
  byPhone: (phone) => `pp:reservations:phone:${phone}`,
  byDate: (date) => `pp:reservations:date:${date}`,
  version: "pp:reservations:version",
  lock: (date) => `pp:lock:${date}`,
  temp: (key) => `pp:temp:${key}`,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/* a day stays locked at most this long, even if a request dies holding it */
const LOCK_TTL_MS = 10_000;

async function redis(...commands) {
  const response = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: JSON.stringify(commands.map((command) => command.map(String))),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Redis request failed with ${response.status}`);
  }
  const results = await response.json();
  return results.map(({ result, error }) => {
    if (error) throw new Error(`Redis error: ${error}`);
    return result;
  });
}

const parse = (raw) => (raw ? JSON.parse(raw) : null);

/* a booking's entries in the date and phone indexes (walk-ins may come
   without a number); `verb` is SADD or SREM */
const indexCommands = (verb) => (reservation) => [
  [verb, KEYS.byDate(reservation.date), reservation.id],
  ...(reservation.phone ? [[verb, KEYS.byPhone(reservation.phone), reservation.id]] : []),
];

const redisStore = {
  async insert(reservation) {
    const [created] = await redis([
      "HSETNX",
      KEYS.reservations,
      reservation.id,
      JSON.stringify(reservation),
    ]);
    if (!created) return false;
    await redis(
      ...indexCommands("SADD")(reservation),
      ["INCR", KEYS.version],
      changeCommand("reservations"),
    );
    return true;
  },
  /* many at once (sample data) in two round trips; a clashing id only
     skips that record. Returns how many were added. */
  async insertMany(reservations) {
    if (!reservations.length) return 0;
    const created = await redis(
      ...reservations.map((reservation) => [
        "HSETNX",
        KEYS.reservations,
        reservation.id,
        JSON.stringify(reservation),
      ]),
    );
    const added = reservations.filter((_, index) => created[index]);
    if (added.length) {
      await redis(
        ...added.flatMap(indexCommands("SADD")),
        ["INCR", KEYS.version],
        changeCommand("reservations"),
      );
    }
    return added.length;
  },
  async deleteMany(reservations) {
    if (!reservations.length) return 0;
    await redis(
      ["HDEL", KEYS.reservations, ...reservations.map(({ id }) => id)],
      ...reservations.flatMap(indexCommands("SREM")),
      ["INCR", KEYS.version],
      changeCommand("reservations"),
    );
    return reservations.length;
  },
  async update(reservation) {
    await redis(
      ["HSET", KEYS.reservations, reservation.id, JSON.stringify(reservation)],
      ["INCR", KEYS.version],
      changeCommand("reservations"),
    );
  },
  async get(id) {
    const [raw] = await redis(["HGET", KEYS.reservations, id]);
    return parse(raw);
  },
  async list() {
    const [values] = await redis(["HVALS", KEYS.reservations]);
    return values.map(parse);
  },
  async listByPhone(phone) {
    return redisStore.listIndexed(KEYS.byPhone(phone));
  },
  async listByDate(date) {
    return redisStore.listIndexed(KEYS.byDate(date));
  },
  async listIndexed(setKey) {
    const [ids] = await redis(["SMEMBERS", setKey]);
    if (!ids.length) return [];
    const [values] = await redis(["HMGET", KEYS.reservations, ...ids]);
    return values.filter(Boolean).map(parse);
  },
  /* one decision per key at a time, across every server instance */
  async withLock(key, task) {
    const token = randomUUID();
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const [acquired] = await redis([
        "SET",
        KEYS.lock(key),
        token,
        "PX",
        LOCK_TTL_MS,
        "NX",
      ]);
      if (acquired === "OK") {
        try {
          return await task();
        } finally {
          await redis(["DEL", KEYS.lock(key)]).catch(() => {});
        }
      }
      await sleep(50 + Math.random() * 100);
    }
    throw new Error(`${key} stayed locked`);
  },
  async version() {
    const [version] = await redis(["GET", KEYS.version]);
    return Number(version ?? 0);
  },
  async tempGet(key) {
    const [raw] = await redis(["GET", KEYS.temp(key)]);
    return parse(raw);
  },
  async tempSet(key, value, ttlSeconds, { onlyIfAbsent = false } = {}) {
    const command = ["SET", KEYS.temp(key), JSON.stringify(value)];
    command.push("EX", Math.max(1, Math.ceil(ttlSeconds)));
    if (onlyIfAbsent) command.push("NX");
    const [result] = await redis(command);
    return result === "OK";
  },
  async tempDelete(key) {
    await redis(["DEL", KEYS.temp(key)]);
  },
  async tempIncrement(key, ttlSeconds) {
    const [count] = await redis(["INCR", KEYS.temp(key)]);
    if (count === 1) await redis(["EXPIRE", KEYS.temp(key), ttlSeconds]);
    return count;
  },
};

/* ---------- JSON file ---------- */

const DB_FILE = path.join(DATA_DIR, "reservations.json");
const EMPTY_DB = { version: 0, reservations: {} };

/* kept on globalThis so every route bundle (and dev hot reloads) share one
   write queue and one set of temporary values */
const fileState = (globalThis.__pizzaPiattoStore ??= {
  queue: Promise.resolve(),
  temp: new Map(),
});
/* locks by key (added after the store first shipped, hence apart) */
fileState.locks ??= new Map();

async function readDb() {
  try {
    return JSON.parse(await fs.readFile(DB_FILE, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return structuredClone(EMPTY_DB);
    throw error;
  }
}

/* runs one read(-modify-write) at a time so concurrent requests never see a
   half-written file or overwrite each other's changes; `change` returns
   false to skip the write */
function withDb(change) {
  const run = fileState.queue.then(async () => {
    const db = await readDb();
    if (!change) return db;
    const result = change(db);
    if (result !== false) {
      db.version += 1;
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
      announceLocally("reservations");
    }
    return result;
  });
  fileState.queue = run.catch(() => {});
  return run;
}

function liveTemp(key) {
  const entry = fileState.temp.get(key);
  if (entry && entry.expiresAt <= Date.now()) {
    fileState.temp.delete(key);
    return null;
  }
  return entry ?? null;
}

const fileStore = {
  insert: (reservation) =>
    withDb((db) => {
      if (db.reservations[reservation.id]) return false;
      db.reservations[reservation.id] = reservation;
      return true;
    }),
  update: (reservation) =>
    withDb((db) => {
      db.reservations[reservation.id] = reservation;
    }),
  insertMany: async (reservations) =>
    (await withDb((db) => {
      const fresh = reservations.filter(({ id }) => !db.reservations[id]);
      fresh.forEach((reservation) => {
        db.reservations[reservation.id] = reservation;
      });
      return fresh.length || false;
    })) || 0,
  deleteMany: async (reservations) =>
    (await withDb((db) => {
      const present = reservations.filter(({ id }) => db.reservations[id]);
      present.forEach(({ id }) => delete db.reservations[id]);
      return present.length || false;
    })) || 0,
  async get(id) {
    return (await withDb()).reservations[id] ?? null;
  },
  async list() {
    return Object.values((await withDb()).reservations);
  },
  async listByPhone(phone) {
    const all = await fileStore.list();
    return all.filter((reservation) => reservation.phone === phone);
  },
  async listByDate(date) {
    const all = await fileStore.list();
    return all.filter((reservation) => reservation.date === date);
  },
  /* chains tasks per key; the file writes themselves still go through withDb */
  withLock(key, task) {
    const previous = fileState.locks.get(key) ?? Promise.resolve();
    const run = previous.then(task);
    const settled = run.catch(() => {});
    fileState.locks.set(key, settled);
    settled.then(() => {
      if (fileState.locks.get(key) === settled) fileState.locks.delete(key);
    });
    return run;
  },
  async version() {
    return (await withDb()).version;
  },
  async tempGet(key) {
    return liveTemp(key)?.value ?? null;
  },
  async tempSet(key, value, ttlSeconds, { onlyIfAbsent = false } = {}) {
    if (onlyIfAbsent && liveTemp(key)) return false;
    fileState.temp.set(key, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
    return true;
  },
  async tempDelete(key) {
    fileState.temp.delete(key);
  },
  async tempIncrement(key, ttlSeconds) {
    const entry = liveTemp(key);
    const count = (entry?.value ?? 0) + 1;
    fileState.temp.set(key, {
      value: count,
      expiresAt: entry?.expiresAt ?? Date.now() + ttlSeconds * 1000,
    });
    return count;
  },
};

const store = REDIS_URL && REDIS_TOKEN ? redisStore : fileStore;

if (store === fileStore && process.env.VERCEL) {
  console.error(
    "[reservations] No database configured: add Upstash Redis " +
      "(UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN). Vercel cannot " +
      "write the .data/ file, so bookings will fail.",
  );
}

/* reservations */
export const insertReservation = (reservation) => store.insert(reservation);
/* bulk add and remove, for sample (demo) data */
export const insertReservations = (reservations) => store.insertMany(reservations);
export const deleteReservations = (reservations) => store.deleteMany(reservations);
export const updateReservation = (reservation) => store.update(reservation);
export const getReservation = (id) => store.get(id);
export const listReservations = () => store.list();
export const listReservationsByPhone = (phone) => store.listByPhone(phone);
export const listReservationsByDate = (date) => store.listByDate(date);
/* runs `task` while no other booking decision for that date can run, so two
   guests can never both get the last table */
export const withDayLock = (date, task) => store.withLock(`day:${date}`, task);
/* the same, for any key (a class's seats, a payment) */
export const withLock = (key, task) => store.withLock(key, task);

/* for other collections built on the same backends (lib/server/collections.js) */
export const usingRedis = store === redisStore;
export { redis as redisPipeline };
/* bumps on every change, so the reservation desk can poll cheaply */
export const getReservationsVersion = () => store.version();

/* expiring values */
export const tempGet = (key) => store.tempGet(key);
export const tempSet = (key, value, ttlSeconds, options) =>
  store.tempSet(key, value, ttlSeconds, options);
export const tempDelete = (key) => store.tempDelete(key);
export const tempIncrement = (key, ttlSeconds) =>
  store.tempIncrement(key, ttlSeconds);
