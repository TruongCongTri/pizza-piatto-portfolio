import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { setRecapImages } from "@/lib/server/classes";
import { errorResponse, isSameOrigin, readJson } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";
import { deleteImage, saveImage, UploadError } from "@/lib/server/uploads";

const isStaff = (request) => getSession(request, "admin")?.role === "admin";
const MAX_IMAGES = 40;
const caption = (value) => String(value ?? "").trim().slice(0, 300);
/* photos shipped with the site (public/classes/...), e.g. brought in from
   the shop's Facebook page by scripts/import-past-classes.mjs */
const STATIC_PHOTO = /^\/classes\/[a-z0-9-]+\/[a-z0-9-]+\.(?:jpg|jpeg|png|webp)$/;
const dimension = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 10_000 ? number : undefined;
};

/* a photo taken during the class, for its recap: an upload (multipart:
   file, captionVi, captionEn), or a photo already on the site (JSON: url,
   width, height, caption: { vi, en }) */
export async function POST(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!isStaff(request)) return errorResponse(401, "signedOut");
  const { id } = await params;
  if (!/^WS-[0-9A-Z]{6}$/.test(id)) return errorResponse(404, "notFound");

  let image;
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = await readJson(request);
    if (!body || !STATIC_PHOTO.test(String(body.url ?? ""))) return errorResponse(400, "badRequest");
    image = {
      url: body.url,
      key: null,
      store: "static",
      width: dimension(body.width),
      height: dimension(body.height),
      caption: { vi: caption(body.caption?.vi), en: caption(body.caption?.en) },
    };
  } else {
    let form;
    try {
      form = await request.formData();
    } catch {
      return errorResponse(400, "badRequest");
    }
    try {
      image = {
        ...(await saveImage(form.get("file"), { folder: `classes/${id}` })),
        caption: { vi: caption(form.get("captionVi")), en: caption(form.get("captionEn")) },
      };
    } catch (error) {
      if (error instanceof UploadError) return errorResponse(422, error.message);
      console.error(`[admin] photo for class ${id} failed:`, error);
      return errorResponse(500, "server");
    }
  }
  image = { id: `IMG-${randomBytes(5).toString("hex")}`, ...image, addedAt: new Date().toISOString() };

  let full = false;
  const workshop = await setRecapImages(id, (images) => {
    if (images.length >= MAX_IMAGES) {
      full = true;
      return images;
    }
    return [...images, image];
  });
  if (!workshop || full) {
    await deleteImage(image);
    return workshop ? errorResponse(409, "tooManyImages") : errorResponse(404, "notFound");
  }
  return NextResponse.json({ image, workshop }, { status: 201 });
}
