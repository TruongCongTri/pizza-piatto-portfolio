import "server-only";

import { randomInt } from "node:crypto";

import {
  getBookableDays,
  getRestaurantClock,
  getVisitState,
  MAX_UPCOMING_PER_PHONE,
  statusOf,
  validateReservation,
  validateStaffReservation,
} from "@/lib/booking";
import {
  canSeat,
  holdsTable,
  isPlacement,
  occupancyOf,
  planDay,
  tableFor,
} from "@/lib/tables";
import { defaultLocale, hasLocale } from "@/i18n/config";

import {
  buildCancellationEmail,
  buildReceiptEmail,
  buildTicketEmail,
} from "./emails";
import { sendMail } from "./mailer";
import {
  getReservation,
  insertReservation,
  listReservationsByDate,
  listReservationsByPhone,
  updateReservation,
  withDayLock,
} from "./store";

/* booking codes skip look-alike characters (0/O, 1/I) so they can be read
   out over the phone: "PP-7K3QX9" */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function newReservationId() {
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return `PP-${code}`;
}

const overlaps = (a, b) => a.start < b.end && b.start < a.end;
const localeOf = (value) => (hasLocale(value) ? value : defaultLocale);

/* saves a new booking under a fresh code; a clash between random codes is
   unlikely, but never overwrite one */
async function insertNew(fields) {
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reservation = {
      id: newReservationId(),
      ...fields,
      cancelledAt: null,
      cancelledBy: null,
      noShowAt: null,
      createdAt: now,
      updatedAt: now,
    };
    if (await insertReservation(reservation)) return reservation;
  }
  throw new Error("Could not allocate a reservation code");
}

/* the booking is already saved, so a failed email is reported, not thrown;
   `messages` maps a recipient to a builder, or to null for none */
async function sendEmails(reservation, messages) {
  const entries = Object.entries(messages);
  const results = await Promise.allSettled(
    entries.map(async ([, build]) => (build ? sendMail(build()) : "none")),
  );
  return Object.fromEntries(
    entries.map(([recipient], index) => {
      const result = results[index];
      if (result.status === "fulfilled") return [recipient, result.value];
      console.error(
        `[mail] ${recipient} email for ${reservation.id} failed:`,
        result.reason,
      );
      return [recipient, "failed"];
    }),
  );
}

/* the record as stored now: drops the `arrived` flag the first bookings had */
function current(reservation) {
  const { arrived: _legacy, ...rest } = reservation;
  return { ...rest, status: statusOf(reservation) };
}

/* ---------- booking ---------- */

/* a guest booking online: { reservation, emails }, or { errors } mapping a
   field to a key of dict.reserve.errors */
export async function createReservation(input) {
  const clock = getRestaurantClock();
  const { values, errors } = validateReservation(input, getBookableDays(clock));
  if (Object.keys(errors).length) return { errors };

  /* one number holds one table at a time, and only a few bookings ahead */
  const own = (await listReservationsByPhone(values.phone)).filter(holdsTable);
  const span = occupancyOf(values);
  if (
    own.some(
      (reservation) =>
        reservation.date === values.date && overlaps(occupancyOf(reservation), span),
    )
  ) {
    return { errors: { time: "overlap" } };
  }
  const upcoming = own.filter((reservation) => getVisitState(reservation, clock).canCancel);
  if (upcoming.length >= MAX_UPCOMING_PER_PHONE) {
    return { errors: { phone: "tooMany" } };
  }

  const reservation = await withDayLock(values.date, async () => {
    if (!canSeat(await listReservationsByDate(values.date), values)) return null;
    return insertNew({
      ...values,
      email: values.email || null,
      locale: localeOf(input.locale),
      source: "online",
      status: "booked",
      table: null,
      arrivedAt: null,
    });
  });
  if (!reservation) return { errors: { time: "full" } };

  const emails = await sendEmails(reservation, {
    guest: reservation.email ? () => buildTicketEmail(reservation) : null,
    restaurant: () => buildReceiptEmail(reservation),
  });
  return { reservation, emails };
}

/* a booking taken at the desk: a phone booking, or a walk-in seated right
   away at whichever table is free. { reservation } or { errors }. */
export async function createStaffReservation(input) {
  const clock = getRestaurantClock();
  const { values, errors } = validateStaffReservation(input, clock);
  if (Object.keys(errors).length) return { errors };

  const { kind, ...fields } = values;
  const isWalkIn = kind === "walkIn";
  const reservation = await withDayLock(fields.date, async () => {
    const units = tableFor(await listReservationsByDate(fields.date), fields);
    if (!units) return null;
    return insertNew({
      ...fields,
      email: fields.email || null,
      phone: fields.phone || null,
      locale: localeOf(input.locale),
      source: isWalkIn ? "walkIn" : "staff",
      status: isWalkIn ? "arrived" : "booked",
      /* a walk-in sits down now, so their table is settled */
      table: isWalkIn ? units : null,
      arrivedAt: isWalkIn ? new Date().toISOString() : null,
    });
  });
  if (!reservation) {
    return { errors: isWalkIn ? { guests: "noTable" } : { time: "full" } };
  }

  const emails = await sendEmails(reservation, {
    guest:
      reservation.email && !isWalkIn ? () => buildTicketEmail(reservation) : null,
  });
  return { reservation, emails };
}

/* is there a table, per bookable day and time, for a party this size? */
export async function getAvailability(guests) {
  const days = getBookableDays(getRestaurantClock());
  return Promise.all(
    days.map(async (day) => {
      if (!day.isOpen) return { date: day.key, times: [] };
      const reservations = await listReservationsByDate(day.key);
      return {
        date: day.key,
        times: day.timeSlots.map((time) => ({
          time,
          available: canSeat(reservations, { time, guests }),
        })),
      };
    }),
  );
}

/* ---------- changes ---------- */

/* a guest cancels their own booking, up to its start time */
export async function cancelForGuest(id, phone) {
  const existing = await getReservation(id);
  if (!existing || existing.phone !== phone) return { error: "notFound" };

  const result = await withDayLock(existing.date, async () => {
    const fresh = current(await getReservation(id));
    if (!getVisitState(fresh).canGuestCancel) return { error: "tooLate" };
    const now = new Date().toISOString();
    const updated = {
      ...fresh,
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: "guest",
      table: null,
      updatedAt: now,
    };
    await updateReservation(updated);
    return { reservation: updated };
  });

  if (result.reservation) {
    const { reservation } = result;
    await sendEmails(reservation, {
      guest: reservation.email
        ? () => buildCancellationEmail(reservation, { by: "guest" })
        : null,
      restaurant: () => buildReceiptEmail(reservation, { cancelled: true }),
    });
  }
  return result;
}

/* the desk's actions on a booking, each allowed only at the right moment
   (lib/booking.js getVisitState):
   "checkIn"  on the day, from opening until their table time is up; seats
              them at `table` (units) or at the table the plan gave them
   "undo"     takes back a check-in or a no-show, same day only
   "noShow"   once the table has been held HOLD_MINUTES
   "cancel"   any booking that hasn't come and gone */
export async function updateVisit(id, action, { table } = {}) {
  const existing = await getReservation(id);
  if (!existing) return { error: "notFound" };

  const result = await withDayLock(existing.date, async () => {
    const fresh = current(await getReservation(id));
    const state = getVisitState(fresh);
    const now = new Date().toISOString();
    let updated;

    switch (action) {
      case "checkIn": {
        if (!state.canCheckIn) return { error: "notAllowed" };
        const others = (await listReservationsByDate(fresh.date)).filter(
          (reservation) => reservation.id !== id,
        );
        let units = null;
        if (table !== undefined) {
          if (!isPlacement(table, fresh.guests)) return { error: "badTable" };
          const span = occupancyOf(fresh);
          const taken = others.some(
            (reservation) =>
              holdsTable(reservation) &&
              reservation.table?.some((unit) => table.includes(unit)) &&
              overlaps(occupancyOf(reservation), span),
          );
          if (taken) return { error: "tableTaken" };
          units = table;
        } else {
          const plan = planDay([...others, { ...fresh, status: "booked", table: null }]);
          units = plan.tables.get(id);
        }
        updated = { ...fresh, status: "arrived", arrivedAt: now, noShowAt: null, table: units };
        break;
      }
      case "undo":
        if (!state.canUndo) return { error: "notAllowed" };
        updated = { ...fresh, status: "booked", arrivedAt: null, noShowAt: null, table: null };
        break;
      case "noShow":
        if (!state.canMarkNoShow) return { error: "notAllowed" };
        updated = { ...fresh, status: "noShow", noShowAt: now, table: null };
        break;
      case "cancel":
        if (!state.canCancel) return { error: "notAllowed" };
        updated = {
          ...fresh,
          status: "cancelled",
          cancelledAt: now,
          cancelledBy: "staff",
          table: null,
        };
        break;
      default:
        return { error: "badRequest" };
    }

    updated.updatedAt = now;
    await updateReservation(updated);
    return { reservation: updated };
  });

  if (action === "cancel" && result.reservation?.email) {
    await sendEmails(result.reservation, {
      guest: () => buildCancellationEmail(result.reservation, { by: "staff" }),
    });
  }
  return result;
}

/* what a guest sees of their own bookings */
export function toGuestView(reservation) {
  const { id, name, email, date, time, guests, notes, arrivedAt, cancelledAt, createdAt } =
    reservation;
  return {
    id,
    name,
    email,
    date,
    time,
    guests,
    notes,
    status: statusOf(reservation),
    arrivedAt,
    cancelledAt: cancelledAt ?? null,
    createdAt,
  };
}
