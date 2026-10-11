import { NextResponse } from "next/server";

import {
  clearDemoClasses,
  clearDemoReservations,
  demoToolsEnabled,
  seedDemoClasses,
  seedDemoGuest,
  seedDemoReservations,
} from "@/lib/server/demo";
import { errorResponse, isSameOrigin, readJson } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";

const ACTIONS = {
  seed: seedDemoReservations,
  clear: clearDemoReservations,
  seedGuest: seedDemoGuest,
  seedClasses: seedDemoClasses,
  clearClasses: clearDemoClasses,
};

/* sample data for demos: { action: "seed" | "clear" } for table bookings,
   { action: "seedGuest", phone } for one number's booking history,
   "seedClasses" | "clearClasses" for pizza classes; only where the demo
   tools are on (see lib/server/demo.js) */
export async function POST(request) {
  if (!demoToolsEnabled) return errorResponse(404, "notFound");
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (getSession(request, "admin")?.role !== "admin") {
    return errorResponse(401, "signedOut");
  }

  const body = await readJson(request);
  const run = Object.hasOwn(ACTIONS, body?.action ?? "") ? ACTIONS[body.action] : null;
  if (!run) return errorResponse(400, "badRequest");

  try {
    const result = await run(body);
    if (result.error) return errorResponse(422, result.error);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`[demo] ${body.action} failed:`, error);
    return errorResponse(500, "server");
  }
}
