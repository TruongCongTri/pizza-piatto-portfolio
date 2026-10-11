/* pizza classes: timing, seats and wording, shared by the class pages, the
   class desk and the booking/payment server code */
import { formatDateKey, intlLocale, shopInstant } from "./booking";
import { RESTAURANT, toMinutes } from "./restaurant";

/* a seat is held this long while the student pays */
export const HOLD_MINUTES = 15;
/* ...and kept at least this much longer once the bank is confirming a
   payment, so a seat never lapses while its money is on the way */
export const PROCESSING_HOLD_MINUTES = 15;
export const MAX_SEATS_PER_BOOKING = 4;
/* online booking closes this long before the class (per class, editable) */
export const DEFAULT_BOOKING_CLOSES_HOURS = 24;
/* a paid seat can be cancelled for a refund until this long before */
export const DEFAULT_REFUND_UNTIL_HOURS = 72;
/* students can be checked in from this long before a session starts */
export const CHECK_IN_EARLY_MINUTES = 60;

const HOUR = 3_600_000;

/* a { vi, en } field in the visitor's language, falling back to the other */
export function localized(field, locale) {
  if (!field) return "";
  if (typeof field === "string") return field;
  return field[locale] || field.vi || field.en || "";
}

/* a { vi: [...], en: [...] } list in the visitor's language, or the other
   one when that is empty */
export function localizedList(field, locale) {
  if (field?.[locale]?.length) return field[locale];
  return [field?.vi, field?.en].find((list) => list?.length) ?? [];
}

/* a session's times can be unknown (a past class brought in from the
   shop's posts): it then spans its whole day, and the class can't be booked */
export const hasTimes = (session) => Boolean(session.start && session.end);

export const sessionStart = (session) =>
  shopInstant(session.date, session.start ? toMinutes(session.start) : 0);
export const sessionEnd = (session) =>
  shopInstant(session.date, session.end ? toMinutes(session.end) : 24 * 60 - 1);

export const workshopStart = (workshop) =>
  Math.min(...workshop.sessions.map(sessionStart));
export const workshopEnd = (workshop) =>
  Math.max(...workshop.sessions.map(sessionEnd));

/* "upcoming" | "ongoing" | "past" */
export function workshopPhase(workshop, now = Date.now()) {
  if (!workshop.sessions?.length) return "upcoming";
  if (now < workshopStart(workshop)) return "upcoming";
  if (now <= workshopEnd(workshop)) return "ongoing";
  return "past";
}

export const bookingClosesAt = (workshop) =>
  workshopStart(workshop) -
  (workshop.bookingClosesHours ?? DEFAULT_BOOKING_CLOSES_HOURS) * HOUR;

export const refundClosesAt = (workshop) =>
  workshopStart(workshop) -
  (workshop.refundUntilHours ?? DEFAULT_REFUND_UNTIL_HOURS) * HOUR;

/* open for online booking: published, priced, with timed sessions, before
   the cutoff */
export function isBookable(workshop, now = Date.now()) {
  return (
    workshop.status === "published" &&
    workshop.sessions?.length > 0 &&
    workshop.sessions.every(hasTimes) &&
    workshop.price > 0 &&
    workshop.capacity > 0 &&
    now < bookingClosesAt(workshop)
  );
}

/* bookings that use up a seat right now: paid ones, and unpaid ones whose
   hold has not run out */
export function holdsSeat(enrollment, now = Date.now()) {
  if (enrollment.status === "confirmed" || enrollment.status === "attended") return true;
  if (enrollment.status === "pending_payment") {
    return Date.parse(enrollment.holdExpiresAt) > now;
  }
  return false;
}

export function seatsTaken(enrollments, now = Date.now()) {
  return enrollments
    .filter((enrollment) => holdsSeat(enrollment, now))
    .reduce((sum, enrollment) => sum + enrollment.seats, 0);
}

export function seatsLeft(workshop, enrollments, now = Date.now()) {
  return Math.max(0, (workshop.capacity ?? 0) - seatsTaken(enrollments, now));
}

/* the session being taught now (or about to start), during which students
   can be checked in; null outside those windows */
export function checkInSession(workshop, now = Date.now()) {
  return (
    workshop.sessions?.find(
      (session) =>
        now >= sessionStart(session) - CHECK_IN_EARLY_MINUTES * 60_000 &&
        now <= sessionEnd(session),
    ) ?? null
  );
}

/* "Sun, 25 Oct 2026 · 09:00–13:00", or with the weekday and month in full;
   just the date when the times aren't known */
export function formatSession(session, locale, { long = false } = {}) {
  const date = formatDateKey(
    session.date,
    locale,
    long
      ? { weekday: "long", day: "numeric", month: "long", year: "numeric" }
      : { weekday: "short", day: "numeric", month: "short", year: "numeric" },
  );
  return hasTimes(session) ? `${date} · ${session.start}–${session.end}` : date;
}

/* an instant in shop time: "Sun, 25 Oct, 09:00" */
export function formatShopDateTime(value, locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: RESTAURANT.timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

/* "1 seat" / "3 seats" with the labels from dict.workshops.form */
export const formatSeats = (count, { seatOne, seatOther }) =>
  `${count} ${count === 1 ? seatOne : seatOther}`;

/* a URL-safe slug from a title: "Lớp Pizza Tháng 10" -> "lop-pizza-thang-10" */
export function slugify(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
