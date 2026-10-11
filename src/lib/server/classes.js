import "server-only";

import { randomBytes, randomInt } from "node:crypto";

import { defaultLocale, hasLocale } from "@/i18n/config";
import { getSiteUrl } from "@/i18n/metadata";
import { normalizePhone } from "@/lib/phone";
import {
  canMoveEnrollment,
  canMovePayment,
  isPaymentOpen,
  isPaymentPaid,
  ticketStatus,
} from "@/lib/payments";
import {
  checkInSession,
  HOLD_MINUTES,
  isBookable,
  localized,
  MAX_SEATS_PER_BOOKING,
  PROCESSING_HOLD_MINUTES,
  refundClosesAt,
  seatsLeft,
  slugify,
  workshopPhase,
  workshopStart,
} from "@/lib/workshops";

import {
  sendClassAlert,
  sendClassConfirmation,
  sendClassRefundNotice,
} from "./class-emails";
import { enrollmentsDb, paymentsDb, workshopsDb } from "./collections";
import { activeProvider, providerNamed } from "./payments/providers";
import { safeEqual } from "./session";
import { tempGet, tempSet, withLock } from "./store";

/* Pizza classes: seats, bookings and their payments.

   Seats, bookings and payments of one class only ever change inside
   withLock(`class:<id>`), so two students can never pay for the last seat
   and a webhook can never race a cancellation. Talking to the payment
   provider happens outside that lock (it can be slow); a payment link is
   created under its own `pay:<booking>` lock so one booking never has two
   live links. */

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IDEMPOTENCY_TTL = 24 * 3600;
const EVENT_TTL = 30 * 24 * 3600;
const CHECK_INTERVAL = 5;
const LOG_LIMIT = 40;

const code = (prefix, length = 6) =>
  prefix + Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
const nowIso = () => new Date().toISOString();
const classLock = (workshopId, task) => withLock(`class:${workshopId}`, task);

/* ---------- moving statuses (always through the state machines) ---------- */

/* the payment in its new status, or null when that move isn't allowed (a
   stale or out-of-order message); every move is written to its log */
function movePayment(payment, status, detail = {}) {
  if (!canMovePayment(payment.status, status)) return null;
  if (payment.status === status) return payment;
  const at = nowIso();
  return {
    ...payment,
    ...detail.fields,
    status,
    updatedAt: at,
    ...(status === "succeeded" && !payment.paidAt && { paidAt: at }),
    log: [
      ...(payment.log ?? []),
      { at, from: payment.status, to: status, source: detail.source ?? "system", note: detail.note ?? null },
    ].slice(-LOG_LIMIT),
  };
}

function moveEnrollment(enrollment, status, detail = {}) {
  if (!canMoveEnrollment(enrollment.status, status)) return null;
  if (enrollment.status === status) return enrollment;
  const at = nowIso();
  return {
    ...enrollment,
    ...detail.fields,
    status,
    updatedAt: at,
    log: [
      ...(enrollment.log ?? []),
      { at, from: enrollment.status, to: status, by: detail.by ?? "system", note: detail.note ?? null },
    ].slice(-LOG_LIMIT),
  };
}

/* ---------- classes (the desk edits them) ---------- */

const text = (value, max) => String(value ?? "").trim().slice(0, max);
const pair = (field, max) => ({ vi: text(field?.vi, max), en: text(field?.en, max) });
const lines = (field) => ({
  vi: String(field?.vi ?? "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 12),
  en: String(field?.en ?? "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 12),
});
const intIn = (value, min, max, fallback) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};

/* a class as typed into the desk: { values, errors } */
export function cleanWorkshop(input) {
  const errors = {};
  const sessions = (Array.isArray(input.sessions) ? input.sessions : [])
    .map((session) => ({
      date: text(session?.date, 10),
      start: text(session?.start, 5),
      end: text(session?.end, 5),
    }))
    .filter((session) => session.date || session.start || session.end);
  sessions.forEach((session) => {
    /* a real calendar date; times both given (start before end) or both
       left out, for a past class whose hours aren't known */
    const [year, month, day] = session.date.split("-").map(Number);
    const isDate =
      /^\d{4}-\d{2}-\d{2}$/.test(session.date) &&
      new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === session.date;
    const untimed = !session.start && !session.end;
    const timed =
      /^\d{2}:\d{2}$/.test(session.start) &&
      /^\d{2}:\d{2}$/.test(session.end) &&
      session.start < session.end;
    if (!isDate || !(untimed || timed)) errors.sessions = "invalid";
  });
  sessions.sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

  const values = {
    title: pair(input.title, 120),
    summary: pair(input.summary, 300),
    description: pair(input.description, 4000),
    learn: lines(input.learn),
    sessions,
    capacity: intIn(input.capacity, 0, 60, null),
    price: intIn(input.price, 0, 100_000_000, null),
    currency: "VND",
    instructor: text(input.instructor, 80),
    location: pair(input.location, 200),
    cover: text(input.cover, 500),
    bookingClosesHours: intIn(input.bookingClosesHours, 0, 720, 24),
    refundUntilHours: intIn(input.refundUntilHours, 0, 720, 72),
    status: ["draft", "published", "cancelled"].includes(input.status) ? input.status : "draft",
    recap: { text: pair(input.recap?.text, 6000) },
    source: text(input.source, 500),
  };

  if (!values.title.vi && !values.title.en) errors.title = "required";
  if (values.capacity === null) errors.capacity = "invalid";
  if (values.price === null) errors.price = "invalid";
  if (values.cover && !/^(\/|https:\/\/)/.test(values.cover)) errors.cover = "invalid";
  return { values, errors };
}

/* slugs that page and API routes of their own already use */
const RESERVED_SLUGS = new Set(["ticket", "tickets"]);

async function uniqueSlug(base, ownId) {
  const root = base && !RESERVED_SLUGS.has(base) ? base : `pizza-class${base ? `-${base}` : ""}`;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const slug = attempt ? `${root}-${attempt + 1}` : root;
    const [taken] = await workshopsDb.listBy("slug", slug);
    if (!taken || taken.id === ownId) return slug;
  }
  return `${root}-${randomBytes(3).toString("hex")}`;
}

export async function createWorkshop(input) {
  const { values, errors } = cleanWorkshop(input);
  if (Object.keys(errors).length) return { errors };
  const at = nowIso();
  const slugBase = slugify(
    `${values.title.vi || values.title.en} ${values.sessions[0]?.date ?? ""}`,
  );
  const workshop = {
    id: code("WS-"),
    slug: await uniqueSlug(slugBase),
    ...values,
    recap: { ...values.recap, images: [] },
    demo: Boolean(input.demo),
    createdAt: at,
    updatedAt: at,
  };
  await workshopsDb.insert(workshop);
  return { workshop };
}

/* edits a class; cancelling it releases unpaid seats and refunds paid ones */
export async function updateWorkshop(id, input) {
  const { values, errors } = cleanWorkshop(input);
  if (Object.keys(errors).length) return { errors };

  const result = await classLock(id, async () => {
    const current = await workshopsDb.get(id);
    if (!current) return { error: "notFound" };
    const updated = {
      ...current,
      ...values,
      recap: { ...current.recap, text: values.recap.text },
      updatedAt: nowIso(),
    };
    await workshopsDb.put(updated, current);

    if (values.status !== "cancelled" || current.status === "cancelled") {
      return { workshop: updated, effects: [] };
    }
    /* the class is off: every booking is released or refunded */
    const effects = [];
    for (const enrollment of await enrollmentsDb.listBy("workshopId", id)) {
      if (enrollment.status === "pending_payment") {
        const cancelled = moveEnrollment(enrollment, "cancelled", { by: "staff", note: "classCancelled" });
        await enrollmentsDb.put(cancelled, enrollment);
        effects.push({ type: "closeLinks", enrollment: cancelled });
      } else if (enrollment.status === "confirmed") {
        effects.push(...(await startRefund(enrollment, updated, "classCancelled", "staff")));
      }
    }
    return { workshop: updated, effects };
  });

  if (result.effects) await runEffects(result.effects);
  return result;
}

/* only a class nobody ever booked can be deleted (others are cancelled
   instead, which keeps their payment records); returns its recap photos so
   they can be removed too */
export async function deleteWorkshop(id) {
  return classLock(id, async () => {
    const current = await workshopsDb.get(id);
    if (!current) return { error: "notFound" };
    if ((await enrollmentsDb.listBy("workshopId", id)).length) return { error: "hasBookings" };
    await workshopsDb.remove(current);
    return { images: current.recap?.images ?? [] };
  });
}

export async function setRecapImages(id, change) {
  return classLock(id, async () => {
    const current = await workshopsDb.get(id);
    if (!current) return null;
    const images = change(current.recap?.images ?? []);
    const updated = { ...current, recap: { ...current.recap, images }, updatedAt: nowIso() };
    await workshopsDb.put(updated, current);
    return updated;
  });
}

/* ---------- what visitors see ---------- */

export function publicWorkshop(workshop, enrollments, now = Date.now()) {
  const left = seatsLeft(workshop, enrollments, now);
  return {
    slug: workshop.slug,
    title: workshop.title,
    summary: workshop.summary,
    description: workshop.description,
    learn: workshop.learn,
    sessions: workshop.sessions,
    capacity: workshop.capacity,
    price: workshop.price,
    currency: workshop.currency,
    instructor: workshop.instructor,
    location: workshop.location,
    cover: workshop.cover,
    recap: workshop.recap,
    status: workshop.status,
    phase: workshopPhase(workshop, now),
    seatsLeft: left,
    bookable: isBookable(workshop, now) && left > 0,
    refundUntilHours: workshop.refundUntilHours,
    bookingClosesHours: workshop.bookingClosesHours,
  };
}

export async function listPublicWorkshops() {
  const now = Date.now();
  const workshops = (await workshopsDb.list()).filter(
    (workshop) => workshop.status !== "draft" && workshop.sessions?.length,
  );
  const views = await Promise.all(
    workshops.map(async (workshop) =>
      publicWorkshop(workshop, await enrollmentsDb.listBy("workshopId", workshop.id), now),
    ),
  );
  return views.sort((a, b) => a.sessions[0].date.localeCompare(b.sessions[0].date));
}

export async function getPublicWorkshop(slug) {
  const [workshop] = await workshopsDb.listBy("slug", slug);
  if (!workshop || workshop.status === "draft") return null;
  return publicWorkshop(workshop, await enrollmentsDb.listBy("workshopId", workshop.id));
}

/* ---------- booking a seat ---------- */

function cleanBooking(input, workshop) {
  const values = {
    name: text(input.name, 80),
    phone: normalizePhone(input.phone),
    email: text(input.email, 254).toLowerCase(),
    seats: Number(input.seats),
    locale: hasLocale(input.locale) ? input.locale : defaultLocale,
  };
  const errors = {};
  if (!values.name) errors.name = "required";
  if (!String(input.phone ?? "").trim()) errors.phone = "required";
  else if (!values.phone) errors.phone = "invalidPhone";
  if (values.email && !EMAIL_PATTERN.test(values.email)) errors.email = "invalidEmail";
  const most = Math.min(MAX_SEATS_PER_BOOKING, workshop.capacity || 0);
  if (!Number.isInteger(values.seats) || values.seats < 1 || values.seats > most) {
    errors.seats = "invalid";
  }
  return { values, errors };
}

const ticketPath = (enrollment, locale = enrollment.locale) =>
  `/${locale}/workshops/ticket/${enrollment.id}?t=${enrollment.accessToken}`;

/* holds seats and opens a checkout. Returns { ticketPath, checkoutUrl }
   or { error, ... }. `idempotencyKey` makes a repeated submit (double
   click, retry after a timeout) return the first result instead of
   booking twice. */
export async function bookSeats(slug, input, { siteUrl }) {
  const [listed] = await workshopsDb.listBy("slug", slug);
  if (!listed || listed.status !== "published") return { error: "notFound" };
  const provider = activeProvider();
  if (!provider) return { error: "paymentsOff" };

  const { values, errors } = cleanBooking(input, listed);
  if (Object.keys(errors).length) return { error: "validation", fields: errors };
  const key = text(input.idempotencyKey, 80);

  const held = await classLock(listed.id, async () => {
    if (key) {
      const seen = await tempGet(`idem:book:${key}`);
      if (seen) return { replay: seen };
    }
    const workshop = await workshopsDb.get(listed.id);
    const now = Date.now();
    if (!isBookable(workshop, now)) return { error: "closed" };

    let enrollments = await enrollmentsDb.listBy("workshopId", workshop.id);
    const effects = await expireLapsedHolds(enrollments, now);
    enrollments = await enrollmentsDb.listBy("workshopId", workshop.id);

    const mine = enrollments.filter((enrollment) => enrollment.phone === values.phone);
    if (
      !input.allowAdditional &&
      mine.some((enrollment) => ["confirmed", "attended"].includes(enrollment.status))
    ) {
      return { error: "alreadyBooked", effects };
    }
    /* an earlier unpaid booking by the same number gives way to this one, so
       one person never holds two sets of seats or two live payment links */
    for (const enrollment of mine.filter((item) => item.status === "pending_payment")) {
      const cancelled = moveEnrollment(enrollment, "cancelled", { by: "student", note: "superseded" });
      await enrollmentsDb.put(cancelled, enrollment);
      effects.push({ type: "closeLinks", enrollment: cancelled });
    }
    enrollments = await enrollmentsDb.listBy("workshopId", workshop.id);

    const left = seatsLeft(workshop, enrollments, now);
    if (values.seats > left) {
      return { error: left ? "notEnoughSeats" : "full", seatsLeft: left, effects };
    }

    const at = new Date(now).toISOString();
    let enrollment = null;
    for (let attempt = 0; attempt < 5 && !enrollment; attempt += 1) {
      const candidate = {
        id: code("PC-"),
        workshopId: workshop.id,
        ...values,
        email: values.email || null,
        amount: values.seats * workshop.price,
        currency: workshop.currency,
        status: "pending_payment",
        holdExpiresAt: new Date(now + HOLD_MINUTES * 60_000).toISOString(),
        accessToken: randomBytes(18).toString("base64url"),
        paymentId: null,
        demo: Boolean(workshop.demo),
        createdAt: at,
        updatedAt: at,
        log: [{ at, from: null, to: "pending_payment", by: "student", note: null }],
      };
      if (await enrollmentsDb.insert(candidate)) enrollment = candidate;
    }
    if (!enrollment) throw new Error("Could not allocate a booking code");

    const result = { ticketPath: ticketPath(enrollment), ticketId: enrollment.id };
    if (key) await tempSet(`idem:book:${key}`, result, IDEMPOTENCY_TTL);
    return { enrollment, workshop, result, effects };
  });

  if (held.effects?.length) await runEffects(held.effects);
  if (held.replay) return held.replay;
  if (held.error) return { error: held.error, seatsLeft: held.seatsLeft };

  try {
    const payment = await startPayment(held.enrollment, held.workshop, provider, siteUrl);
    const result = { ...held.result, checkoutUrl: payment.checkoutUrl };
    if (key) await tempSet(`idem:book:${key}`, result, IDEMPOTENCY_TTL);
    return result;
  } catch (error) {
    console.error(`[classes] no checkout for ${held.enrollment.id}:`, error);
    /* nothing to pay with: give the seats back straight away */
    await classLock(held.workshop.id, async () => {
      const current = await enrollmentsDb.get(held.enrollment.id);
      const cancelled = current && moveEnrollment(current, "cancelled", { note: "checkoutFailed" });
      if (cancelled) await enrollmentsDb.put(cancelled, current);
    });
    return { error: "checkoutFailed" };
  }
}

/* one live payment link per booking: an open one is reused, a new one is
   only made when the last attempt failed, was cancelled or expired */
async function startPayment(enrollment, workshop, provider, siteUrl) {
  return withLock(`pay:${enrollment.id}`, async () => {
    const payments = await paymentsDb.listBy("enrollmentId", enrollment.id);
    const processing = payments.find((payment) => payment.status === "processing");
    if (processing) return processing;
    const open = payments.find(
      (payment) =>
        payment.status === "requires_payment" &&
        payment.provider === provider.name &&
        payment.checkoutUrl &&
        Date.parse(payment.expiresAt) > Date.now() + 30_000,
    );
    if (open) return open;

    const at = nowIso();
    const payment = {
      id: code("PAY-", 10),
      enrollmentId: enrollment.id,
      workshopId: workshop.id,
      provider: provider.name,
      providerRef: null,
      amount: enrollment.amount,
      currency: enrollment.currency,
      status: "requires_payment",
      checkoutUrl: null,
      expiresAt: enrollment.holdExpiresAt,
      createdAt: at,
      updatedAt: at,
      log: [{ at, from: null, to: "requires_payment", source: "system", note: null }],
    };
    await paymentsDb.insert(payment);

    const ticketUrl = `${siteUrl}${ticketPath(enrollment)}`;
    try {
      const created = await provider.createPayment({
        payment,
        description: enrollment.id.replace("-", ""),
        returnUrl: ticketUrl,
        cancelUrl: `${ticketUrl}&checkout=cancelled`,
        expiresAt: Date.parse(enrollment.holdExpiresAt),
        locale: enrollment.locale,
        siteUrl,
        buyer: { name: enrollment.name, email: enrollment.email, phone: enrollment.phone },
        item: {
          name: localized(workshop.title, enrollment.locale).slice(0, 50),
          quantity: enrollment.seats,
          price: workshop.price,
        },
      });
      const ready = { ...payment, providerRef: created.providerRef, checkoutUrl: created.checkoutUrl };
      await paymentsDb.put(ready, payment);
      return ready;
    } catch (error) {
      const failed = movePayment(payment, "failed", { note: "checkoutFailed" });
      await paymentsDb.put(failed, payment);
      throw error;
    }
  });
}

/* pending bookings whose hold ran out become "expired" (inside the class
   lock); their payment links are closed afterwards */
async function expireLapsedHolds(enrollments, now) {
  const effects = [];
  for (const enrollment of enrollments) {
    if (enrollment.status === "pending_payment" && Date.parse(enrollment.holdExpiresAt) <= now) {
      const expired = moveEnrollment(enrollment, "expired", { note: "holdLapsed" });
      await enrollmentsDb.put(expired, enrollment);
      effects.push({ type: "closeLinks", enrollment: expired });
    }
  }
  return effects;
}

/* ---------- payment events (webhooks and checks) ---------- */

/* applies what the provider says about a payment. Safe to call any number
   of times with the same news: a repeated event finds nothing left to do. */
export async function handlePaymentEvent(providerName, event, { source = "webhook" } = {}) {
  const [payment] = await paymentsDb.listBy("providerRef", event.providerRef);
  if (!payment || payment.provider !== providerName) return { ignored: "unknownPayment" };
  if (event.eventId && (await tempGet(`evt:${providerName}:${event.eventId}`))) {
    return { ignored: "seenBefore" };
  }

  const outcome = await classLock(payment.workshopId, async () => {
    const current = await paymentsDb.get(payment.id);
    let status = event.status;
    let note = null;
    /* part of the money: wait for the rest before calling it paid */
    if (status === "succeeded" && event.amount != null && event.amount < current.amount) {
      status = "processing";
      note = `partial ${event.amount}/${current.amount}`;
    }
    const moved = movePayment(current, status, { source, note });
    if (!moved) return { ignored: "staleEvent", effects: [] };
    if (moved !== current) await paymentsDb.put(moved, current);
    if (moved.status === "processing" && moved !== current) await extendHold(moved);
    const effects = moved.status === "succeeded" ? await settlePaid(moved) : [];
    if (event.eventId) await tempSet(`evt:${providerName}:${event.eventId}`, 1, EVENT_TTL);
    return { payment: moved, effects };
  });

  if (outcome.effects?.length) await runEffects(outcome.effects);
  return outcome;
}

/* the bank is confirming (or part of the money is in): a still-valid hold
   is stretched so the seat doesn't lapse mid-payment. A hold that already
   ran out is left alone, since its seat may have gone to someone else. */
async function extendHold(payment) {
  const enrollment = await enrollmentsDb.get(payment.enrollmentId);
  const now = Date.now();
  if (enrollment?.status !== "pending_payment") return;
  const held = Date.parse(enrollment.holdExpiresAt);
  const until = now + PROCESSING_HOLD_MINUTES * 60_000;
  if (held <= now || held >= until) return;
  await enrollmentsDb.put(
    { ...enrollment, holdExpiresAt: new Date(until).toISOString(), updatedAt: nowIso() },
    enrollment,
  );
}

/* money has arrived for a booking: confirm the seat if there is one to
   give, otherwise send the money back (inside the class lock) */
async function settlePaid(payment) {
  const enrollment = await enrollmentsDb.get(payment.enrollmentId);
  const workshop = await workshopsDb.get(payment.workshopId);
  /* this payment already settled the booking: a repeated message */
  if (enrollment.paymentId === payment.id) return [];

  if (["confirmed", "attended", "refund_pending", "refunded"].includes(enrollment.status)) {
    /* paid twice (an old link paid after a newer one): refund the extra */
    return refundExtraPayment(payment, enrollment, workshop, "duplicatePayment");
  }
  if (workshop.status === "cancelled") {
    return startRefund({ ...enrollment, paymentId: payment.id }, workshop, "classCancelled", "system", payment);
  }
  /* given up on purpose (by the student, the shop, or a newer booking from
     the same number) before the money came: it goes back */
  if (enrollment.status === "cancelled") {
    return startRefund({ ...enrollment, paymentId: payment.id }, workshop, "paidAfterCancel", "system", payment);
  }

  const now = Date.now();
  const holdValid =
    enrollment.status === "pending_payment" && Date.parse(enrollment.holdExpiresAt) > now;
  const others = (await enrollmentsDb.listBy("workshopId", workshop.id)).filter(
    (other) => other.id !== enrollment.id,
  );
  if (holdValid || seatsLeft(workshop, others, now) >= enrollment.seats) {
    const confirmed = moveEnrollment(enrollment, "confirmed", {
      fields: { paymentId: payment.id, paidAt: payment.paidAt ?? nowIso() },
      note: holdValid ? null : "paidLate",
    });
    await enrollmentsDb.put(confirmed, enrollment);
    return [{ type: "confirmed", enrollment: confirmed, payment, workshop }];
  }
  /* paid after the hold ran out and the seat went to someone else */
  return startRefund({ ...enrollment, paymentId: payment.id }, workshop, "noSeatLeft", "system", payment);
}

/* a booking's own seat is given up and its payment refunded (inside the
   class lock); the refund itself is requested afterwards */
async function startRefund(enrollment, workshop, reason, by, paymentOverride) {
  const payment = paymentOverride ?? (await paymentsDb.get(enrollment.paymentId));
  const stored = await enrollmentsDb.get(enrollment.id);
  const refunding = moveEnrollment({ ...stored, paymentId: payment.id }, "refund_pending", {
    by,
    note: reason,
    fields: { refundReason: reason },
  });
  if (refunding) await enrollmentsDb.put(refunding, stored);
  const movedPayment = movePayment(payment, "refund_pending", {
    note: reason,
    fields: { refundReason: reason },
  });
  if (movedPayment && movedPayment !== payment) await paymentsDb.put(movedPayment, payment);
  return [
    {
      type: "refund",
      enrollment: refunding ?? stored,
      payment: movedPayment ?? payment,
      workshop,
      reason,
      ownSeat: true,
    },
  ];
}

async function refundExtraPayment(payment, enrollment, workshop, reason) {
  const moved = movePayment(payment, "refund_pending", { note: reason, fields: { refundReason: reason } });
  if (moved && moved !== payment) await paymentsDb.put(moved, payment);
  return [{ type: "refund", enrollment, payment: moved ?? payment, workshop, reason, ownSeat: false }];
}

/* side effects decided inside a lock, carried out after it: closing
   payment links, asking the provider for refunds, emails */
async function runEffects(effects) {
  for (const effect of effects) {
    try {
      if (effect.type === "closeLinks") await closeOpenPayments(effect.enrollment);
      if (effect.type === "confirmed") {
        await sendClassConfirmation(effect.enrollment, effect.workshop, effect.payment);
      }
      if (effect.type === "refund") await requestRefund(effect);
    } catch (error) {
      console.error(`[classes] ${effect.type} for ${effect.enrollment?.id} failed:`, error);
    }
  }
}

/* closes a booking's unpaid payment links at the provider, so nobody pays
   for seats that were released; one that turns out to be paid already is
   handled like any late payment */
async function closeOpenPayments(enrollment) {
  for (const payment of await paymentsDb.listBy("enrollmentId", enrollment.id)) {
    if (payment.status !== "requires_payment" || !payment.providerRef) continue;
    const provider = providerNamed(payment.provider);
    const seen = await provider.fetchPayment(payment).catch(() => null);
    if (seen && seen.status !== "requires_payment" && seen.status !== "expired") {
      await handlePaymentEvent(payment.provider, { providerRef: payment.providerRef, status: seen.status, amount: seen.amountPaid || undefined }, { source: "check" });
      continue;
    }
    await provider.cancelPayment(payment).catch((error) =>
      console.error(`[classes] closing ${payment.id} failed:`, error),
    );
    await classLock(payment.workshopId, async () => {
      const current = await paymentsDb.get(payment.id);
      const closed = movePayment(current, enrollment.status === "expired" ? "expired" : "canceled", {
        note: enrollment.status,
      });
      if (closed && closed !== current) await paymentsDb.put(closed, current);
    });
  }
}

/* asks the provider for the money back; refunds it can't make (bank
   transfers) wait for the shop to mark them done */
async function requestRefund({ enrollment, payment, workshop, reason, ownSeat }) {
  const provider = providerNamed(payment.provider);
  const result = await provider.refund(payment, payment.amount, reason).catch((error) => {
    console.error(`[classes] refund for ${payment.id} failed:`, error);
    return { status: "refund_pending", manual: true };
  });
  if (result.status === "refunded") {
    await finishRefund(payment.id, { by: "provider", refundRef: result.refundRef });
  } else {
    await sendClassAlert("refundNeeded", { enrollment, payment, workshop, reason });
    await sendClassRefundNotice(enrollment, workshop, payment, { done: false, reason, ownSeat });
  }
}

/* a refund has been paid out (by the provider, or by the shop by hand) */
export async function finishRefund(paymentId, { by, refundRef = null }) {
  const payment = await paymentsDb.get(paymentId);
  if (!payment) return { error: "notFound" };
  const outcome = await classLock(payment.workshopId, async () => {
    const current = await paymentsDb.get(paymentId);
    /* only a refund under way can be finished, once (no second email) */
    if (current.status !== "refund_pending") return { error: "notAllowed" };
    const refunded = movePayment(current, "refunded", {
      source: by,
      fields: { refundedAt: nowIso(), refundRef },
    });
    await paymentsDb.put(refunded, current);
    const enrollment = await enrollmentsDb.get(current.enrollmentId);
    let updated = enrollment;
    /* the booking's own seat payment: the booking is refunded too */
    if (enrollment.status === "refund_pending" && enrollment.paymentId === paymentId) {
      updated = moveEnrollment(enrollment, "refunded", { by });
      await enrollmentsDb.put(updated, enrollment);
    }
    return {
      payment: refunded,
      enrollment: updated,
      workshop: await workshopsDb.get(current.workshopId),
      ownSeat: enrollment.paymentId === paymentId,
    };
  });
  if (outcome.payment) {
    await sendClassRefundNotice(outcome.enrollment, outcome.workshop, outcome.payment, {
      done: true,
      reason: outcome.payment.refundReason,
      ownSeat: outcome.ownSeat,
    }).catch((error) => console.error("[classes] refund email failed:", error));
  }
  return outcome;
}

/* asks the provider how open payments stand, in case a webhook is late or
   lost; at most every few seconds per payment */
async function checkOpenPayments(enrollment) {
  for (const payment of await paymentsDb.listBy("enrollmentId", enrollment.id)) {
    if (!isPaymentOpen(payment.status) || !payment.providerRef) continue;
    if (!(await tempSet(`check:${payment.id}`, 1, CHECK_INTERVAL, { onlyIfAbsent: true }))) continue;
    const seen = await providerNamed(payment.provider)
      .fetchPayment(payment)
      .catch(() => null);
    if (seen && seen.status !== payment.status) {
      await handlePaymentEvent(
        payment.provider,
        { providerRef: payment.providerRef, status: seen.status, amount: seen.amountPaid || undefined },
        { source: "check" },
      );
    }
  }
}

/* ---------- the student's ticket ---------- */

async function enrollmentForToken(id, token) {
  const enrollment = await enrollmentsDb.get(id);
  if (!enrollment || !token || !safeEqual(enrollment.accessToken, token)) return null;
  return enrollment;
}

function ticketView(enrollment, workshop, payments, now = Date.now()) {
  const own = payments.find((payment) => payment.id === enrollment.paymentId) ?? null;
  const latest =
    own ?? [...payments].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
  const status = ticketStatus(enrollment, latest, now);
  const extra = payments.filter(
    (payment) => payment.id !== enrollment.paymentId && isPaymentPaid(payment.status),
  );
  return {
    id: enrollment.id,
    name: enrollment.name,
    phone: enrollment.phone,
    email: enrollment.email,
    seats: enrollment.seats,
    amount: enrollment.amount,
    currency: enrollment.currency,
    status,
    holdExpiresAt: enrollment.holdExpiresAt,
    paidAt: enrollment.paidAt ?? null,
    refundReason: enrollment.refundReason ?? null,
    payment: latest && {
      id: latest.id,
      status: latest.status,
      provider: latest.provider,
      paidAt: latest.paidAt ?? null,
    },
    /* extra payments being (or already) sent back */
    extraPayments: extra.map((payment) => ({ id: payment.id, amount: payment.amount, status: payment.status })),
    canPay: status === "awaitingPayment" || status === "paymentFailed",
    canCancel:
      status === "awaitingPayment" ||
      status === "paymentFailed" ||
      (status === "paid" && now < refundClosesAt(workshop)),
    refundUntil: new Date(refundClosesAt(workshop)).toISOString(),
    workshop: publicWorkshop(workshop, [], now),
  };
}

/* the ticket, after asking the provider about anything still open */
export async function getTicket(id, token) {
  let enrollment = await enrollmentForToken(id, token);
  if (!enrollment) return null;
  if (enrollment.status === "pending_payment") {
    await checkOpenPayments(enrollment);
    const now = Date.now();
    if (Date.parse(enrollment.holdExpiresAt) <= now) {
      const effects = await classLock(enrollment.workshopId, async () =>
        expireLapsedHolds([await enrollmentsDb.get(id)], now),
      );
      await runEffects(effects);
    }
    enrollment = await enrollmentsDb.get(id);
  }
  const workshop = await workshopsDb.get(enrollment.workshopId);
  return ticketView(enrollment, workshop, await paymentsDb.listBy("enrollmentId", id));
}

/* a phone number's class bookings as tickets, each with its own link, for
   the guest who proved the number on the "my bookings" page */
export async function classBookingsByPhone(phone) {
  const now = Date.now();
  const views = [];
  for (const enrollment of await enrollmentsDb.listBy("phone", phone)) {
    const workshop = await workshopsDb.get(enrollment.workshopId);
    if (!workshop) continue;
    const payments = await paymentsDb.listBy("enrollmentId", enrollment.id);
    views.push({
      ...ticketView(enrollment, workshop, payments, now),
      ticketPath: ticketPath(enrollment),
      createdAt: enrollment.createdAt,
    });
  }
  return views;
}

/* back to checkout from the ticket (the first try failed or was closed) */
export async function resumePayment(id, token, { siteUrl }) {
  const enrollment = await enrollmentForToken(id, token);
  if (!enrollment) return { error: "notFound" };
  if (enrollment.status !== "pending_payment" || Date.parse(enrollment.holdExpiresAt) <= Date.now() + 30_000) {
    return { error: "notPayable" };
  }
  const provider = activeProvider();
  if (!provider) return { error: "paymentsOff" };
  const workshop = await workshopsDb.get(enrollment.workshopId);
  try {
    const payment = await startPayment(enrollment, workshop, provider, siteUrl);
    if (payment.status === "processing") return { error: "processing" };
    return { checkoutUrl: payment.checkoutUrl };
  } catch (error) {
    console.error(`[classes] resuming ${id} failed:`, error);
    return { error: "checkoutFailed" };
  }
}

/* the student gives up their seats: before paying it is simply released;
   after paying it is refunded, until the class's refund cut-off */
export async function cancelByStudent(id, token) {
  const enrollment = await enrollmentForToken(id, token);
  if (!enrollment) return { error: "notFound" };
  const outcome = await classLock(enrollment.workshopId, async () => {
    const current = await enrollmentsDb.get(id);
    const workshop = await workshopsDb.get(current.workshopId);
    if (current.status === "pending_payment") {
      const cancelled = moveEnrollment(current, "cancelled", { by: "student" });
      await enrollmentsDb.put(cancelled, current);
      return { effects: [{ type: "closeLinks", enrollment: cancelled }] };
    }
    if (current.status === "confirmed" && Date.now() < refundClosesAt(workshop)) {
      return { effects: await startRefund(current, workshop, "studentCancelled", "student") };
    }
    return { error: "tooLate" };
  });
  if (outcome.effects) await runEffects(outcome.effects);
  return outcome.error ? outcome : { ticket: await getTicket(id, token) };
}

/* ---------- the class desk ---------- */

export async function deskSnapshot() {
  const [workshops, enrollments, payments] = await Promise.all([
    workshopsDb.list(),
    enrollmentsDb.list(),
    paymentsDb.list(),
  ]);
  const now = Date.now();
  return {
    workshops: workshops.map((workshop) => ({
      ...workshop,
      phase: workshopPhase(workshop, now),
      seatsLeft: seatsLeft(
        workshop,
        enrollments.filter((enrollment) => enrollment.workshopId === workshop.id),
        now,
      ),
    })),
    enrollments: enrollments.map(({ accessToken: _secret, ...enrollment }) => enrollment),
    payments: payments.map(({ log, ...payment }) => ({ ...payment, log: log?.slice(-12) })),
  };
}

export async function deskVersion() {
  const versions = await Promise.all([workshopsDb.version(), enrollmentsDb.version(), paymentsDb.version()]);
  return versions.join(".");
}

/* sweeps every upcoming class: lapsed holds expire, open payments are
   checked with the provider (for a cron job, and when the desk opens) */
export async function reconcileClasses() {
  const now = Date.now();
  const workshops = (await workshopsDb.list()).filter(
    (workshop) => workshop.sessions?.length && workshopPhase(workshop, now) !== "past",
  );
  for (const workshop of workshops) {
    const effects = await classLock(workshop.id, async () =>
      expireLapsedHolds(await enrollmentsDb.listBy("workshopId", workshop.id), now),
    );
    await runEffects(effects);
    for (const enrollment of await enrollmentsDb.listBy("workshopId", workshop.id)) {
      if (enrollment.status === "pending_payment") await checkOpenPayments(enrollment);
    }
  }
}

/* "checkIn" | "undo" | "cancel" | "markRefunded" (with `paymentId`) | "check" */
export async function deskAction(enrollmentId, action, { paymentId } = {}) {
  const enrollment = await enrollmentsDb.get(enrollmentId);
  if (!enrollment) return { error: "notFound" };

  if (action === "check") {
    await checkOpenPayments(enrollment);
    return { enrollment: await enrollmentsDb.get(enrollmentId) };
  }
  if (action === "markRefunded") {
    const payment = await paymentsDb.get(paymentId);
    if (!payment || payment.enrollmentId !== enrollmentId) return { error: "notFound" };
    const outcome = await finishRefund(paymentId, { by: "staff" });
    return outcome.error ? outcome : { enrollment: outcome.enrollment };
  }

  const outcome = await classLock(enrollment.workshopId, async () => {
    const current = await enrollmentsDb.get(enrollmentId);
    const workshop = await workshopsDb.get(current.workshopId);
    const now = Date.now();
    switch (action) {
      case "checkIn": {
        if (current.status !== "confirmed" || !checkInSession(workshop, now)) return { error: "notAllowed" };
        const attended = moveEnrollment(current, "attended", { by: "staff", fields: { checkedInAt: nowIso() } });
        await enrollmentsDb.put(attended, current);
        return { enrollment: attended };
      }
      case "undo": {
        if (current.status !== "attended" || now > workshopStart(workshop) + 7 * 24 * 3_600_000) return { error: "notAllowed" };
        const back = moveEnrollment(current, "confirmed", { by: "staff", fields: { checkedInAt: null } });
        await enrollmentsDb.put(back, current);
        return { enrollment: back };
      }
      case "cancel": {
        if (current.status === "pending_payment") {
          const cancelled = moveEnrollment(current, "cancelled", { by: "staff" });
          await enrollmentsDb.put(cancelled, current);
          return { enrollment: cancelled, effects: [{ type: "closeLinks", enrollment: cancelled }] };
        }
        if (current.status === "confirmed") {
          const effects = await startRefund(current, workshop, "staffCancelled", "staff");
          return { enrollment: effects[0].enrollment, effects };
        }
        return { error: "notAllowed" };
      }
      default:
        return { error: "badRequest" };
    }
  });
  if (outcome.effects) await runEffects(outcome.effects);
  return outcome;
}
