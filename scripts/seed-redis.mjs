// Copies the local data in .data/ (classes, bookings, class bookings,
// payments) into Upstash Redis, so a deployed site shows the same thing.
// Uses the same keys as src/lib/server/store.js and collections.js.
//
//   node scripts/seed-redis.mjs [--env=.env.production.local] [--only=workshops,reservations]
//                               [--no-samples] [--dry-run]
//
// --env       a file with UPSTASH_REDIS_REST_URL / _TOKEN (or KV_REST_API_URL
//             / _TOKEN), e.g. one made by `vercel env pull`; otherwise taken
//             from the environment, then .env.production.local, then .env.local
// --only      a comma list of: reservations, workshops, enrollments, payments, mockpay
// --no-samples leaves out sample data (records marked demo: true)
// --dry-run   says what it would write, writes nothing
//
// Safe to run again: records are written by id (a second run overwrites
// them with the same values); nothing already in Redis is deleted.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const DATA_DIR = path.resolve(ROOT, process.env.RESERVATIONS_DATA_DIR || ".data");

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  }),
);
const DRY = Boolean(args["dry-run"]);
const SAMPLES = !args["no-samples"];

/* the collections and the fields each is indexed by (collections.js) */
const COLLECTIONS = {
  workshops: ["slug"],
  enrollments: ["workshopId", "phone"],
  payments: ["enrollmentId", "providerRef"],
  mockpay: [],
};
const ALL = ["reservations", ...Object.keys(COLLECTIONS)];
const only = args.only ? String(args.only).split(",") : ALL;

/* ---------- credentials ---------- */

function readEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Z_]+=/.test(line))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1).trim().replace(/^"(.*)"$/, "$1")];
      }),
  );
}

const env = {
  ...readEnvFile(path.join(ROOT, ".env.local")),
  ...readEnvFile(path.join(ROOT, ".env.production.local")),
  ...(args.env ? readEnvFile(path.resolve(ROOT, String(args.env))) : {}),
  ...process.env,
};
const URL_ = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
const TOKEN = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
if (!DRY && !(URL_ && TOKEN)) {
  console.error(
    "No Upstash credentials found. Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN\n" +
      "(or KV_REST_API_URL / KV_REST_API_TOKEN) to the environment, .env.production.local,\n" +
      "or a file given with --env=. `vercel env pull .env.production.local` fetches them.",
  );
  process.exit(1);
}

/* ---------- writing ---------- */

const BATCH = 200;
let commandCount = 0;

async function pipeline(commands) {
  commandCount += commands.length;
  if (DRY || !commands.length) return;
  for (let i = 0; i < commands.length; i += BATCH) {
    const response = await fetch(`${URL_}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify(commands.slice(i, i + BATCH).map((command) => command.map(String))),
    });
    if (!response.ok) throw new Error(`Redis request failed with ${response.status}: ${await response.text()}`);
    const results = await response.json();
    const failed = results.find((result) => result.error);
    if (failed) throw new Error(`Redis error: ${failed.error}`);
  }
}

const readJson = (name) => {
  const file = path.join(DATA_DIR, `${name}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
};
const keep = (records) => (SAMPLES ? records : records.filter((record) => !record.demo));
const docs = (name) => Object.values(readJson(name)?.docs ?? {});

/* without samples, a class booking goes with its class, a payment with
   its booking and a test-checkout link with its payment, so nothing is
   left pointing at something not copied */
function keptIds() {
  const workshops = new Set(keep(docs("workshops")).map((doc) => doc.id));
  const enrollments = new Set(
    keep(docs("enrollments"))
      .filter((doc) => workshops.has(doc.workshopId))
      .map((doc) => doc.id),
  );
  const payments = new Set(
    keep(docs("payments"))
      .filter((doc) => enrollments.has(doc.enrollmentId))
      .map((doc) => doc.id),
  );
  return { workshops, enrollments, payments };
}
const BELONGS = {
  enrollments: (doc, ids) => ids.workshops.has(doc.workshopId),
  payments: (doc, ids) => ids.enrollments.has(doc.enrollmentId),
  mockpay: (doc, ids) => ids.payments.has(doc.merchantPaymentId),
};
const present = (value) => value !== undefined && value !== null && value !== "";

/* bookings: one hash, by-date and by-phone sets, a version (store.js) */
async function seedReservations() {
  const db = readJson("reservations");
  const records = keep(Object.values(db?.reservations ?? {}));
  const commands = records.flatMap((reservation) => [
    ["HSET", "pp:reservations", reservation.id, JSON.stringify(reservation)],
    ["SADD", `pp:reservations:date:${reservation.date}`, reservation.id],
    ...(reservation.phone ? [["SADD", `pp:reservations:phone:${reservation.phone}`, reservation.id]] : []),
  ]);
  if (records.length) commands.push(["INCR", "pp:reservations:version"], ["PUBLISH", "pp:desk", "reservations"]);
  await pipeline(commands);
  return records.length;
}

/* a collection: one hash, a set per indexed value, a version (collections.js) */
async function seedCollection(name, indexes, ids) {
  const belongs = BELONGS[name];
  const records = keep(docs(name)).filter((doc) => SAMPLES || !belongs || belongs(doc, ids));
  const commands = records.flatMap((doc) => [
    ["HSET", `pp:c:${name}`, doc.id, JSON.stringify(doc)],
    ...indexes
      .filter((field) => present(doc[field]))
      .map((field) => ["SADD", `pp:c:${name}:${field}:${doc[field]}`, doc.id]),
  ]);
  if (records.length) commands.push(["INCR", `pp:c:${name}:version`], ["PUBLISH", "pp:desk", "classes"]);
  await pipeline(commands);
  return records.length;
}

const ids = SAMPLES ? null : keptIds();

console.log(
  `${DRY ? "[dry run] " : ""}Copying ${only.join(", ")} from ${DATA_DIR}` +
    `${SAMPLES ? "" : " (without sample data)"}${DRY ? "" : ` to ${new URL(URL_).host}`}`,
);
for (const name of only) {
  if (!ALL.includes(name)) {
    console.error(`Unknown data set "${name}" (expected: ${ALL.join(", ")})`);
    process.exit(1);
  }
  const count = name === "reservations" ? await seedReservations() : await seedCollection(name, COLLECTIONS[name], ids);
  console.log(`  ${name}: ${count}`);
}
console.log(`${DRY ? "Would send" : "Sent"} ${commandCount} commands.`);
