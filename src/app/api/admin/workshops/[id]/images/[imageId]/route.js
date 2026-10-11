import { NextResponse } from "next/server";

import { setRecapImages } from "@/lib/server/classes";
import { errorResponse, isSameOrigin, readJson } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";
import { deleteImage } from "@/lib/server/uploads";

const isStaff = (request) => getSession(request, "admin")?.role === "admin";
const caption = (value) => String(value ?? "").trim().slice(0, 300);

/* { caption: { vi, en } } and/or { move: -1 | 1 } (earlier / later) */
export async function PATCH(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!isStaff(request)) return errorResponse(401, "signedOut");
  const body = await readJson(request);
  if (!body) return errorResponse(400, "badRequest");
  const { id, imageId } = await params;

  let found = false;
  const workshop = await setRecapImages(id, (images) => {
    const index = images.findIndex((image) => image.id === imageId);
    if (index < 0) return images;
    found = true;
    const next = [...images];
    if (body.caption) {
      next[index] = {
        ...next[index],
        caption: { vi: caption(body.caption.vi), en: caption(body.caption.en) },
      };
    }
    const target = index + (body.move === -1 ? -1 : body.move === 1 ? 1 : 0);
    if (target !== index && target >= 0 && target < next.length) {
      [next[index], next[target]] = [next[target], next[index]];
    }
    return next;
  });
  if (!workshop || !found) return errorResponse(404, "notFound");
  return NextResponse.json({ workshop });
}

export async function DELETE(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!isStaff(request)) return errorResponse(401, "signedOut");
  const { id, imageId } = await params;

  let removed = null;
  const workshop = await setRecapImages(id, (images) => {
    removed = images.find((image) => image.id === imageId) ?? null;
    return images.filter((image) => image.id !== imageId);
  });
  if (!workshop || !removed) return errorResponse(404, "notFound");
  await deleteImage(removed);
  return NextResponse.json({ workshop });
}
