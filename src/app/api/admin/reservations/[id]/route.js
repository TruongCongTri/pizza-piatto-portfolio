import { NextResponse } from "next/server";

import { errorResponse, isSameOrigin, readJson } from "@/lib/server/http";
import { updateVisit } from "@/lib/server/reservations";
import { getSession } from "@/lib/server/session";

const ACTIONS = ["checkIn", "undo", "noShow", "cancel"];

/* { action: "checkIn" | "undo" | "noShow" | "cancel", table?: ["3A"] };
   each action is only allowed at the right moment, see updateVisit */
export async function PATCH(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (getSession(request, "admin")?.role !== "admin") {
    return errorResponse(401, "signedOut");
  }

  const { id } = await params;
  const body = await readJson(request);
  if (!ACTIONS.includes(body?.action)) return errorResponse(400, "badRequest");
  if (body.table !== undefined && !Array.isArray(body.table)) {
    return errorResponse(400, "badRequest");
  }

  try {
    const result = await updateVisit(id, body.action, { table: body.table });
    if (result.error === "notFound") return errorResponse(404, "notFound");
    if (result.error) return errorResponse(409, result.error);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`[admin] ${body.action} on ${id} failed:`, error);
    return errorResponse(500, "server");
  }
}
