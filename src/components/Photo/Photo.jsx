import Image from "next/image";

/* a photo sent at the size it is shown (next/image: resized, AVIF/WebP,
   lazy unless `preload`). It fills its box like the plain <img> it
   replaces (the global img rule: 100% wide and tall, cover), so
   `width`/`height` only give the browser a shape before it loads; `sizes`
   says how wide it shows, which picks the file. */
export default function Photo({ src, alt = "", sizes = "100vw", width = 1600, height = 1200, ...rest }) {
  if (!src) return null;
  return <Image src={src} alt={alt} sizes={sizes} width={width} height={height} {...rest} />;
}
