// Brings the shop's past pizza classes onto the site: each class in
// scripts/past-classes.json is created through the Class Desk's API, then
// its photos (already shipped in public/classes/) are attached to its
// recap. The classes and photos come from the shop's public Facebook posts.
//
// Safe to run again: a class whose Facebook source link is already on the
// site is skipped. Works against any running copy of the site:
//
//   node scripts/import-past-classes.mjs                     (http://localhost:3000)
//   ADMIN_PASSWORD=... node scripts/import-past-classes.mjs https://your-domain
//
// The staff password comes from ADMIN_PASSWORD, or from .env.local.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

function adminPassword() {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const envFile = path.join(ROOT, ".env.local");
  const match = existsSync(envFile) && readFileSync(envFile, "utf8").match(/^ADMIN_PASSWORD=(.*)$/m);
  if (!match) throw new Error("Set ADMIN_PASSWORD (the Class Desk password)");
  return match[1].trim();
}

async function call(cookie, pathname, init = {}) {
  const response = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie, ...init.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${pathname}: ${response.status} ${JSON.stringify(data)}`);
  }
  return data;
}

const classes = JSON.parse(readFileSync(path.join(ROOT, "scripts", "past-classes.json"), "utf8"));

const signIn = await fetch(`${BASE}/api/admin/session`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: adminPassword() }),
});
if (!signIn.ok) throw new Error(`Sign-in failed (${signIn.status}): check ADMIN_PASSWORD`);
const cookie = signIn.headers.get("set-cookie").split(";")[0];

const { workshops } = await call(cookie, "/api/admin/workshops");
const onSite = new Set(workshops.map((workshop) => workshop.source).filter(Boolean));

for (const { photos = [], ...entry } of classes) {
  if (onSite.has(entry.source)) {
    console.log(`skipped (already on the site): ${entry.title.vi}`);
    continue;
  }
  for (const photo of photos) {
    if (!existsSync(path.join(ROOT, "public", photo.url))) {
      throw new Error(`Missing photo ${photo.url} for ${entry.title.vi}`);
    }
  }
  const { workshop } = await call(cookie, "/api/admin/workshops", {
    method: "POST",
    body: JSON.stringify({ ...entry, cover: entry.cover ?? photos[0]?.url ?? "" }),
  });
  for (const photo of photos) {
    await call(cookie, `/api/admin/workshops/${workshop.id}/images`, {
      method: "POST",
      body: JSON.stringify(photo),
    });
  }
  console.log(`added ${workshop.id} ${workshop.slug} with ${photos.length} photos`);
}
