import { NextResponse } from "next/server";

import { resumePayment } from "@/lib/server/classes";
import {
  clientIp,
  errorResponse,
  isSameOrigin,
  readJson,
  withinRateLimit,
} from "@/lib/server/http";

const STATUS = {
  notFound: 404,
  notPayable: 409,
  processing: 409,
  paymentsOff: 503,
  checkoutFailed: 502,
};

/* back to checkout while the seats are still held: the open payment link
   is reused, or a new one is made after a failed attempt */
export async function POST(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!(await withinRateLimit(`ticket-pay:${clientIp(request)}`, 20, 10 * 60))) {
    return errorResponse(429, "rateLimited");
  }
  const body = await readJson(request);
  const { id } = await params;
  try {
    const result = await resumePayment(id, body?.token, { siteUrl: request.nextUrl.origin });
    if (result.error) return errorResponse(STATUS[result.error] ?? 400, result.error);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`[workshops] paying ${id} failed:`, error);
    return errorResponse(500, "server");
  }
}
