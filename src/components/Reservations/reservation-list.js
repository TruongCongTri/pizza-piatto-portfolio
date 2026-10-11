import { formatDateKey, getVisitState } from "@/lib/booking";
import { formatPhone } from "@/lib/phone";

/* search, filter, sort and group bookings: shared by the guest's "my
   bookings" page, the staff reservation desk and the staff guest lookup */

/* lower-case without accents, so "nguyen" finds "Nguyễn" */
export function foldText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/g, "d");
}

function searchText(reservation, locale) {
  const phone = reservation.phone
    ? `${reservation.phone} ${formatPhone(reservation.phone)}`
    : "";
  return foldText(
    [
      reservation.id,
      reservation.name,
      reservation.email,
      reservation.notes,
      reservation.date,
      reservation.time,
      formatDateKey(reservation.date, locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }),
      phone,
    ].join(" "),
  );
}

/* every word must match; runs of digits also match the phone number with
   its spaces taken out ("0346627237" finds "034 662 7237") */
function matches(reservation, words, locale) {
  if (!words.length) return true;
  const text = searchText(reservation, locale);
  const digits = reservation.phone
    ? [reservation.phone, formatPhone(reservation.phone)]
        .map((phone) => phone.replace(/\D/g, ""))
        .join(" ")
    : "";
  return words.every(
    (word) => text.includes(word) || (/^\d{3,}$/.test(word) && digits.includes(word)),
  );
}

const VIEWS = {
  today: (reservation, today) => reservation.date === today,
  upcoming: (reservation, today) => reservation.date >= today,
  past: (reservation, today) => reservation.date < today,
  all: () => true,
};

/* by what the booking looks like now (getVisitState().display): a late
   guest is still booked, a guest who never came counts as a no-show */
const STATUSES = {
  all: () => true,
  booked: (display) => display === "booked" || display === "late",
  arrived: (display) => display === "arrived",
  noShow: (display) => display === "noShow",
  cancelled: (display) => display === "cancelled",
};

/* `clock` is the shop's clock (getRestaurantClock): days before today are
   past, and late or missed guests are judged against its time */
export function filterReservations(
  reservations,
  { query = "", view = "all", status = "all", sort = "asc", locale, clock },
) {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  const direction = sort === "desc" ? -1 : 1;

  return reservations
    .filter(
      (reservation) =>
        VIEWS[view](reservation, clock.dateKey) &&
        STATUSES[status](getVisitState(reservation, clock).display) &&
        matches(reservation, words, locale),
    )
    .sort(
      (a, b) =>
        direction *
        (`${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`) ||
          a.createdAt.localeCompare(b.createdAt)),
    );
}

/* ---------- class bookings, alongside table bookings ---------- */

/* a class booking sits on the calendar from its first session to its last */
const classStart = (booking) => booking.workshop?.sessions?.[0] ?? null;
const classEnd = (booking) => booking.workshop?.sessions?.at(-1) ?? null;

const CLASS_VIEWS = {
  today: (start, end, today) => start.date <= today && today <= end.date,
  upcoming: (start, end, today) => end.date >= today,
  past: (start, end, today) => end.date < today,
  all: () => true,
};

function classMatches(booking, words, locale) {
  if (!words.length) return true;
  const { workshop } = booking;
  const phone = booking.phone ? `${booking.phone} ${formatPhone(booking.phone)}` : "";
  const text = foldText(
    [
      booking.id,
      booking.name,
      booking.email,
      workshop.title?.vi,
      workshop.title?.en,
      ...workshop.sessions.flatMap((session) => [
        session.date,
        formatDateKey(session.date, locale, { weekday: "long", day: "numeric", month: "long" }),
      ]),
      phone,
    ].join(" "),
  );
  return words.every((word) => text.includes(word));
}

/* class bookings by the same "show" filters and search as table bookings */
export function filterClassBookings(bookings, { query = "", view = "all", locale, clock }) {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  return bookings.filter((booking) => {
    const start = classStart(booking);
    const end = classEnd(booking);
    return Boolean(start) && CLASS_VIEWS[view](start, end, clock.dateKey) && classMatches(booking, words, locale);
  });
}

/* tables and classes in one list by date and time: [{ kind, item }] with
   kind "table" | "class" */
export function mergeBookings({ reservations = [], classBookings = [] }, { sort = "asc" } = {}) {
  const direction = sort === "desc" ? -1 : 1;
  const entries = [
    ...reservations.map((item) => ({ kind: "table", key: `${item.date} ${item.time}`, item })),
    ...classBookings.map((item) => {
      const start = classStart(item);
      return { kind: "class", key: `${start.date} ${start.start || "00:00"}`, item };
    }),
  ];
  return entries.sort(
    (a, b) => direction * (a.key.localeCompare(b.key) || a.item.createdAt.localeCompare(b.item.createdAt)),
  );
}

/* consecutive reservations on the same day, in their current order */
export function groupByDate(reservations) {
  const groups = [];
  reservations.forEach((reservation) => {
    const last = groups.at(-1);
    if (last?.date === reservation.date) last.items.push(reservation);
    else groups.push({ date: reservation.date, items: [reservation] });
  });
  return groups;
}
