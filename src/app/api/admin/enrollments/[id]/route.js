import { NextResponse } from "next/server";

import { deskAction } from "@/lib/server/classes";
import { errorResponse, isSameOrigin, readJson } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";

const isStaff = (request) => getSession(request, "admin")?.role === "admin";
const ACTIONS = new Set(["checkIn", "undo", "cancel", "markRefunded", "check"]);

/* the class desk acts on a booking: { action, paymentId? } */
export async function PATCH(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!isStaff(request)) return errorResponse(401, "signedOut");

  const body = await readJson(request);
  if (!body || !ACTIONS.has(body.action)) return errorResponse(400, "badRequest");
  const { id } = await params;

  try {
    const result = await deskAction(id, body.action, { paymentId: body.paymentId });
    if (result.error === "notFound") return errorResponse(404, "notFound");
    if (result.error) return errorResponse(409, result.error);
    const { accessToken: _secret, ...enrollment } = result.enrollment ?? {};
    return NextResponse.json({ enrollment });
  } catch (error) {
    console.error(`[admin] ${body.action} on ${id} failed:`, error);
    return errorResponse(500, "server");
  }
}
