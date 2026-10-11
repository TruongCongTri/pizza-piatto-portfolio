import { NextResponse } from "next/server";

import { reconcileClasses } from "@/lib/server/classes";
import { errorResponse } from "@/lib/server/http";
import { safeEqual } from "@/lib/server/session";

/* for a scheduled job (e.g. Vercel Cron): lapsed seat holds expire and
   open payments are checked with the provider, in case a webhook never
   came. Vercel Cron sends "Authorization: Bearer <CRON_SECRET>". */
async function run(request) {
  const secret = process.env.CRON_SECRET;
  const sent = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(sent, `Bearer ${secret}`)) return errorResponse(401, "unauthorized");
  try {
    await reconcileClasses();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[cron] reconcile failed:", error);
    return errorResponse(500, "server");
  }
}

export const GET = run;
export const POST = run;
