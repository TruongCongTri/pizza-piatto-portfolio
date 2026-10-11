import { NextResponse } from "next/server";

import { errorResponse, isSameOrigin, readJson } from "@/lib/server/http";
import { createStaffReservation } from "@/lib/server/reservations";
import { demoToolsEnabled } from "@/lib/server/demo";
import { getSession } from "@/lib/server/session";
import { getReservationsVersion, listReservations } from "@/lib/server/store";

const isStaff = (request) => getSession(request, "admin")?.role === "admin";

/* every booking, for the reservation desk. The desk asks when it opens
   and when told something changed (/api/admin/events), sending the
   version it already has; if nothing changed it gets a tiny "unchanged". */
export async function GET(request) {
  if (!isStaff(request)) return errorResponse(401, "signedOut");

  try {
    const version = await getReservationsVersion();
    const known = request.nextUrl.searchParams.get("version");
    /* the desk shows the sample-data tools where they are on */
    const demoTools = demoToolsEnabled;
    if (known === String(version)) {
      return NextResponse.json({ version, unchanged: true, demoTools });
    }
    const reservations = await listReservations();
    return NextResponse.json({ version, reservations, demoTools });
  } catch (error) {
    console.error("[admin] listing bookings failed:", error);
    return errorResponse(500, "server");
  }
}

/* a booking taken at the desk: { kind: "booking" | "walkIn", ... } */
export async function POST(request) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!isStaff(request)) return errorResponse(401, "signedOut");

  const body = await readJson(request);
  if (!body) return errorResponse(400, "badRequest");

  try {
    const result = await createStaffReservation(body);
    if (result.errors) {
      return errorResponse(422, "validation", { fields: result.errors });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[admin] desk booking failed:", error);
    return errorResponse(500, "server");
  }
}
