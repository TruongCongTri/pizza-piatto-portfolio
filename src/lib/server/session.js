import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/* signed, HttpOnly cookies: the reservation desk (staff) and a guest who
   proved their phone number with a code. Each is scoped to its own API path. */
export const SESSIONS = {
  admin: { cookie: "pp_admin", path: "/api/admin", maxAge: 60 * 60 * 24 * 7 },
  track: { cookie: "pp_track", path: "/api/track", maxAge: 60 * 60 * 12 },
};

function getSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  /* each server instance would make up its own secret, so a code sent by
     one would fail on another and sign-ins would drop at random */
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET must be set in production");
  }
  /* development without a secret: sign-ins last until the server restarts */
  if (!globalThis.__pizzaPiattoSecret) {
    globalThis.__pizzaPiattoSecret = randomBytes(32).toString("hex");
    console.warn(
      "[auth] AUTH_SECRET is not set: sessions reset whenever the server restarts.",
    );
  }
  return globalThis.__pizzaPiattoSecret;
}

/* HMAC of `value` with the server secret, also used to hash sign-in codes */
export function signValue(value) {
  return createHmac("sha256", getSecret()).update(value).digest("base64url");
}

export function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && timingSafeEqual(left, right);
}

function createToken(payload, maxAgeSeconds) {
  const data = Buffer.from(
    JSON.stringify({ ...payload, exp: Date.now() + maxAgeSeconds * 1000 }),
  ).toString("base64url");
  return `${data}.${signValue(data)}`;
}

function readToken(token) {
  const [data, signature] = String(token ?? "").split(".");
  if (!data || !signature || !safeEqual(signature, signValue(data))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString());
    return payload.exp > Date.now() ? payload : null;
  } catch {
    return null;
  }
}

/* payload of a valid session cookie, or null */
export function getSession(request, kind) {
  const { cookie } = SESSIONS[kind];
  return readToken(request.cookies.get(cookie)?.value);
}

export function setSession(response, kind, payload) {
  const { cookie, path, maxAge } = SESSIONS[kind];
  response.cookies.set(cookie, createToken(payload, maxAge), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path,
    maxAge,
  });
  return response;
}

export function clearSession(response, kind) {
  const { cookie, path } = SESSIONS[kind];
  response.cookies.set(cookie, "", { path, maxAge: 0 });
  return response;
}
