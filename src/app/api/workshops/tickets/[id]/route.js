import { NextResponse } from "next/server";

import { getTicket } from "@/lib/server/classes";
import { clientIp, errorResponse, withinRateLimit } from "@/lib/server/http";

/* a student's class ticket, opened with its secret link (?t=). Anything
   still open is checked with the payment provider first, so a late or lost
   webhook never leaves the ticket stale. */
export async function GET(request, { params }) {
  if (!(await withinRateLimit(`ticket:${clientIp(request)}`, 120, 60))) {
    return errorResponse(429, "rateLimited");
  }
  const { id } = await params;
  try {
    const ticket = await getTicket(id, request.nextUrl.searchParams.get("t"));
    if (!ticket) return errorResponse(404, "notFound");
    return NextResponse.json({ ticket });
  } catch (error) {
    console.error(`[workshops] ticket ${id} failed:`, error);
    return errorResponse(500, "server");
  }
}
