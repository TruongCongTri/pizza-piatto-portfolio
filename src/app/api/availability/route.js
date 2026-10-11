import { NextResponse } from "next/server";

import { MAX_GUESTS, MIN_GUESTS } from "@/lib/booking";
import { clientIp, errorResponse, withinRateLimit } from "@/lib/server/http";
import { getAvailability } from "@/lib/server/reservations";

/* which times still have a table for a party of `guests`, over the
   bookable days; only free/full, never who booked */
export async function GET(request) {
  if (!(await withinRateLimit(`availability:${clientIp(request)}`, 120, 60))) {
    return errorResponse(429, "rateLimited");
  }

  const guests = Number(request.nextUrl.searchParams.get("guests") ?? 2);
  if (!Number.isInteger(guests) || guests < MIN_GUESTS || guests > MAX_GUESTS) {
    return errorResponse(422, "partySize");
  }

  try {
    return NextResponse.json({ guests, days: await getAvailability(guests) });
  } catch (error) {
    console.error("[availability] lookup failed:", error);
    return errorResponse(500, "server");
  }
}
