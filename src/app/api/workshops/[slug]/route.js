import { NextResponse } from "next/server";

import { getPublicWorkshop } from "@/lib/server/classes";
import { errorResponse } from "@/lib/server/http";

/* one class, with live seats left */
export async function GET(request, { params }) {
  const { slug } = await params;
  try {
    const workshop = await getPublicWorkshop(slug);
    if (!workshop) return errorResponse(404, "notFound");
    return NextResponse.json({ workshop });
  } catch (error) {
    console.error(`[workshops] ${slug} failed:`, error);
    return errorResponse(500, "server");
  }
}
