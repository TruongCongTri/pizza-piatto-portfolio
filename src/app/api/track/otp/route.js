import { NextResponse } from "next/server";

import { hasLocale, defaultLocale } from "@/i18n/config";
import { maskPhone, normalizePhone } from "@/lib/phone";
import {
  clientIp,
  errorResponse,
  isSameOrigin,
  readJson,
  withinRateLimit,
} from "@/lib/server/http";
import { enrollmentsDb } from "@/lib/server/collections";
import { sendCode } from "@/lib/server/otp";
import {
  listReservationsByPhone,
  tempDelete,
  tempSet,
} from "@/lib/server/store";

const RESEND_AFTER_SECONDS = 60;

/* step 1 of looking up bookings: send a one-time code to the phone number
   (or the email on its bookings) */
export async function POST(request) {
  if (!isSameOrigin(request)) return errorResponse(403, "forbidden");
  const body = await readJson(request);
  const phone = normalizePhone(body?.phone);
  if (!phone) return errorResponse(422, "invalidPhone");
  const locale = hasLocale(body.locale) ? body.locale : defaultLocale;

  if (!(await withinRateLimit(`otp:${clientIp(request)}`, 10, 60 * 60))) {
    return errorResponse(429, "rateLimited");
  }

  try {
    /* codes only go to numbers with bookings (a table or a class), so the
       form cannot be used to send texts to strangers */
    const [reservations, classBookings] = await Promise.all([
      listReservationsByPhone(phone),
      enrollmentsDb.listBy("phone", phone),
    ]);
    const bookings = [...reservations, ...classBookings];
    if (!bookings.length) return errorResponse(404, "noReservations");

    const canSend = await tempSet(`otp-wait:${phone}`, 1, RESEND_AFTER_SECONDS, {
      onlyIfAbsent: true,
    });
    if (!canSend) {
      return errorResponse(429, "cooldown", { retryAfter: RESEND_AFTER_SECONDS });
    }

    const latestEmail = bookings
      .filter((booking) => booking.email)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.email;

    const delivery = await sendCode(phone, { email: latestEmail, locale }).catch(
      async (error) => {
        /* nothing went out, so let them try again straight away */
        await tempDelete(`otp-wait:${phone}`);
        throw error;
      },
    );
    if (!delivery) return errorResponse(503, "unavailable");

    return NextResponse.json({
      ...delivery,
      destination: delivery.destination ?? maskPhone(phone),
      retryAfter: RESEND_AFTER_SECONDS,
    });
  } catch (error) {
    console.error("[track] sending a code failed:", error);
    return errorResponse(500, "server");
  }
}
