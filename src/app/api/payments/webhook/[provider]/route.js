import { NextResponse } from "next/server";

import { handlePaymentEvent } from "@/lib/server/classes";
import { errorResponse } from "@/lib/server/http";
import { providerEnabled, providerNamed } from "@/lib/server/payments/providers";

/* payment providers report here, server to server. The signature is
   checked against the raw body, and each event is safe to receive more
   than once. A 2xx tells the provider to stop retrying; a 5xx asks it to
   try again later. */
export async function POST(request, { params }) {
  const { provider: name } = await params;
  const provider = providerNamed(name);
  if (!provider || !providerEnabled(name)) return errorResponse(404, "notFound");

  const raw = await request.text();
  const events = provider.verifyWebhook(raw, request.headers);
  if (!events) {
    console.warn(`[payments] ${name} webhook with a bad signature`);
    return errorResponse(401, "badSignature");
  }
  try {
    for (const event of events) await handlePaymentEvent(name, event);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(`[payments] ${name} webhook failed:`, error);
    return errorResponse(500, "server");
  }
}
