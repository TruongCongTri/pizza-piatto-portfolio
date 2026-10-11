import { NextResponse } from "next/server";

import { findGuests } from "@/lib/server/guests";
import { errorResponse } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";

const isStaff = (request) => getSession(request, "admin")?.role === "admin";

/* staff look a guest up (?q= phone, name, email or booking code) and see
   all their table bookings and class bookings together */
export async function GET(request) {
  if (!isStaff(request)) return errorResponse(401, "signedOut");
  try {
    const guests = await findGuests(request.nextUrl.searchParams.get("q"));
    return NextResponse.json({ guests });
  } catch (error) {
    console.error("[admin] guest lookup failed:", error);
    return errorResponse(500, "server");
  }
}
