import { readUpload } from "@/lib/server/uploads";

/* class recap photos kept on this server's disk (when there is no Vercel
   Blob store) */
export async function GET(request, { params }) {
  const { path } = await params;
  const bytes = await readUpload(path);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
