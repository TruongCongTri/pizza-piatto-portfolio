/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    /* photos go out resized for the screen, as AVIF or WebP where the
       browser takes them */
    formats: ["image/avif", "image/webp"],
    /* the photos rarely change: a resized copy is kept for 30 days */
    minimumCacheTTL: 60 * 60 * 24 * 30,
    /* class photos uploaded on Vercel live in Vercel Blob */
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com" }],
  },
  async rewrites() {
    return [
      /* crawlers, link previewers and bookmarks often request /favicon.ico
         directly and ignore <link rel="icon">; serve the round PNG there */
      { source: "/favicon.ico", destination: "/icon/48" },
    ];
  },
};

export default nextConfig;
