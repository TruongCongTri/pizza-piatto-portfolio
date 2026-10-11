import { NextResponse } from "next/server";

import {
  clientIp,
  errorResponse,
  isSameOrigin,
  readJson,
  withinRateLimit,
} from "@/lib/server/http";
import { createReservation, toGuestView } from "@/lib/server/reservations";

/* book a table: validates against the shop's hours, stores the booking and
   emails the guest's ticket (when they gave an email) and the shop's receipt */
export async function POST(request) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!(await withinRateLimit(`reserve:${clientIp(request)}`, 10, 10 * 60))) {
    return errorResponse(429, "rateLimited");
  }

  const body = await readJson(request);
  if (!body) return errorResponse(400, "badRequest");

  try {
    const result = await createReservation(body);
    if (result.errors) {
      return errorResponse(422, "validation", { fields: result.errors });
    }
    return NextResponse.json(
      { reservation: toGuestView(result.reservation), emails: result.emails },
      { status: 201 },
    );
  } catch (error) {
    console.error("[reservations] booking failed:", error);
    return errorResponse(500, "server");
  }
}
