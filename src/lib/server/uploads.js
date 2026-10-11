import "server-only";

import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { DATA_DIR } from "./store";

/* Photos for class recaps. Each upload is re-encoded as a JPEG at most
   1800 px wide, which also drops camera metadata (GPS location included).
   Stored in Vercel Blob when BLOB_READ_WRITE_TOKEN is set (needed on
   Vercel, whose disk is read-only), otherwise in .data/uploads and served
   by /api/uploads. */

const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_WIDTH = 1800;

export class UploadError extends Error {}

export async function saveImage(file, { folder }) {
  if (!file || typeof file.arrayBuffer !== "function") throw new UploadError("noFile");
  if (file.size > MAX_BYTES) throw new UploadError("tooLarge");

  let output;
  let info;
  try {
    ({ data: output, info } = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer({ resolveWithObject: true }));
  } catch {
    throw new UploadError("notAnImage");
  }

  const key = `${folder}/${Date.now()}-${randomBytes(6).toString("hex")}.jpg`;
  const size = { width: info.width, height: info.height };
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`uploads/${key}`, output, {
      access: "public",
      contentType: "image/jpeg",
      addRandomSuffix: false,
    });
    return { url: blob.url, key, store: "blob", ...size };
  }
  if (process.env.VERCEL) {
    throw new Error("Photo uploads on Vercel need Vercel Blob (BLOB_READ_WRITE_TOKEN)");
  }
  await fs.mkdir(path.join(UPLOAD_DIR, folder), { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, key), output);
  return { url: `/api/uploads/${key}`, key, store: "file", ...size };
}

export async function deleteImage(image) {
  if (image.store === "blob") {
    const { del } = await import("@vercel/blob");
    await del(image.url).catch((error) => console.error("[uploads] delete failed:", error));
  } else if (image.store === "file") {
    await fs.unlink(path.join(UPLOAD_DIR, image.key)).catch(() => {});
  }
}

/* a stored upload's bytes, or null; never reads outside the upload folder */
export async function readUpload(parts) {
  const full = path.resolve(UPLOAD_DIR, ...parts);
  if (!full.startsWith(UPLOAD_DIR + path.sep)) return null;
  try {
    return await fs.readFile(full);
  } catch {
    return null;
  }
}
