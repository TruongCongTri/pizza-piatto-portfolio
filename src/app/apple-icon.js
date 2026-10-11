import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/* iOS applies its own rounded mask and fills transparency with black, so the
   home-screen icon stays full-bleed square */
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const source = await readFile(join(process.cwd(), "public", "icon.jpg"));
  const src = `data:image/jpeg;base64,${source.toString("base64")}`;

  return new ImageResponse(
    <img src={src} width={size.width} height={size.height} alt="" />,
    size,
  );
}
