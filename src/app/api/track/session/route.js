import { NextResponse } from "next/server";

import { normalizePhone } from "@/lib/phone";
import {
  clientIp,
  errorResponse,
  isSameOrigin,
  readJson,
  withinRateLimit,
} from "@/lib/server/http";
import { guestBookings } from "@/lib/server/guests";
import { checkCode } from "@/lib/server/otp";
import { clearSession, setSession } from "@/lib/server/session";

/* step 2: a correct code signs the guest in to that phone number's bookings
   (tables and classes) */
export async function POST(request) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  const body = await readJson(request);
  const phone = normalizePhone(body?.phone);
  if (!phone) return errorResponse(422, "invalidPhone");

  if (!(await withinRateLimit(`verify:${clientIp(request)}`, 20, 10 * 60))) {
    return errorResponse(429, "rateLimited");
  }

  try {
    const result = await checkCode(phone, body.code);
    if (result !== "approved") return errorResponse(401, result);

    const response = NextResponse.json(await guestBookings(phone));
    return setSession(response, "track", { phone });
  } catch (error) {
    console.error("[track] checking a code failed:", error);
    return errorResponse(500, "server");
  }
}

export async function DELETE(request) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  return clearSession(NextResponse.json({ ok: true }), "track");
}
