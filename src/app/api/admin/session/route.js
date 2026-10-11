import { NextResponse } from "next/server";

import {
  clientIp,
  errorResponse,
  isSameOrigin,
  readJson,
  withinRateLimit,
} from "@/lib/server/http";
import {
  clearSession,
  safeEqual,
  setSession,
  signValue,
} from "@/lib/server/session";

/* staff sign-in for the reservation desk, with the ADMIN_PASSWORD */
export async function POST(request) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return errorResponse(503, "notConfigured");

  if (!(await withinRateLimit(`admin:${clientIp(request)}`, 10, 15 * 60))) {
    return errorResponse(429, "rateLimited");
  }

  const body = await readJson(request);
  const attempt = String(body?.password ?? "");
  /* compare fixed-length digests so the check takes the same time either way */
  if (!attempt || !safeEqual(signValue(attempt), signValue(password))) {
    return errorResponse(401, "invalid");
  }

  return setSession(NextResponse.json({ ok: true }), "admin", { role: "admin" });
}

export async function DELETE(request) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  return clearSession(NextResponse.json({ ok: true }), "admin");
}
