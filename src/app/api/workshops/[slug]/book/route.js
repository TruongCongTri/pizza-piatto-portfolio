import { NextResponse } from "next/server";

import { bookSeats } from "@/lib/server/classes";
import {
  clientIp,
  errorResponse,
  isSameOrigin,
  readJson,
  withinRateLimit,
} from "@/lib/server/http";

const STATUS = {
  notFound: 404,
  closed: 409,
  full: 409,
  notEnoughSeats: 409,
  alreadyBooked: 409,
  validation: 422,
  paymentsOff: 503,
  checkoutFailed: 502,
};

/* holds seats for a few minutes and opens a checkout to pay for them.
   A retry with the same `idempotencyKey` gets the first answer back
   instead of a second booking. */
export async function POST(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!(await withinRateLimit(`class-book:${clientIp(request)}`, 12, 10 * 60))) {
    return errorResponse(429, "rateLimited");
  }
  const body = await readJson(request);
  if (!body) return errorResponse(400, "badRequest");

  const { slug } = await params;
  try {
    const result = await bookSeats(slug, body, { siteUrl: request.nextUrl.origin });
    if (result.error) {
      return errorResponse(STATUS[result.error] ?? 400, result.error, {
        fields: result.fields,
        seatsLeft: result.seatsLeft,
      });
    }
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error(`[workshops] booking ${slug} failed:`, error);
    return errorResponse(500, "server");
  }
}
