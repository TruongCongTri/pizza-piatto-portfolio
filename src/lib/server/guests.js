import "server-only";

import { foldText } from "@/components/Reservations/reservation-list";

import { classBookingsByPhone } from "./classes";
import { enrollmentsDb, paymentsDb, workshopsDb } from "./collections";
import { toGuestView } from "./reservations";
import { listReservations, listReservationsByPhone } from "./store";

/* One place for everything a phone number has booked, tables and classes:
   for the guest who proved the number with a code, and for staff looking
   a guest up. */

/* the guest's own view: their table bookings and their class tickets */
export async function guestBookings(phone) {
  const [reservations, classBookings] = await Promise.all([
    listReservationsByPhone(phone),
    classBookingsByPhone(phone),
  ]);
  return { phone, reservations: reservations.map(toGuestView), classBookings };
}

/* "+84933048894" -> "0933048894", as the number is usually written here */
const localNumber = (phone) => (phone.startsWith("+84") ? `0${phone.slice(3)}` : phone);
const latestOf = (items, field) =>
  items
    .filter((item) => item[field])
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]?.[field] ?? null;

/* staff lookup: guests whose phone number, name, email or booking code
   matches `query`, each with every table and class booking they made,
   most recently active first. A query of digits matches phone numbers,
   written either way ("0933 048 894" or "+84933048894"). */
export async function findGuests(query, { limit = 20 } = {}) {
  const text = String(query ?? "").trim();
  if (text.length < 2) return [];
  const words = foldText(text).split(/\s+/).filter(Boolean);
  const digits = text.replace(/\D/g, "");
  const byPhone = digits.length >= 3 && /^[\d\s+().-]+$/.test(text);

  const [reservations, enrollments, workshops, payments] = await Promise.all([
    listReservations(),
    enrollmentsDb.list(),
    workshopsDb.list(),
    paymentsDb.list(),
  ]);
  const workshopById = new Map(workshops.map((workshop) => [workshop.id, workshop]));
  const paymentsByBooking = new Map();
  payments.forEach(({ log: _log, checkoutUrl: _checkout, ...payment }) => {
    if (!paymentsByBooking.has(payment.enrollmentId)) paymentsByBooking.set(payment.enrollmentId, []);
    paymentsByBooking.get(payment.enrollmentId).push(payment);
  });

  const guests = new Map();
  const guestFor = (phone) => {
    if (!guests.has(phone)) guests.set(phone, { phone, reservations: [], classBookings: [] });
    return guests.get(phone);
  };
  reservations.forEach((reservation) => {
    if (reservation.phone) guestFor(reservation.phone).reservations.push(reservation);
  });
  enrollments.forEach(({ accessToken: _secret, ...enrollment }) => {
    const workshop = workshopById.get(enrollment.workshopId);
    guestFor(enrollment.phone).classBookings.push({
      ...enrollment,
      workshop: workshop && {
        id: workshop.id,
        slug: workshop.slug,
        title: workshop.title,
        sessions: workshop.sessions,
        status: workshop.status,
      },
      payments: (paymentsByBooking.get(enrollment.id) ?? []).sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt),
      ),
    });
  });

  const matches = (guest) => {
    const phoneDigits = `${guest.phone.replace(/\D/g, "")} ${localNumber(guest.phone)}`;
    if (byPhone) return phoneDigits.includes(digits);
    const haystack = foldText(
      [
        guest.phone,
        localNumber(guest.phone),
        ...guest.reservations.flatMap((item) => [item.id, item.name, item.email]),
        ...guest.classBookings.flatMap((item) => [item.id, item.name, item.email]),
      ].join(" "),
    );
    return words.every(
      (word) => haystack.includes(word) || (/^\d{3,}$/.test(word) && phoneDigits.includes(word)),
    );
  };

  return [...guests.values()]
    .filter(matches)
    .map((guest) => {
      const all = [...guest.reservations, ...guest.classBookings];
      return {
        ...guest,
        name: latestOf(all, "name"),
        email: latestOf(all, "email"),
        lastActivity: all.reduce((latest, item) => (item.createdAt > latest ? item.createdAt : latest), ""),
      };
    })
    .sort((a, b) => b.lastActivity.localeCompare(a.lastActivity))
    .slice(0, limit);
}
