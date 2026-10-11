import "server-only";

import { NextResponse } from "next/server";

import { tempIncrement } from "./store";

/* error responses carry a key the client maps to translated copy */
export function errorResponse(status, error, extra = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

/* JSON bodies only: a plain HTML form posted from another site is refused */
export async function readJson(request) {
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return null;
  }
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

/* changes must come from this site: a browser sends the page's Origin
   with every POST/PATCH/DELETE, so one from elsewhere is refused (SameSite
   cookies already stop most of this; this makes it explicit). Requests with
   no Origin, such as server-side tools, pass. */
export function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function clientIp(request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

/* fixed window: true while `key` was used fewer than `limit` times in the
   last `windowSeconds` */
export async function withinRateLimit(key, limit, windowSeconds) {
  const count = await tempIncrement(`rate:${key}`, windowSeconds);
  return count <= limit;
}
