import { NextResponse } from "next/server";

import { deleteWorkshop, updateWorkshop } from "@/lib/server/classes";
import { errorResponse, isSameOrigin, readJson } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";
import { deleteImage } from "@/lib/server/uploads";

const isStaff = (request) => getSession(request, "admin")?.role === "admin";

/* edits a class; setting status "cancelled" releases and refunds its
   bookings */
export async function PATCH(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!isStaff(request)) return errorResponse(401, "signedOut");

  const body = await readJson(request);
  if (!body) return errorResponse(400, "badRequest");
  const { id } = await params;

  try {
    const result = await updateWorkshop(id, body);
    if (result.errors) return errorResponse(422, "validation", { fields: result.errors });
    if (result.error) return errorResponse(404, result.error);
    return NextResponse.json({ workshop: result.workshop });
  } catch (error) {
    console.error(`[admin] updating class ${id} failed:`, error);
    return errorResponse(500, "server");
  }
}

/* removes a class that was never booked */
export async function DELETE(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!isStaff(request)) return errorResponse(401, "signedOut");
  const { id } = await params;

  try {
    const result = await deleteWorkshop(id);
    if (result.error === "notFound") return errorResponse(404, "notFound");
    if (result.error) return errorResponse(409, result.error);
    await Promise.all(result.images.map(deleteImage));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`[admin] deleting class ${id} failed:`, error);
    return errorResponse(500, "server");
  }
}
