/* booking rules shared by the reserve form, the reservation desk and the
   reservations API, so all three always agree on what can be booked */
import { normalizePhone } from "./phone";
import { getTimeSlots, RESTAURANT, toMinutes, toTime } from "./restaurant";

export const BOOKABLE_DAYS = 14;
/* same-day bookings made online need at least this much notice */
export const SAME_DAY_NOTICE_MINUTES = 30;
/* how long a party keeps its table, for planning who sits where */
export const SEATING_MINUTES = 90;
/* a late party's table is held this long; after it they can be marked a
   no-show and the table given to someone else */
export const HOLD_MINUTES = 15;
/* bookings one phone number may have coming up at once */
export const MAX_UPCOMING_PER_PHONE = 3;
export const MIN_GUESTS = 1;
/* a booking is one table, so the biggest table sets the largest party;
   bigger groups call the shop, which can rearrange the room */
export const MAX_GUESTS = Math.max(...RESTAURANT.tables.map((table) => table.seats));
export const MAX_LENGTH = { name: 80, email: 254, notes: 500 };
export const REQUIRED_FIELDS = ["name", "phone", "date", "time"];
/* form order, used to focus the first field that needs attention */
export const FIELD_ORDER = ["name", "phone", "email", "guests", "date", "time", "notes"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTL_LOCALES = { en: "en-GB", vi: "vi-VN" };
const DAY_MINUTES = 24 * 60;

export const intlLocale = (locale) => INTL_LOCALES[locale] ?? INTL_LOCALES.en;

const shopClock = new Intl.DateTimeFormat("en-CA", {
  timeZone: RESTAURANT.timeZone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/* today's date and minutes past midnight at the shop, whatever time zone
   the visitor (or the server) is in */
export function getRestaurantClock(now = new Date()) {
  const parts = Object.fromEntries(
    shopClock.formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/* "2026-10-12" <-> a Date at UTC midnight, so formatting never shifts the day */
export function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function addDays(dateKey, days) {
  const date = dateFromKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDateKey(dateKey, locale, options) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    ...options,
    timeZone: "UTC",
  }).format(dateFromKey(dateKey));
}

/* the instant (ms) that is `minutes` past midnight, shop time, on `dateKey` */
export function shopInstant(dateKey, minutes) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day, 0, minutes);
  const seen = getRestaurantClock(new Date(guess));
  const drift =
    (dateFromKey(seen.dateKey) - dateFromKey(dateKey)) / 60000 + seen.minutes - minutes;
  return guess - drift * 60000;
}

/* "18:04" in shop time for an ISO timestamp */
export function formatShopTime(isoString, locale) {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone: RESTAURANT.timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(isoString));
}

function weeklyHours(dateKey) {
  const hours = RESTAURANT.hours[dateFromKey(dateKey).getUTCDay()];
  return hours ? { open: toMinutes(hours[0]), close: toMinutes(hours[1]) } : null;
}

/* opening and closing time (minutes after midnight) on a date, or null when
   the shop is closed: Sundays and RESTAURANT.closedDates */
export function getOpeningHours(dateKey) {
  if (RESTAURANT.closedDates.includes(dateKey)) return null;
  return weeklyHours(dateKey);
}

/* bookable times on a date, leaving out those before `notBefore` */
export function getDayTimes(dateKey, notBefore = 0) {
  if (!getOpeningHours(dateKey)) return [];
  return getTimeSlots(dateFromKey(dateKey).getUTCDay(), notBefore);
}

/* the next BOOKABLE_DAYS days and the times still open on each; the desk
   books with no notice (`noticeMinutes: 0`) */
export function getBookableDays(
  clock = getRestaurantClock(),
  { noticeMinutes = SAME_DAY_NOTICE_MINUTES } = {},
) {
  return Array.from({ length: BOOKABLE_DAYS }, (_, index) => {
    const key = addDays(clock.dateKey, index);
    const timeSlots = getDayTimes(
      key,
      index === 0 ? clock.minutes + noticeMinutes : 0,
    );
    return { key, isOpen: timeSlots.length > 0, timeSlots };
  });
}

/* "booked" | "arrived" | "cancelled" | "noShow"; the first bookings only
   stored an `arrived` flag */
export function statusOf(reservation) {
  return reservation.status ?? (reservation.arrived ? "arrived" : "booked");
}

/* where a booking stands right now (shop time) and what can be done with
   it. Guests are checked in on the day itself, from opening time until
   their table time is up (SEATING_MINUTES after the booking, never past
   closing), so a party running late can still be checked in. `display` is
   the status to show: a booked guest is "late" after the hold time and a
   "noShow" once check-in has closed. */
export function getVisitState(reservation, clock = getRestaurantClock()) {
  const status = statusOf(reservation);
  const start = toMinutes(reservation.time);
  const hours = weeklyHours(reservation.date) ?? { open: 0, close: DAY_MINUTES };
  const opensAt = Math.min(hours.open, start);
  const closesAt = Math.max(Math.min(start + SEATING_MINUTES, hours.close), start);
  const isToday = reservation.date === clock.dateKey;
  const isPastDay = reservation.date < clock.dateKey;
  const now = clock.minutes;
  const isLate = isToday && now > start + HOLD_MINUTES;
  const checkInOver = isPastDay || (isToday && now > closesAt);

  return {
    status,
    display:
      status !== "booked"
        ? status
        : checkInOver
          ? "noShow"
          : isLate
            ? "late"
            : "booked",
    isToday,
    isPastDay,
    opensAt,
    closesAt,
    lateMinutes: isToday ? Math.max(0, now - start) : 0,
    canCheckIn:
      (status === "booked" || status === "noShow") &&
      isToday &&
      now >= opensAt &&
      now <= closesAt,
    canMarkNoShow: status === "booked" && isLate,
    canUndo: (status === "arrived" || status === "noShow") && isToday,
    canCancel: status === "booked" && !checkInOver,
    /* guests can cancel up to their booking time */
    canGuestCancel:
      status === "booked" &&
      (reservation.date > clock.dateKey || (isToday && now < start)),
  };
}

function cleanContact(form) {
  return {
    name: String(form.name ?? "").trim(),
    email: String(form.email ?? "").trim().toLowerCase(),
    phone: normalizePhone(form.phone),
    guests: Number(form.guests),
    notes: String(form.notes ?? "").trim(),
  };
}

function checkContact(form, values, errors) {
  if (String(form.phone ?? "").trim() && !values.phone) {
    errors.phone = "invalidPhone";
  }
  if (
    values.email &&
    (!EMAIL_PATTERN.test(values.email) ||
      values.email.length > MAX_LENGTH.email)
  ) {
    errors.email = "invalidEmail";
  }
  if (!errors.name && values.name.length > MAX_LENGTH.name) {
    errors.name = "tooLong";
  }
  if (values.notes.length > MAX_LENGTH.notes) errors.notes = "tooLong";
  if (!Number.isInteger(values.guests) || values.guests < MIN_GUESTS) {
    errors.guests = "required";
  } else if (values.guests > MAX_GUESTS) {
    errors.guests = "partySize";
  }
}

/* an online booking. `values` holds the cleaned-up booking, `errors` maps a
   field to a key of dict.reserve.errors. Whether a table is free is
   checked separately (lib/tables.js). */
export function validateReservation(form, days = getBookableDays()) {
  const values = {
    ...cleanContact(form),
    date: String(form.date ?? ""),
    time: String(form.time ?? ""),
  };
  const errors = {};

  REQUIRED_FIELDS.forEach((field) => {
    if (!String(form[field] ?? "").trim()) errors[field] = "required";
  });
  checkContact(form, values, errors);

  const day = days.find((option) => option.key === values.date);
  if (!errors.date && !day?.isOpen) errors.date = "unavailable";
  if (!errors.time && day?.isOpen && !day.timeSlots.includes(values.time)) {
    errors.time = "unavailable";
  }

  return { values, errors };
}

/* a booking made at the desk: a phone booking (no online notice period) or
   a walk-in seated right now, who needs no name or number */
export function validateStaffReservation(form, clock = getRestaurantClock()) {
  const kind = form.kind === "walkIn" ? "walkIn" : "booking";
  const values = {
    kind,
    ...cleanContact(form),
    date: kind === "walkIn" ? clock.dateKey : String(form.date ?? ""),
    time: kind === "walkIn" ? toTime(clock.minutes) : String(form.time ?? ""),
  };
  const errors = {};

  if (kind === "booking") {
    REQUIRED_FIELDS.forEach((field) => {
      if (!String(form[field] ?? "").trim()) errors[field] = "required";
    });
    const day = getBookableDays(clock, { noticeMinutes: 0 }).find(
      (option) => option.key === values.date,
    );
    if (!errors.date && !day?.isOpen) errors.date = "unavailable";
    if (!errors.time && day?.isOpen && !day.timeSlots.includes(values.time)) {
      errors.time = "unavailable";
    }
  }
  checkContact(form, values, errors);

  return { values, errors };
}
