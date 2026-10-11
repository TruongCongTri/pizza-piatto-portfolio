import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/* round favicons rendered from public/icon.jpg at build time;
   48 is also served as /favicon.ico (Google wants multiples of 48px) */
const SIZES = [32, 48, 192, 512];

export function generateImageMetadata() {
  return SIZES.map((size) => ({
    id: String(size),
    size: { width: size, height: size },
    contentType: "image/png",
  }));
}

export default async function Icon({ id }) {
  const size = Number(await id);
  const source = await readFile(join(process.cwd(), "public", "icon.jpg"));
  const src = `data:image/jpeg;base64,${source.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          borderRadius: "50%",
        }}
      >
        <img src={src} width={size} height={size} alt="" />
      </div>
    ),
    { width: size, height: size },
  );
}
