/* believable sample bookings around today, for demos and testing: the past
   week's evenings mostly checked in (with the odd no-show, cancellation and
   walk-in), tonight under way, the coming days filling up. Each day is built
   with the table planner around any real bookings, so it always fits the
   dining room. Every record carries `demo: true`, so samples can be cleared
   without touching real bookings. Guests are made up; phones are in a fake
   090 000 01xx range and emails use example.com, which never delivers. */
import {
  addDays,
  getDayTimes,
  getOpeningHours,
  getRestaurantClock,
  SEATING_MINUTES,
  shopInstant,
} from "./booking";
import { toMinutes, toTime } from "./restaurant";
import { canSeat, planDay } from "./tables";

/* the sample regular with a bit of everything (a visit, a cancellation, a
   table coming up): try the guest page with this number */
export const DEMO_GUEST_PHONE = "+84900000100";

const PAST_DAYS = 6;
const FUTURE_DAYS = 10;
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const REGULAR = {
  name: "Lê Hoàng Nam",
  locale: "vi",
  phone: DEMO_GUEST_PHONE,
  email: "hoang.nam.le@example.com",
};

const PEOPLE = [
  ["Nguyễn Minh Anh", "vi"],
  ["Trần Gia Bảo", "vi"],
  ["Emma Laurent", "en"],
  ["Lê Thu Hà", "vi"],
  ["Phạm Quốc Huy", "vi"],
  ["James Carter", "en"],
  ["Hoàng Ngọc Lan", "vi"],
  ["Võ Thanh Tâm", "vi"],
  ["Sofia Rossi", "en"],
  ["Đặng Mai Phương", "vi"],
  ["Bùi Đức Long", "vi"],
  ["Kenji Tanaka", "en"],
  ["Đỗ Khánh Linh", "vi"],
  ["Huỳnh Tuấn Kiệt", "vi"],
  ["Lucas Martin", "en"],
  ["Phan Bảo Ngọc", "vi"],
  ["Vũ Hải Yến", "vi"],
  ["Olivia Brown", "en"],
  ["Lý Minh Khoa", "vi"],
  ["Trương Thảo Vy", "vi"],
  ["Daniel Kim", "en"],
  ["Ngô Anh Thư", "vi"],
  ["Dương Quang Vinh", "vi"],
  ["Chloé Dubois", "en"],
];

const NOTES = {
  vi: [
    "Sinh nhật bạn gái, cho mình xin một cây nến nhé",
    "Bàn gần cửa sổ nếu được",
    "Có em bé đi cùng",
    "Không ăn được hành",
    "Một người ăn chay",
    "Muốn ngồi gần bếp để xem làm bánh",
  ],
  en: [
    "Birthday dinner, could you bring a candle?",
    "Window seat if possible",
    "One vegetarian in our group",
    "Allergic to shellfish",
    "Anniversary, a quiet table please",
    "Coming with a toddler",
  ],
};

/* small seeded generator, so a day's samples come out the same each time */
function seededRandom(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hashText = (text) =>
  [...text].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) | 0, 7);

const emailFor = (name) =>
  `${name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .split(/\s+/)
    .join(".")}@example.com`;

/* a sample booking history for one guest, e.g. to try the guest page with
   your own number: visits over the past weeks (most checked in, one
   cancelled, one missed), one cancelled ahead and up to `upcomingAllowed`
   tables still to come. Each is fitted around `existing` bookings like the
   other samples. Marked `demoGuest` as well as `demo`: reloading the sample
   bookings keeps them, clearing samples removes them. */
const HISTORY = [
  { days: -43, outcome: "arrived", guests: 2 },
  { days: -30, outcome: "arrived", guests: 4, note: true },
  { days: -17, outcome: "cancelled", guests: 2 },
  { days: -8, outcome: "arrived", guests: 3 },
  { days: -5, outcome: "noShow", guests: 2 },
  { days: -2, outcome: "arrived", guests: 2, note: true },
  { days: -1, outcome: "arrived", guests: 4 },
  { days: 3, outcome: "cancelled", guests: 2 },
  { days: 5, outcome: "booked", guests: 2 },
];

export function buildGuestHistory(guest, clock = getRestaurantClock(), existing = [], { upcomingAllowed = 1 } = {}) {
  const random = seededRandom(hashText(`${guest.phone}|${clock.dateKey}`));
  const between = (min, max) => min + Math.floor(random() * (max - min + 1));
  const pick = (list) => list[Math.floor(random() * list.length)];
  const now = shopInstant(clock.dateKey, clock.minutes);
  const iso = (instant) => new Date(instant).toISOString();
  const code = () => `PP-${Array.from({ length: 6 }, () => pick(CODE_ALPHABET)).join("")}`;
  const byDate = (date) => existing.filter((reservation) => reservation.date === date);
  const notes = NOTES[guest.locale] ?? NOTES.vi;

  const created = [];
  const usedDates = new Set(existing.filter((item) => item.phone === guest.phone).map((item) => item.date));
  let upcomingLeft = upcomingAllowed;
  for (const plan of HISTORY) {
    if (plan.outcome === "booked" && upcomingLeft <= 0) continue;
    /* the nearest open day (on the same side of today) that fits the party */
    let placed = null;
    for (let shift = 0; shift < 7 && !placed; shift += 1) {
      const date = addDays(clock.dateKey, plan.days + (plan.days < 0 ? -shift : shift));
      if (usedDates.has(date)) continue;
      const times = getDayTimes(date, date === clock.dateKey ? clock.minutes : 0);
      const day = [...byDate(date), ...created.filter((item) => item.date === date)];
      const order = [...times].sort(() => random() - 0.5);
      const time = order.find((slot) => canSeat(day, { time: slot, guests: plan.guests }));
      if (time) placed = { date, time };
    }
    if (!placed) continue;

    const start = shopInstant(placed.date, toMinutes(placed.time));
    const booked = Math.min(start - between(1, 6) * 86_400_000 - between(1, 600) * 60_000, now - 60_000);
    const reservation = {
      id: code(),
      name: guest.name,
      email: guest.email,
      phone: guest.phone,
      date: placed.date,
      time: placed.time,
      guests: plan.guests,
      notes: plan.note ? pick(notes) : "",
      locale: guest.locale,
      source: "online",
      status: "booked",
      table: null,
      arrivedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      noShowAt: null,
      createdAt: iso(booked),
      updatedAt: iso(booked),
      demo: true,
      demoGuest: true,
    };
    if (plan.outcome === "arrived") {
      reservation.status = "arrived";
      reservation.arrivedAt = iso(start + between(-5, 15) * 60_000);
    } else if (plan.outcome === "noShow") {
      reservation.status = "noShow";
      reservation.noShowAt = iso(start + 20 * 60_000);
    } else if (plan.outcome === "cancelled") {
      reservation.status = "cancelled";
      reservation.cancelledBy = "guest";
      reservation.cancelledAt = iso((booked + Math.min(start, now)) / 2);
    } else {
      upcomingLeft -= 1;
    }
    reservation.updatedAt = reservation.arrivedAt ?? reservation.noShowAt ?? reservation.cancelledAt ?? reservation.updatedAt;
    usedDates.add(placed.date);
    created.push(reservation);
  }

  /* everyone who came sits at the table the day's plan gives them */
  for (const reservation of created) {
    if (reservation.status !== "arrived") continue;
    const { tables } = planDay([...byDate(reservation.date), ...created.filter((item) => item.date === reservation.date)]);
    reservation.table = tables.get(reservation.id) ?? null;
  }
  return created;
}

/* sample bookings for the days around `clock`, fitted around `existing`
   (real) bookings */
export function buildDemoReservations(clock = getRestaurantClock(), existing = []) {
  const random = seededRandom(hashText(clock.dateKey));
  const chance = (probability) => random() < probability;
  const between = (min, max) => min + Math.floor(random() * (max - min + 1));
  const pick = (list) => list[Math.floor(random() * list.length)];
  const now = shopInstant(clock.dateKey, clock.minutes);
  const iso = (instant) => new Date(instant).toISOString();
  const code = () =>
    `PP-${Array.from({ length: 6 }, () => pick(CODE_ALPHABET)).join("")}`;
  const partySize = () => {
    const roll = random();
    return roll < 0.08 ? 1 : roll < 0.58 ? 2 : roll < 0.73 ? 3 : 4;
  };

  let nextPerson = 0;
  const guest = () => {
    const index = nextPerson % PEOPLE.length;
    nextPerson += 1;
    const [name, locale] = PEOPLE[index];
    return {
      name,
      locale,
      /* regulars keep their number; two in three left an email */
      phone: `+84900000${101 + index}`,
      email: index % 3 === 2 ? null : emailFor(name),
    };
  };

  const booking = (date, time, guests, who) => {
    const start = shopInstant(date, toMinutes(time));
    const booked = Math.min(
      shopInstant(addDays(date, -between(1, 6)), between(9 * 60, 22 * 60)),
      now - between(5, 300) * 60000,
    );
    return {
      id: code(),
      name: who.name,
      email: who.email,
      phone: who.phone,
      date,
      time,
      guests,
      notes: chance(0.35) ? pick(NOTES[who.locale]) : "",
      locale: who.locale,
      source: chance(0.25) ? "staff" : "online",
      status: "booked",
      table: null,
      arrivedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      noShowAt: null,
      createdAt: iso(booked),
      updatedAt: iso(booked),
      demo: true,
      start,
    };
  };

  const arrive = (reservation, minutes) => {
    reservation.status = "arrived";
    reservation.arrivedAt = iso(shopInstant(reservation.date, minutes));
  };
  const cancel = (reservation, by) => {
    reservation.status = "cancelled";
    reservation.cancelledBy = by;
    reservation.cancelledAt = iso(
      (Date.parse(reservation.createdAt) + Math.min(reservation.start, now)) / 2,
    );
  };
  const noShow = (reservation) => {
    reservation.status = "noShow";
    reservation.noShowAt = iso(reservation.start + 20 * 60000);
  };

  const existingByDate = new Map();
  existing.forEach((reservation) => {
    if (!existingByDate.has(reservation.date)) existingByDate.set(reservation.date, []);
    existingByDate.get(reservation.date).push(reservation);
  });

  /* open days around today; the regular visited on the latest past one,
     cancelled on the one before, and is booked on the next one ahead */
  const openDays = [];
  for (let offset = -PAST_DAYS; offset <= FUTURE_DAYS; offset += 1) {
    const date = addDays(clock.dateKey, offset);
    if (getDayTimes(date).length) openDays.push({ date, offset });
  }
  const past = openDays.filter(({ offset }) => offset < 0);
  const ahead = openDays.filter(({ offset }) => offset > 0);
  const regularPlans = new Map([
    [past.at(-1)?.date, "visit"],
    [past.at(-2)?.date, "cancelled"],
    [ahead[0]?.date, "upcoming"],
  ]);
  /* one evening ahead is fully booked at its busiest time, to show "full" */
  const busyDate = ahead[1]?.date;

  const created = [];
  openDays.forEach(({ date, offset }) => {
    const times = getDayTimes(date);
    const day = [...(existingByDate.get(date) ?? [])];
    const added = [];
    const fits = (time, guests) => canSeat([...day, ...added], { time, guests });

    const plan = regularPlans.get(date);
    if (plan) {
      const time = plan === "upcoming" ? times.at(-1) : times[Math.min(1, times.length - 1)];
      if (fits(time, 2)) {
        const visit = booking(date, time, 2, REGULAR);
        visit.notes = plan === "visit" ? "Bàn gần bếp để xem làm bánh" : "";
        if (plan === "visit") arrive(visit, toMinutes(time) + 5);
        if (plan === "cancelled") cancel(visit, "guest");
        added.push(visit);
      }
    }

    if (date === busyDate) {
      const peak = times[Math.floor(times.length / 2)];
      for (let attempt = 0; attempt < 16; attempt += 1) {
        const guests = partySize();
        if (fits(peak, guests)) added.push(booking(date, peak, guests, guest()));
        if (!fits(peak, 1)) break;
      }
    }

    const target =
      offset < 0 ? between(5, 8) : offset === 0 ? between(6, 9) : between(2, 7) - Math.floor(offset / 4);
    for (let attempt = 0; added.length < target && attempt < target * 8; attempt += 1) {
      const time = pick(times);
      const guests = partySize();
      if (fits(time, guests)) added.push(booking(date, time, guests, guest()));
    }

    /* how each booking turned out, by where it stands against now */
    added.forEach((reservation) => {
      if (reservation.phone === DEMO_GUEST_PHONE) return;
      const start = toMinutes(reservation.time);
      const ended = offset < 0 || (offset === 0 && start + SEATING_MINUTES < clock.minutes);
      const underway = offset === 0 && !ended && start <= clock.minutes;
      if (ended) {
        const roll = random();
        if (roll < 0.1) cancel(reservation, chance(0.5) ? "guest" : "staff");
        else if (roll < 0.2) noShow(reservation);
        else arrive(reservation, start + between(-10, 20));
      } else if (underway) {
        if (chance(0.6)) arrive(reservation, Math.min(clock.minutes, start + between(-5, 15)));
      } else if (chance(0.1)) {
        cancel(reservation, chance(0.5) ? "guest" : "staff");
      }
    });

    /* walk-ins on evenings that have already started */
    const hours = getOpeningHours(date);
    const until = offset < 0 ? hours.close - 45 : Math.min(hours.close - 45, clock.minutes);
    if (offset <= 0 && until > hours.open) {
      for (let walkIns = between(1, 2); walkIns > 0; walkIns -= 1) {
        const time = toTime(between(hours.open, until));
        const guests = partySize();
        if (!fits(time, guests)) continue;
        const walkIn = booking(date, time, guests, { name: "", locale: "vi", phone: null, email: null });
        walkIn.source = "walkIn";
        walkIn.notes = "";
        walkIn.createdAt = iso(walkIn.start);
        walkIn.updatedAt = walkIn.createdAt;
        arrive(walkIn, toMinutes(time));
        added.push(walkIn);
      }
    }

    /* everyone who came sits at the table the plan gives them */
    const { tables } = planDay([...day, ...added]);
    added.forEach((reservation) => {
      if (reservation.status === "arrived") reservation.table = tables.get(reservation.id) ?? null;
      delete reservation.start;
    });
    created.push(...added);
  });

  return created;
}
