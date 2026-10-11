/* who sits where: the dining room's tables, the ways a party can be seated,
   and a planner that fits a day's bookings around each other. Shared by the
   reservations API (is there room?) and the reservation desk (table plan). */
import { SEATING_MINUTES, statusOf } from "./booking";
import { RESTAURANT, toMinutes } from "./restaurant";

const HALF_NAMES = ["A", "B"];
/* a search that runs this long is cut short and treated as "doesn't fit",
   so a booking is never accepted on a hunch */
const MAX_STEPS = 100_000;
const CANDIDATE_ID = "__candidate";

const halvesOf = (table) =>
  table.split.map((seats, index) => ({
    id: `${table.id}${HALF_NAMES[index]}`,
    seats,
  }));

/* everything a party can sit at on its own: whole tables, and each half of
   a table that splits, e.g. "1", "2", "3A", "3B", "4A", "4B" */
export const UNITS = RESTAURANT.tables.flatMap((table) =>
  table.split
    ? halvesOf(table).map((half) => ({ ...half, table: table.id }))
    : [{ id: table.id, seats: table.seats, table: table.id }],
);

const UNIT_BY_ID = new Map(UNITS.map((unit) => [unit.id, unit]));
const TABLE_BY_ID = new Map(RESTAURANT.tables.map((table) => [table.id, table]));
const unitsOfTable = (tableId) =>
  UNITS.filter((unit) => unit.table === tableId).map((unit) => unit.id);

const KIND_ORDER = { table: 0, half: 1, whole: 2 };
const placementCache = new Map();

/* the ways a party can be seated, best first: a table for two before half
   a big table, half a big table before a whole one, so big tables stay
   whole for big parties as long as possible */
export function placementsFor(guests) {
  if (!placementCache.has(guests)) {
    const options = [];
    RESTAURANT.tables.forEach((table) => {
      if (!table.split) {
        if (guests <= table.seats) {
          options.push({ units: [table.id], seats: table.seats, kind: "table" });
        }
        return;
      }
      const halves = halvesOf(table).filter((half) => guests <= half.seats);
      halves.forEach((half) =>
        options.push({ units: [half.id], seats: half.seats, kind: "half" }),
      );
      if (!halves.length && guests <= table.seats) {
        options.push({ units: unitsOfTable(table.id), seats: table.seats, kind: "whole" });
      }
    });
    options.sort((a, b) => a.seats - b.seats || KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
    placementCache.set(guests, options);
  }
  return placementCache.get(guests);
}

/* ["3A", "3B"] -> "3" (the whole table), ["3A"] -> "3A", ["1"] -> "1" */
export function tableName(units) {
  if (!units?.length) return null;
  if (units.length === 1) return units[0];
  return UNIT_BY_ID.get(units[0])?.table ?? units.join("+");
}

/* is `units` a real way to seat this party? */
export function isPlacement(units, guests) {
  return placementsFor(guests).some(
    (option) =>
      option.units.length === units?.length &&
      option.units.every((unit) => units.includes(unit)),
  );
}

/* minutes after midnight the booking keeps its table */
export function occupancyOf(reservation) {
  const start = toMinutes(reservation.time);
  return { start, end: start + SEATING_MINUTES };
}

/* cancelled bookings and no-shows give their table back */
export const holdsTable = (reservation) =>
  ["booked", "arrived"].includes(statusOf(reservation));

const compareText = (a = "", b = "") => (a < b ? -1 : a > b ? 1 : 0);

/* fits every booking of one day that holds a table. Seated guests keep the
   table they were given (`reservation.table`); everyone else can be moved,
   which only matters on paper until they arrive. Returns { complete,
   tables }: tables maps a booking id to its units, or to null for a booking
   that could not be fitted (only possible after manual changes). */
export function planDay(reservations) {
  const holding = reservations.filter(holdsTable);
  const seated = holding.filter((reservation) => reservation.table?.length);
  const queue = holding
    .filter((reservation) => !reservation.table?.length)
    .map((reservation) => ({ reservation, ...occupancyOf(reservation) }))
    .sort(
      (a, b) =>
        a.start - b.start ||
        compareText(a.reservation.createdAt, b.reservation.createdAt) ||
        compareText(a.reservation.id, b.reservation.id),
    );

  /* seated guests are fixed blocks on their units */
  const blocks = new Map(UNITS.map((unit) => [unit.id, []]));
  seated.forEach((reservation) => {
    const span = occupancyOf(reservation);
    reservation.table.forEach((unit) => blocks.get(unit)?.push(span));
  });
  const isBlocked = (unit, start, end) =>
    blocks.get(unit).some((span) => span.start < end && start < span.end);
  const tableHasBlocks = (tableId) =>
    unitsOfTable(tableId).some((unit) => blocks.get(unit).length > 0);

  /* tables with no seated guests are interchangeable with their twins, so
     the search never tries the same arrangement twice under other names */
  const freeTables = RESTAURANT.tables.filter((table) => !tableHasBlocks(table.id));
  const fixedUnits = UNITS.filter((unit) => tableHasBlocks(unit.table)).map(
    (unit) => unit.id,
  );
  const twinGroups = new Map();
  freeTables.forEach((table) => {
    const key = table.split ? `s${table.split.join(",")}` : `t${table.seats}`;
    if (!twinGroups.has(key)) twinGroups.set(key, []);
    twinGroups.get(key).push(unitsOfTable(table.id));
  });

  /* when each unit is next free; bookings are placed in start order */
  const freeAt = new Map(UNITS.map((unit) => [unit.id, -Infinity]));
  const chosen = new Array(queue.length).fill(null);
  const deadEnds = new Set();
  let steps = 0;

  /* a unit already free by `start` is free for every later booking too, so
     all such times count as the same */
  const busyUntil = (unit, start) => {
    const time = freeAt.get(unit);
    return time <= start ? -Infinity : time;
  };
  const sortNumbers = (values) => values.sort((a, b) => a - b);

  const stateKey = (index) => {
    const { start } = queue[index];
    const parts = [index];
    twinGroups.forEach((tables) =>
      parts.push(
        tables
          .map((units) =>
            sortNumbers(units.map((unit) => busyUntil(unit, start))).join("/"),
          )
          .sort()
          .join(","),
      ),
    );
    fixedUnits.forEach((unit) => parts.push(busyUntil(unit, start)));
    return parts.join("|");
  };

  /* two options are the same move when their tables are twins in the same
     state; null when a table has seated guests and so has no twin */
  const moveSignature = (option, start) => {
    const tableId = UNIT_BY_ID.get(option.units[0]).table;
    if (tableHasBlocks(tableId)) return null;
    const table = TABLE_BY_ID.get(tableId);
    const own = sortNumbers(option.units.map((unit) => busyUntil(unit, start)));
    const rest = sortNumbers(
      unitsOfTable(tableId)
        .filter((unit) => !option.units.includes(unit))
        .map((unit) => busyUntil(unit, start)),
    );
    return `${option.kind}:${table.split?.join(",") ?? table.seats}:${own}:${rest}`;
  };

  const fits = (option, item) =>
    option.units.every(
      (unit) =>
        freeAt.get(unit) <= item.start && !isBlocked(unit, item.start, item.end),
    );

  const solve = (index) => {
    if (index === queue.length) return true;
    steps += 1;
    if (steps > MAX_STEPS) return false;
    const key = stateKey(index);
    if (deadEnds.has(key)) return false;

    const item = queue[index];
    const tried = new Set();
    for (const option of placementsFor(item.reservation.guests)) {
      if (!fits(option, item)) continue;
      const signature = moveSignature(option, item.start);
      if (signature) {
        if (tried.has(signature)) continue;
        tried.add(signature);
      }
      const previous = option.units.map((unit) => freeAt.get(unit));
      option.units.forEach((unit) => freeAt.set(unit, item.end));
      chosen[index] = option.units;
      if (solve(index + 1)) return true;
      option.units.forEach((unit, i) => freeAt.set(unit, previous[i]));
      chosen[index] = null;
    }
    deadEnds.add(key);
    return false;
  };

  let complete = solve(0);

  if (!complete) {
    /* no arrangement fits everyone: place who we can, first come first served */
    if (steps > MAX_STEPS) {
      console.warn("[tables] seating plan search was cut short");
    }
    UNITS.forEach((unit) => freeAt.set(unit.id, -Infinity));
    queue.forEach((item, index) => {
      const option = placementsFor(item.reservation.guests).find((candidate) =>
        fits(candidate, item),
      );
      chosen[index] = option?.units ?? null;
      option?.units.forEach((unit) => freeAt.set(unit, item.end));
    });
  }

  const tables = new Map();
  seated.forEach((reservation) => tables.set(reservation.id, reservation.table));
  queue.forEach((item, index) => tables.set(item.reservation.id, chosen[index]));
  return { complete, tables };
}

/* would a new party fit on that day as things stand? `reservations` are
   that day's bookings */
export function canSeat(reservations, { time, guests }) {
  if (!placementsFor(guests).length) return false;
  const candidate = {
    id: CANDIDATE_ID,
    time,
    guests,
    status: "booked",
    createdAt: "￿",
  };
  return planDay([...reservations, candidate]).complete;
}

/* the units a new party would get, or null when nobody can make room */
export function tableFor(reservations, { time, guests }) {
  const candidate = {
    id: CANDIDATE_ID,
    time,
    guests,
    status: "booked",
    createdAt: "￿",
  };
  const plan = planDay([...reservations, candidate]);
  return plan.complete ? plan.tables.get(CANDIDATE_ID) : null;
}

/* seats nobody is using at `minutes` (shop time) on that day */
export function freeSeatsAt(reservations, minutes) {
  const { tables } = planDay(reservations);
  const busy = new Set();
  reservations.filter(holdsTable).forEach((reservation) => {
    const { start, end } = occupancyOf(reservation);
    if (start <= minutes && minutes < end) {
      tables.get(reservation.id)?.forEach((unit) => busy.add(unit));
    }
  });
  return UNITS.filter((unit) => !busy.has(unit.id)).reduce(
    (sum, unit) => sum + unit.seats,
    0,
  );
}

/* tables a guest can be seated at on arrival: not taken by guests already
   sitting there, and leaving every other booking that day a table. When
   the day is already overbooked, any table nobody is sitting at. */
export function seatingOptions(reservations, reservation) {
  const span = occupancyOf(reservation);
  const others = reservations.filter((other) => other.id !== reservation.id);
  const taken = new Set(
    others
      .filter((other) => {
        if (!holdsTable(other) || !other.table?.length) return false;
        const { start, end } = occupancyOf(other);
        return start < span.end && span.start < end;
      })
      .flatMap((other) => other.table),
  );
  const free = placementsFor(reservation.guests).filter((option) =>
    option.units.every((unit) => !taken.has(unit)),
  );
  const workable = free.filter(
    (option) =>
      planDay([...others, { ...reservation, status: "arrived", table: option.units }])
        .complete,
  );
  return workable.length ? workable : free;
}
