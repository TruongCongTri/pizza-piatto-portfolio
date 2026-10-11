"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import DeskHeader from "@/components/DeskHeader/DeskHeader";
import DeskLogin from "@/components/DeskLogin/DeskLogin";
import ReservationControls, { listGroups } from "@/components/Reservations/ReservationControls";
import TransitionLink from "@/components/TransitionLink/TransitionLink";
import {
  filterClassBookings,
  filterReservations,
  mergeBookings,
} from "@/components/Reservations/reservation-list";
import { useDeskEvents } from "@/hooks/useDeskEvents";
import { useDragScroll } from "@/hooks/useDragScroll";
import { useIncremental } from "@/hooks/useIncremental";
import { useStuck } from "@/hooks/useStuck";
import { useUrlState } from "@/hooks/useUrlState";
import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate, formatGuests } from "@/i18n/format";
import { formatDateKey, formatShopTime, getRestaurantClock, getVisitState } from "@/lib/booking";
import { formatMoney, isPaymentPaid } from "@/lib/payments";
import { formatPhone } from "@/lib/phone";
import { tableName } from "@/lib/tables";
import { formatSeats, hasTimes, localized } from "@/lib/workshops";

import "../admin.css";
import "../workshops/classdesk.css";
import "./guests.css";

/* looked up once typing pauses this long */
const SEARCH_DELAY_MS = 250;
const VIEWS = ["all", "upcoming", "past"];
const KINDS = ["all", "tables", "classes"];
const SORTS = ["desc", "asc"];

const DAY = { weekday: "short", day: "numeric", month: "short", year: "numeric" };

const plural = (count, one, other) => (count === 1 ? one : fillTemplate(other, { count }));

/* a class's day (or first and last day) over its hours or its number of
   sessions, set like a table booking's date and time */
function classWhen(sessions, locale, t) {
  const first = sessions[0];
  const last = sessions.at(-1);
  if (!first) return { date: "", detail: "" };
  if (sessions.length === 1) {
    return {
      date: formatDateKey(first.date, locale, DAY),
      detail: hasTimes(first) ? `${first.start}–${first.end}` : "",
    };
  }
  const day = (session) => formatDateKey(session.date, locale, { day: "numeric", month: "short" });
  return {
    date: `${day(first)} – ${day(last)} ${last.date.slice(0, 4)}`,
    detail: fillTemplate(t.sessionsOther, { count: sessions.length }),
  };
}

/* staff look a guest up by phone number, name, email or booking code and
   see every table booking and class booking they made, in one list */
export default function GuestDesk() {
  const { dict } = useLocale();
  const t = dict.guestDesk;
  /* "loading" | "login" | "ready" */
  const [status, setStatus] = useState("loading");
  /* the lookup, the guest open and the filters on their bookings, kept in
     the address (?q=&guest=&type=&show=&sort=): links from the other
     desks arrive with the guest to look up, and a reload keeps the view */
  const [filters, setFilters] = useUrlState(
    { query: "", guest: "", kind: "all", view: "all", sort: "desc" },
    {
      names: { query: "q", kind: "type", view: "show" },
      options: { kind: KINDS, view: VIEWS, sort: SORTS },
      remember: "admin-guests",
    },
  );
  const query = filters.query;
  const setQuery = (text) => setFilters((prev) => ({ ...prev, query: text }));
  const selectedPhone = filters.guest || null;
  const setSelectedPhone = useCallback(
    (next) =>
      setFilters((prev) => ({
        ...prev,
        guest: (typeof next === "function" ? next(prev.guest || null) : next) ?? "",
      })),
    [setFilters],
  );
  const [guests, setGuests] = useState([]);
  const [searching, setSearching] = useState(false);
  const latestRequestRef = useRef(0);
  /* several matches: a row to swipe (or drag) through on a phone */
  const resultsRef = useDragScroll();
  const groups = useMemo(() => listGroups(dict.reservations, { kinds: KINDS, views: VIEWS }), [dict]);

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => {});
    setGuests([]);
    setStatus("login");
  }

  const search = useCallback(async (text) => {
    const request = ++latestRequestRef.current;
    setSearching(true);
    try {
      const response = await fetch(`/api/admin/guests?q=${encodeURIComponent(text)}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        setStatus("login");
        return;
      }
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const data = await response.json();
      /* an answer to an older search arriving late is dropped */
      if (request !== latestRequestRef.current) return;
      setGuests(data.guests);
      setStatus("ready");
      setSelectedPhone((current) =>
        data.guests.some((guest) => guest.phone === current) ? current : (data.guests[0]?.phone ?? null),
      );
    } catch {
      if (request === latestRequestRef.current) setGuests([]);
    } finally {
      if (request === latestRequestRef.current) setSearching(false);
    }
  }, [setSelectedPhone]);

  /* looks up as the name or number is typed */
  useEffect(() => {
    if (status === "login") return undefined;
    const text = query.trim();
    const timer = setTimeout(() => search(text), text ? SEARCH_DELAY_MS : 0);
    return () => clearTimeout(timer);
  }, [query, search, status]);

  /* a booking or class booking made or changed elsewhere updates the
     guests shown */
  useDeskEvents(
    ["reservations", "classes"],
    () => search(query.trim()),
    status === "ready" && query.trim().length >= 2,
  );

  if (status === "login") {
    return <DeskLogin title={t.title} intro={t.loginIntro} onSignedIn={() => setStatus("loading")} />;
  }

  const selected = guests.find((guest) => guest.phone === selectedPhone) ?? null;
  const typed = query.trim().length >= 2;

  return (
    <section className="desk class-desk guest-desk">
      <div className="container">
        <DeskHeader
          current="guests"
          eyebrow={t.eyebrow}
          title={t.title}
          onSignOut={signOut}
          panel={{
            filters,
            onChange: setFilters,
            groups,
            search: { label: t.search, placeholder: t.placeholder },
          }}
          filters={
            <label className="rs-group gd-search">
              <span className="rs-label">{t.search}</span>
              <span className="reserve-input">
                <input
                  type="search"
                  value={query}
                  placeholder={t.placeholder}
                  autoFocus
                  onChange={(e) => setQuery(e.target.value)}
                />
                <span className="reserve-input-line" />
              </span>
            </label>
          }
        />

        {!typed ? (
          <p className="md gd-hint">{t.start}</p>
        ) : guests.length === 0 ? (
          <p className="md desk-empty">{searching || status === "loading" ? dict.admin.loading : t.empty}</p>
        ) : (
          <div className={`gd-layout ${guests.length > 1 ? "has-results" : ""}`}>
            {guests.length > 1 && (
              <nav className="gd-results" aria-label={t.search} ref={resultsRef} data-lenis-prevent-touch>
                {guests.map((guest) => (
                  <button
                    type="button"
                    key={guest.phone}
                    className={`cd-class gd-guest ${guest.phone === selectedPhone ? "is-active" : ""}`}
                    aria-current={guest.phone === selectedPhone ? "true" : undefined}
                    onClick={() => setSelectedPhone(guest.phone)}
                  >
                    <span className="cd-class-title">{guest.name || formatPhone(guest.phone)}</span>
                    <span className="mono cd-class-when">{formatPhone(guest.phone)}</span>
                    <span className="cd-class-meta">
                      <span>{plural(guest.reservations.length, t.tableOne, t.tableOther)}</span>
                      <span>{plural(guest.classBookings.length, t.classOne, t.classOther)}</span>
                    </span>
                  </button>
                ))}
              </nav>
            )}
            {selected && (
              <GuestDetail guest={selected} filters={filters} onFilters={setFilters} groups={groups} />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* one guest: who they are, then their tables and classes by date */
function GuestDetail({ guest, filters, onFilters, groups }) {
  const { locale, dict } = useLocale();
  const t = dict.guestDesk;
  const r = dict.reservations;
  /* the bookings a few at a time, from the first again for another guest
     or filter */
  const {
    count: rowsShown,
    hasMore: rowsMore,
    sentinelRef: rowsSentinel,
  } = useIncremental(Infinity, {
    resetKey: `${guest.phone}|${filters.kind}|${filters.view}|${filters.sort}`,
  });
  const [headRef, headStuck] = useStuck();
  const clock = getRestaurantClock();
  const items = useMemo(() => {
    /* the page's query looks guests up; it doesn't filter their bookings */
    const options = { ...filters, query: "", locale, clock };
    return mergeBookings(
      {
        reservations: filters.kind === "classes" ? [] : filterReservations(guest.reservations, options),
        classBookings: filters.kind === "tables" ? [] : filterClassBookings(guest.classBookings, options),
      },
      filters,
    );
  }, [guest, filters, locale, clock.dateKey, clock.minutes]);

  return (
    <div className="gd-detail">
      {/* who the guest is and the filters stay put under the pinned
          header; only their bookings scroll */}
      <div className={`gd-detail-top ${headStuck ? "is-stuck" : ""}`} ref={headRef}>
        <header className="gd-guest-head">
          <div className="gd-guest-name">
            <h5>{guest.name || formatPhone(guest.phone)}</h5>
            <p className="gd-contact">
              <a className="hover-line" href={`tel:${guest.phone}`}>
                {formatPhone(guest.phone)}
              </a>
              {guest.email && (
                <a className="hover-line" href={`mailto:${guest.email}`}>
                  {guest.email}
                </a>
              )}
            </p>
          </div>
          <p className="mono gd-counts">
            {plural(guest.reservations.length, t.tableOne, t.tableOther)} ·{" "}
            {plural(guest.classBookings.length, t.classOne, t.classOther)}
          </p>
        </header>

        <ReservationControls
          filters={filters}
          onChange={onFilters}
          groups={groups}
          search={false}
          countLabels={{ one: r.bookingOne, other: r.bookingOther }}
          count={items.length}
          sticky={false}
        />
      </div>

      {items.length === 0 ? (
        <p className="sm desk-empty">{r.noBookings}</p>
      ) : (
        <ul className="gd-rows">
          {items.slice(0, rowsShown).map(({ kind, item }) =>
            kind === "table" ? (
              <TableRow key={item.id} reservation={item} clock={clock} />
            ) : (
              <ClassRow key={item.id} booking={item} clock={clock} />
            ),
          )}
          {rowsMore && rowsShown < items.length && (
            <li className="list-sentinel" ref={rowsSentinel} aria-hidden="true" />
          )}
        </ul>
      )}
    </div>
  );
}

/* rows redraw only when their booking or the minute changes (the clock is
   a fresh object each time) */
const sameMinute = (prev, next) =>
  (prev.reservation ?? prev.booking) === (next.reservation ?? next.booking) &&
  prev.clock.dateKey === next.clock.dateKey &&
  prev.clock.minutes === next.clock.minutes;

const TableRow = memo(function TableRow({ reservation, clock }) {
  const { locale, dict, localize } = useLocale();
  const states = dict.admin.states;
  const state = getVisitState(reservation, clock);
  const label = {
    booked: states.booked,
    late: fillTemplate(states.late, { minutes: state.lateMinutes }),
    arrived: fillTemplate(states.arrived, {
      time: reservation.arrivedAt ? formatShopTime(reservation.arrivedAt, locale) : reservation.time,
    }),
    noShow: states.noShow,
    cancelled: states.cancelled,
  }[state.display];

  return (
    <li className={`gd-row is-${state.display} ${reservation.date < clock.dateKey ? "is-past" : ""}`}>
      <span className="gd-kind">{dict.guestDesk.kinds.table}</span>
      <div className="gd-when">
        <p className="gd-date">{formatDateKey(reservation.date, locale, DAY)}</p>
        <p className="mono">{reservation.time}</p>
      </div>
      <div className="gd-what">
        <p>
          {formatGuests(reservation.guests, dict.reserve)}
          {reservation.table?.length
            ? ` · ${fillTemplate(dict.admin.table, { name: tableName(reservation.table) })}`
            : ""}
        </p>
        {reservation.notes && <p className="sm gd-notes">{reservation.notes}</p>}
      </div>
      <p className={`mono desk-state is-${state.display}`}>
        <span className="desk-state-dot" aria-hidden="true" />
        {label}
      </p>
      <div className="gd-meta">
        <p className="mono">{reservation.id}</p>
        <TransitionLink className="hover-line desk-link" href={localize(`/admin?q=${encodeURIComponent(reservation.id)}&show=all`)}>
          {dict.guestDesk.openTables}
        </TransitionLink>
      </div>
    </li>
  );
}, sameMinute);

const ClassRow = memo(function ClassRow({ booking, clock }) {
  const { locale, dict, localize } = useLocale();
  const t = dict.classDesk;
  const { workshop } = booking;
  const isPast = (workshop.sessions.at(-1)?.date ?? "") < clock.dateKey;
  const when = classWhen(workshop.sessions, locale, dict.workshops);

  return (
    <li className={`gd-row is-${booking.status} ${isPast ? "is-past" : ""}`}>
      <span className="gd-kind is-class">{dict.guestDesk.kinds.class}</span>
      <div className="gd-when">
        <p className="gd-date">{when.date}</p>
        {when.detail && <p className="mono">{when.detail}</p>}
      </div>
      <div className="gd-what">
        <p>{localized(workshop.title, locale)}</p>
        <p className="sm">
          {formatSeats(booking.seats, dict.workshops.form)} · {formatMoney(booking.amount, locale)}
        </p>
      </div>
      <div className="gd-state">
        <p className={`mono desk-state cd-state is-${booking.status}`}>
          <span className="desk-state-dot" aria-hidden="true" />
          {t.enrollment[booking.status]}
        </p>
        {booking.payments.length > 0 && (
          <p className="cd-pays">
            {booking.payments.map((payment) => (
              <span key={payment.id} className={`cd-pay is-${payment.status}`} title={payment.id}>
                {payment.id !== booking.paymentId && isPaymentPaid(payment.status)
                  ? `${fillTemplate(t.extra, { amount: formatMoney(payment.amount, locale) })} · `
                  : ""}
                {t.payment[payment.status]}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="gd-meta">
        <p className="mono">{booking.id}</p>
        <TransitionLink
          className="hover-line desk-link"
          href={localize(`/admin/workshops?class=${encodeURIComponent(booking.workshopId)}`)}
        >
          {dict.guestDesk.openClasses}
        </TransitionLink>
      </div>
    </li>
  );
}, sameMinute);
