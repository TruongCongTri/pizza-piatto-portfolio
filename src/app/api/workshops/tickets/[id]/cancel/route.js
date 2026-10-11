import { NextResponse } from "next/server";

import { cancelByStudent } from "@/lib/server/classes";
import {
  clientIp,
  errorResponse,
  isSameOrigin,
  readJson,
  withinRateLimit,
} from "@/lib/server/http";

/* a student gives up their seats: released if unpaid, refunded if paid
   (until the class's refund cut-off) */
export async function POST(request, { params }) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  if (!(await withinRateLimit(`ticket-cancel:${clientIp(request)}`, 20, 10 * 60))) {
    return errorResponse(429, "rateLimited");
  }
  const body = await readJson(request);
  const { id } = await params;
  try {
    const result = await cancelByStudent(id, body?.token);
    if (result.error === "notFound") return errorResponse(404, "notFound");
    if (result.error) return errorResponse(409, result.error);
    return NextResponse.json(result);
  } catch (error) {
    console.error(`[workshops] cancelling ${id} failed:`, error);
    return errorResponse(500, "server");
  }
}
