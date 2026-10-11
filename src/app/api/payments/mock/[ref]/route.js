import { after, NextResponse } from "next/server";

import { errorResponse, isSameOrigin, readJson } from "@/lib/server/http";
import { actOnMockLink, getMockLink } from "@/lib/server/payments/mock-provider";
import { mockCheckoutEnabled } from "@/lib/server/payments/providers";

/* the built-in test checkout's own page talks to this, as a real
   provider's checkout page talks to its bank */
export async function GET(request, { params }) {
  if (!mockCheckoutEnabled()) return errorResponse(404, "notFound");
  const { ref } = await params;
  const link = await getMockLink(ref);
  if (!link) return errorResponse(404, "notFound");
  return NextResponse.json({
    link: {
      ref: link.id,
      amount: link.amount,
      description: link.description,
      status: link.status,
      expiresAt: link.expiresAt,
      returnUrl: link.returnUrl,
      cancelUrl: link.cancelUrl,
    },
  });
}

/* { action: "pay" | "fail" | "cancel", slow?, twice? } */
export async function POST(request, { params }) {
  if (!mockCheckoutEnabled()) return errorResponse(404, "notFound");
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  const body = await readJson(request);
  const { ref } = await params;
  const result = await actOnMockLink(ref, body?.action, {
    slow: Boolean(body?.slow),
    twice: Boolean(body?.twice),
    origin: request.nextUrl.origin,
    later: after,
  });
  if (!result) return errorResponse(404, "notFound");
  return NextResponse.json(result);
}
