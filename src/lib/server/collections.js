import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import { announceLocally, changeCommand } from "./events";
import { DATA_DIR, redisPipeline as redis, usingRedis } from "./store";

/* Small document collections (classes, class bookings, payments) on the
   same backends as reservations: Upstash Redis when configured, otherwise a
   JSON file per collection in .data/. `indexes` names fields that documents
   can be looked up by. */

/* one write queue per file, kept on globalThis like the reservation store's */
const fileQueues = (globalThis.__pizzaPiattoCollections ??= new Map());

function fileCollection(name) {
  const file = path.join(DATA_DIR, `${name}.json`);

  const read = async () => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return { version: 0, docs: {} };
      throw error;
    }
  };

  /* one read(-modify-write) at a time; `change` returns false to skip the write */
  const run = (change) => {
    const queue = fileQueues.get(name) ?? Promise.resolve();
    const result = queue.then(async () => {
      const db = await read();
      if (!change) return db;
      const outcome = change(db);
      if (outcome !== false) {
        db.version += 1;
        await fs.mkdir(DATA_DIR, { recursive: true });
        await fs.writeFile(file, JSON.stringify(db, null, 2));
        announceLocally("classes");
      }
      return outcome;
    });
    fileQueues.set(name, result.catch(() => {}));
    return result;
  };

  return {
    insert: async (doc) =>
      Boolean(
        await run((db) => {
          if (db.docs[doc.id]) return false;
          db.docs[doc.id] = doc;
          return true;
        }),
      ),
    put: (doc) =>
      run((db) => {
        db.docs[doc.id] = doc;
        return true;
      }),
    remove: (doc) =>
      run((db) => {
        if (!db.docs[doc.id]) return false;
        delete db.docs[doc.id];
        return true;
      }),
    get: async (id) => (await run()).docs[id] ?? null,
    list: async () => Object.values((await run()).docs),
    listBy: async (field, value) =>
      Object.values((await run()).docs).filter((doc) => doc[field] === value),
    version: async () => (await run()).version,
  };
}

function redisCollection(name, indexes) {
  const hash = `pp:c:${name}`;
  const versionKey = `pp:c:${name}:version`;
  const indexKey = (field, value) => `pp:c:${name}:${field}:${value}`;
  const indexed = (doc) =>
    indexes.filter((field) => doc?.[field] !== undefined && doc[field] !== null && doc[field] !== "");
  const parse = (raw) => (raw ? JSON.parse(raw) : null);

  return {
    async insert(doc) {
      const [created] = await redis(["HSETNX", hash, doc.id, JSON.stringify(doc)]);
      if (!created) return false;
      await redis(
        ...indexed(doc).map((field) => ["SADD", indexKey(field, doc[field]), doc.id]),
        ["INCR", versionKey],
        changeCommand("classes"),
      );
      return true;
    },
    /* `previous` (the stored copy) lets changed index values move */
    async put(doc, previous) {
      await redis(
        ["HSET", hash, doc.id, JSON.stringify(doc)],
        ...indexed(previous)
          .filter((field) => previous[field] !== doc[field])
          .map((field) => ["SREM", indexKey(field, previous[field]), doc.id]),
        ...indexed(doc).map((field) => ["SADD", indexKey(field, doc[field]), doc.id]),
        ["INCR", versionKey],
        changeCommand("classes"),
      );
    },
    async remove(doc) {
      await redis(
        ["HDEL", hash, doc.id],
        ...indexed(doc).map((field) => ["SREM", indexKey(field, doc[field]), doc.id]),
        ["INCR", versionKey],
        changeCommand("classes"),
      );
    },
    async get(id) {
      const [raw] = await redis(["HGET", hash, id]);
      return parse(raw);
    },
    async list() {
      const [values] = await redis(["HVALS", hash]);
      return values.map(parse);
    },
    async listBy(field, value) {
      const [ids] = await redis(["SMEMBERS", indexKey(field, value)]);
      if (!ids.length) return [];
      const [values] = await redis(["HMGET", hash, ...ids]);
      return values.filter(Boolean).map(parse);
    },
    async version() {
      const [version] = await redis(["GET", versionKey]);
      return Number(version ?? 0);
    },
  };
}

export function collection(name, { indexes = [] } = {}) {
  return usingRedis ? redisCollection(name, indexes) : fileCollection(name);
}

/* the collections */
export const workshopsDb = collection("workshops", { indexes: ["slug"] });
export const enrollmentsDb = collection("enrollments", { indexes: ["workshopId", "phone"] });
export const paymentsDb = collection("payments", { indexes: ["enrollmentId", "providerRef"] });
