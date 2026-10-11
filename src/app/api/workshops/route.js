import { NextResponse } from "next/server";

import { listPublicWorkshops } from "@/lib/server/classes";
import { errorResponse } from "@/lib/server/http";

/* published classes, upcoming and past, with live seats left */
export async function GET() {
  try {
    return NextResponse.json({ workshops: await listPublicWorkshops() });
  } catch (error) {
    console.error("[workshops] listing failed:", error);
    return errorResponse(500, "server");
  }
}
