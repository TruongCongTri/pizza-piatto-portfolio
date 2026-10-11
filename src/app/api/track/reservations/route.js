import { NextResponse } from "next/server";

import { guestBookings } from "@/lib/server/guests";
import { errorResponse } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";

/* the signed-in guest's bookings: tables and classes */
export async function GET(request) {
  const session = getSession(request, "track");
  if (!session?.phone) return errorResponse(401, "signedOut");

  try {
    return NextResponse.json(await guestBookings(session.phone));
  } catch (error) {
    console.error("[track] listing bookings failed:", error);
    return errorResponse(500, "server");
  }
}
