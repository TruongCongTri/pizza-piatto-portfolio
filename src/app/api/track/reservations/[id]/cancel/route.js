import { NextResponse } from "next/server";

import { errorResponse, isSameOrigin } from "@/lib/server/http";
import { cancelForGuest, toGuestView } from "@/lib/server/reservations";
import { getSession } from "@/lib/server/session";

/* a signed-in guest cancels one of their own bookings */
export async function POST(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  const session = getSession(request, "track");
  if (!session?.phone) return errorResponse(401, "signedOut");

  const { id } = await params;
  try {
    const result = await cancelForGuest(id, session.phone);
    if (result.error === "notFound") return errorResponse(404, "notFound");
    if (result.error) return errorResponse(409, result.error);
    return NextResponse.json({ reservation: toGuestView(result.reservation) });
  } catch (error) {
    console.error(`[track] cancelling ${id} failed:`, error);
    return errorResponse(500, "server");
  }
}
