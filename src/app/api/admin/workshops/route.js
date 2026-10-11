import { NextResponse } from "next/server";

import { createWorkshop, deskSnapshot, deskVersion, reconcileClasses } from "@/lib/server/classes";
import { demoToolsEnabled } from "@/lib/server/demo";
import { errorResponse, isSameOrigin, readJson } from "@/lib/server/http";
import { activeProvider } from "@/lib/server/payments/providers";
import { getSession } from "@/lib/server/session";
import { tempSet } from "@/lib/server/store";

const isStaff = (request) => getSession(request, "admin")?.role === "admin";

/* how often an open class desk sweeps lapsed holds and unconfirmed
   payments, as a fallback for sites without a cron job */
const SWEEP_SECONDS = 30;

/* every class, booking and payment, for the class desk. The desk asks when
   it opens and when told something changed (/api/admin/events), sending
   the version it has; if nothing changed it gets "unchanged". */
export async function GET(request) {
  if (!isStaff(request)) return errorResponse(401, "signedOut");

  try {
    if (await tempSet("sweep:classes", 1, SWEEP_SECONDS, { onlyIfAbsent: true })) {
      await reconcileClasses().catch((error) => console.error("[admin] class sweep failed:", error));
    }
    const version = await deskVersion();
    /* which checkout new bookings use, and whether sample data can be loaded */
    const meta = { provider: activeProvider()?.name ?? null, demoTools: demoToolsEnabled };
    if (request.nextUrl.searchParams.get("version") === version) {
      return NextResponse.json({ version, unchanged: true, ...meta });
    }
    return NextResponse.json({ version, ...meta, ...(await deskSnapshot()) });
  } catch (error) {
    console.error("[admin] listing classes failed:", error);
    return errorResponse(500, "server");
  }
}

/* a new class (a draft until it is published). `demo: true` marks a test
   class, cleared with the sample data; only where the demo tools are on. */
export async function POST(request) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!isStaff(request)) return errorResponse(401, "signedOut");

  const body = await readJson(request);
  if (!body) return errorResponse(400, "badRequest");

  try {
    const result = await createWorkshop({ ...body, demo: demoToolsEnabled && body.demo === true });
    if (result.errors) return errorResponse(422, "validation", { fields: result.errors });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("[admin] creating a class failed:", error);
    return errorResponse(500, "server");
  }
}
