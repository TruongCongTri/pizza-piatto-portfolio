"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import DeskHeader from "@/components/DeskHeader/DeskHeader";
import DeskLogin from "@/components/DeskLogin/DeskLogin";
import { FieldShell, TextField } from "@/components/Reserve/Fields";
import ReservationControls, { listGroups } from "@/components/Reservations/ReservationControls";
import {
  filterReservations,
  groupByDate,
} from "@/components/Reservations/reservation-list";
import { useToast } from "@/components/Toast/ToastProvider";
import TransitionLink from "@/components/TransitionLink/TransitionLink";
import { useDeskEvents } from "@/hooks/useDeskEvents";
import { useIncremental } from "@/hooks/useIncremental";
import { useUrlState } from "@/hooks/useUrlState";
import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate, formatGuests } from "@/i18n/format";
import { DEMO_GUEST_PHONE } from "@/lib/demo-reservations";
import {
  formatDateKey,
  formatShopTime,
  getBookableDays,
  getOpeningHours,
  getRestaurantClock,
  getVisitState,
  intlLocale,
  MAX_GUESTS,
  MAX_LENGTH,
  MIN_GUESTS,
  statusOf,
} from "@/lib/booking";
import { formatPhone } from "@/lib/phone";
import { RESTAURANT, toTime } from "@/lib/restaurant";
import {
  canSeat,
  freeSeatsAt,
  holdsTable,
  planDay,
  seatingOptions,
  tableFor,
  tableName,
} from "@/lib/tables";

import "./admin.css";

const JSON_HEADERS = { "Content-Type": "application/json" };
const VIEWS = ["today", "upcoming", "past", "all"];
const STATUSES = ["all", "booked", "arrived", "noShow", "cancelled"];
const SORTS = ["asc", "desc"];
const EMPTY_DRAFT = {
  kind: "booking",
  name: "",
  phone: "",
  email: "",
  guests: 2,
  date: "",
  time: "",
  notes: "",
};

const pad = (value) => String(value).padStart(2, "0");

const sameUnits = (a, b) =>
  Boolean(a && b) && a.length === b.length && a.every((unit) => b.includes(unit));

/* the staff view of every booking: who is coming, at which table, checking
   guests in, and booking phone calls and walk-ins */
export default function ReservationDesk() {
  const { locale, dict } = useLocale();
  const t = dict.admin;
  const { toast } = useToast();

  /* "loading" | "login" | "ready" */
  const [status, setStatus] = useState("loading");
  const [reservations, setReservations] = useState([]);
  const [freshIds, setFreshIds] = useState(() => new Set());
  const [lastSync, setLastSync] = useState(null);
  const [offline, setOffline] = useState(false);
  /* today's bookings first; kept in the address (?q=&show=&status=&sort=)
     so a reload, a link or the back button opens the same list */
  const [filters, setFilters] = useUrlState(
    { query: "", view: "today", status: "all", sort: "asc" },
    {
      names: { query: "q", view: "show" },
      options: { view: VIEWS, status: STATUSES, sort: SORTS },
      remember: "admin-tables",
    },
  );
  /* one dialog at a time: { type, id }, type being an action
     ("checkIn" | "undo" | "noShow" | "cancel") or "create"; kept while the
     dialog animates out */
  const [dialog, setDialog] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [tableChoice, setTableChoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [draftErrors, setDraftErrors] = useState({});
  const [demoTools, setDemoTools] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const versionRef = useRef(null);
  const knownIdsRef = useRef(null);

  const displayName = useCallback(
    (reservation) => reservation.name || t.walkIn,
    [t],
  );

  const shortDate = useCallback(
    (dateKey) =>
      formatDateKey(dateKey, locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    [locale],
  );

  const announce = useCallback(
    (reservation) =>
      toast({
        eyebrow: t.toasts.newEyebrow,
        title: displayName(reservation),
        message: fillTemplate(t.toasts.newMessage, {
          date: shortDate(reservation.date),
          time: reservation.time,
          guests: formatGuests(reservation.guests, dict.reserve),
        }),
        duration: 12_000,
      }),
    [toast, t, dict, shortDate, displayName],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/admin/reservations?version=${versionRef.current ?? ""}`,
        { cache: "no-store" },
      );
      if (response.status === 401) {
        versionRef.current = null;
        knownIdsRef.current = null;
        setStatus("login");
        return;
      }
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);

      const data = await response.json();
      setOffline(false);
      setLastSync(new Date());
      setDemoTools(Boolean(data.demoTools));
      if (data.unchanged) return;

      /* anything we have not seen before is a new booking */
      const known = knownIdsRef.current;
      if (known) {
        const arrivals = data.reservations
          .filter((reservation) => !known.has(reservation.id))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        arrivals.forEach(announce);
        if (arrivals.length) {
          setFreshIds((prev) => new Set([...prev, ...arrivals.map(({ id }) => id)]));
        }
      }
      knownIdsRef.current = new Set(data.reservations.map(({ id }) => id));
      versionRef.current = data.version;
      setReservations(data.reservations);
      setStatus("ready");
    } catch {
      setOffline(true);
    }
  }, [announce]);

  const isSignedOut = status === "login";

  /* read the bookings once when signed in, then again only when the
     server says they changed (a guest booked or cancelled, another desk
     acted) or the tab is looked at again: no asking on a timer */
  useEffect(() => {
    if (!isSignedOut) refresh();
  }, [isSignedOut, refresh]);
  useDeskEvents("reservations", refresh, !isSignedOut);


  /* sample bookings: loaded or cleared, then the list reloads without a
     "new reservation" toast for each one */
  async function runDemo(action) {
    if (demoBusy) return;
    setDemoBusy(true);
    try {
      const response = await fetch("/api/admin/demo", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const result = await response.json();
      versionRef.current = null;
      knownIdsRef.current = null;
      setFreshIds(new Set());
      await refresh();
      toast({
        eyebrow: t.demo.eyebrow,
        title:
          action === "seed"
            ? fillTemplate(t.demo.loaded, { count: result.added })
            : t.demo.cleared,
        message:
          action === "seed"
            ? fillTemplate(t.demo.guestHint, { phone: formatPhone(DEMO_GUEST_PHONE) })
            : undefined,
      });
    } catch {
      failToast();
    } finally {
      setDemoBusy(false);
    }
  }

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => {});
    versionRef.current = null;
    knownIdsRef.current = null;
    setReservations([]);
    setFreshIds(new Set());
    setStatus("login");
  }

  const clock = getRestaurantClock();

  const byDate = useMemo(() => {
    const days = new Map();
    reservations.forEach((reservation) => {
      if (!days.has(reservation.date)) days.set(reservation.date, []);
      days.get(reservation.date).push(reservation);
    });
    return days;
  }, [reservations]);

  /* table plans are worked out per day, only for days being looked at */
  const planFor = useMemo(() => {
    const plans = new Map();
    return (dateKey) => {
      if (!plans.has(dateKey)) plans.set(dateKey, planDay(byDate.get(dateKey) ?? []));
      return plans.get(dateKey);
    };
  }, [byDate]);

  const dayOf = useCallback((dateKey) => byDate.get(dateKey) ?? [], [byDate]);
  const findReservation = (id) => reservations.find((reservation) => reservation.id === id);

  /* the rows get one action handler that never changes, so a row only
     redraws when its own booking does */
  const openActionRef = useRef(null);
  openActionRef.current = openAction;
  const onRowAction = useCallback((type, reservation) => openActionRef.current(type, reservation), []);

  function openAction(type, reservation) {
    if (type === "checkIn") {
      const options = seatingOptions(dayOf(reservation.date), reservation);
      const planned = planFor(reservation.date).tables.get(reservation.id);
      const preferred =
        options.find((option) => sameUnits(option.units, planned)) ?? options[0];
      setTableChoice(preferred?.units ?? null);
    }
    setDialog({ type, id: reservation.id });
    setIsDialogOpen(true);
  }

  function openCreate() {
    setDraft({ ...EMPTY_DRAFT, date: clock.dateKey });
    setDraftErrors({});
    setDialog({ type: "create" });
    setIsDialogOpen(true);
  }

  function actionToast(type, reservation) {
    const name = displayName(reservation);
    switch (type) {
      case "checkIn":
        return {
          eyebrow: t.toasts.arrivedEyebrow,
          title: fillTemplate(t.toasts.arrivedTitle, { name }),
          message: reservation.table?.length
            ? fillTemplate(t.toasts.arrivedMessage, { table: tableName(reservation.table) })
            : undefined,
        };
      case "undo":
        return { eyebrow: t.toasts.undoEyebrow, title: fillTemplate(t.toasts.undoTitle, { name }) };
      case "noShow":
        return { eyebrow: t.toasts.noShowEyebrow, title: fillTemplate(t.toasts.noShowTitle, { name }) };
      default:
        return {
          eyebrow: t.toasts.cancelledEyebrow,
          title: fillTemplate(t.toasts.cancelledTitle, { name }),
        };
    }
  }

  const failToast = () =>
    toast({
      tone: "error",
      eyebrow: t.toasts.errorEyebrow,
      title: t.toasts.errorTitle,
      message: t.toasts.errorMessage,
    });

  async function runAction() {
    if (!dialog || saving) return;
    const { type, id } = dialog;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/reservations/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({
          action: type,
          ...(type === "checkIn" && tableChoice ? { table: tableChoice } : {}),
        }),
      });
      if (response.status === 401) {
        setIsDialogOpen(false);
        setStatus("login");
        return;
      }
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);

      const { reservation } = await response.json();
      setReservations((prev) =>
        prev.map((item) => (item.id === reservation.id ? reservation : item)),
      );
      setIsDialogOpen(false);
      toast(actionToast(type, reservation));
    } catch {
      failToast();
    } finally {
      setSaving(false);
    }
  }

  async function submitDraft() {
    if (saving) return;
    setSaving(true);
    setDraftErrors({});
    try {
      const response = await fetch("/api/admin/reservations", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...draft, locale }),
      });
      if (response.status === 401) {
        setIsDialogOpen(false);
        setStatus("login");
        return;
      }
      const data = await response.json().catch(() => ({}));
      if (response.status === 422 && data.fields) {
        setDraftErrors(data.fields);
        return;
      }
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);

      const created = data.reservation;
      /* our own booking is not news: no "new reservation" toast for it */
      knownIdsRef.current?.add(created.id);
      setReservations((prev) => [...prev, created]);
      setIsDialogOpen(false);
      toast(
        created.source === "walkIn"
          ? {
              eyebrow: t.toasts.walkInEyebrow,
              title: displayName(created),
              message: fillTemplate(t.toasts.arrivedMessage, {
                table: tableName(created.table),
              }),
            }
          : {
              eyebrow: t.toasts.createdEyebrow,
              title: displayName(created),
              message: fillTemplate(t.toasts.newMessage, {
                date: shortDate(created.date),
                time: created.time,
                guests: formatGuests(created.guests, dict.reserve),
              }),
            },
      );
    } catch {
      failToast();
    } finally {
      setSaving(false);
    }
  }

  const todays = dayOf(clock.dateKey);
  const hoursToday = getOpeningHours(clock.dateKey);
  const isOpenNow =
    Boolean(hoursToday) &&
    clock.minutes >= hoursToday.open &&
    clock.minutes < hoursToday.close;
  const stats = [
    {
      key: "today",
      value: pad(todays.filter((reservation) => statusOf(reservation) !== "cancelled").length),
    },
    {
      key: "guests",
      value: pad(todays.filter(holdsTable).reduce((sum, { guests }) => sum + guests, 0)),
    },
    {
      key: "arrived",
      value: pad(todays.filter((reservation) => statusOf(reservation) === "arrived").length),
    },
    {
      key: "freeNow",
      value: isOpenNow ? pad(freeSeatsAt(todays, clock.minutes)) : "—",
    },
  ];

  const visible = useMemo(
    () => filterReservations(reservations, { ...filters, locale, clock }),
    [reservations, filters, locale, clock.dateKey, clock.minutes],
  );
  /* the bookings a few at a time, more as the end of the list comes near;
     from the first again on a new search or filter */
  const { count: shown, hasMore, sentinelRef } = useIncremental(visible.length, {
    resetKey: `${filters.query}|${filters.view}|${filters.status}|${filters.sort}`,
  });
  const groups = useMemo(
    () => groupByDate(visible.slice(0, shown)),
    [visible, shown],
  );
  const filterGroups = useMemo(
    () => listGroups(dict.reservations, { views: VIEWS, statuses: STATUSES }),
    [dict],
  );
  const countLabel =
    visible.length === 1
      ? dict.reservations.countOne
      : fillTemplate(dict.reservations.countOther, { count: visible.length });
  const liveText = offline
    ? t.offline
    : lastSync
      ? `${t.live} · ${fillTemplate(t.updated, {
          time: formatShopTime(lastSync.toISOString(), locale),
        })}`
      : t.loading;

  const bookedFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(intlLocale(locale), {
        timeZone: RESTAURANT.timeZone,
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    [locale],
  );

  if (status === "login") {
    return <DeskLogin onSignedIn={() => setStatus("loading")} />;
  }

  /* ---------- the open dialog ---------- */

  const dialogReservation = dialog?.id ? findReservation(dialog.id) : null;
  const details = dialogReservation
    ? fillTemplate(t.dialogs.details, {
        name: displayName(dialogReservation),
        guests: formatGuests(dialogReservation.guests, dict.reserve),
        date: shortDate(dialogReservation.date),
        time: dialogReservation.time,
      })
    : "";
  const tableOptions =
    dialog?.type === "checkIn" && dialogReservation
      ? seatingOptions(dayOf(dialogReservation.date), dialogReservation)
      : [];

  let dialogProps;
  if (dialog?.type === "create") {
    const isWalkIn = draft.kind === "walkIn";
    const walkInTable = isWalkIn
      ? tableFor(todays, { time: toTime(clock.minutes), guests: draft.guests })
      : null;
    dialogProps = {
      eyebrow: t.create.eyebrow,
      title: t.create.title,
      confirmLabel: saving ? t.create.saving : isWalkIn ? t.create.seat : t.create.save,
      cancelLabel: t.create.cancel,
      confirmDisabled: isWalkIn && !walkInTable,
      focusConfirm: false,
      wide: true,
      onConfirm: submitDraft,
      children: (
        <BookingDraft
          draft={draft}
          errors={draftErrors}
          clock={clock}
          dayOf={dayOf}
          walkInTable={walkInTable}
          onChange={(field, value) => {
            setDraft((prev) => ({ ...prev, [field]: value }));
            setDraftErrors((prev) => ({ ...prev, [field]: undefined }));
          }}
        />
      ),
    };
  } else if (dialog) {
    const copy = t.dialogs[dialog.type];
    dialogProps = {
      eyebrow: copy.eyebrow,
      title: copy.title,
      message: copy.note ? `${details}. ${copy.note}` : details,
      confirmLabel: copy.confirm,
      cancelLabel: t.dialogs.back,
      onConfirm: runAction,
      children:
        dialog.type === "checkIn" && tableOptions.length > 0 ? (
          <div className="rs-group desk-table-choice">
            <span className="rs-label">{copy.table}</span>
            <div className="rs-chips" role="radiogroup" aria-label={copy.table}>
              {tableOptions.map((option) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={sameUnits(option.units, tableChoice)}
                  key={option.units.join("+")}
                  className={`rs-chip ${sameUnits(option.units, tableChoice) ? "active" : ""}`}
                  onClick={() => setTableChoice(option.units)}
                >
                  {fillTemplate(t.table, { name: tableName(option.units) })}
                </button>
              ))}
            </div>
          </div>
        ) : null,
    };
  }

  return (
    <section className="desk">
      <div className="container">
        <DeskHeader
          current="tables"
          eyebrow={t.eyebrow}
          title={t.title}
          liveText={liveText}
          offline={offline}
          onSignOut={signOut}
          action={{ label: t.newBooking, onClick: openCreate }}
          stats={stats.map(({ key, value }) => ({ key, value, label: t.stats[key] }))}
          panel={{
            filters,
            onChange: setFilters,
            groups: filterGroups,
            summary: countLabel,
          }}
          filters={
            <ReservationControls
              filters={filters}
              onChange={setFilters}
              views={VIEWS}
              statuses={STATUSES}
              count={visible.length}
              sticky={false}
            />
          }
        >
          {demoTools && (
            <div className="desk-demo">
              <p className="mono">{t.demo.eyebrow}</p>
              <button
                type="button"
                className="desk-link hover-line"
                disabled={demoBusy}
                onClick={() => runDemo("seed")}
              >
                {t.demo.load}
              </button>
              <button
                type="button"
                className="desk-link hover-line"
                disabled={demoBusy}
                onClick={() => runDemo("clear")}
              >
                {t.demo.clear}
              </button>
              <p className="mono desk-demo-hint">
                {fillTemplate(t.demo.guestHint, { phone: formatPhone(DEMO_GUEST_PHONE) })}
              </p>
            </div>
          )}
        </DeskHeader>

        <div className="rs-results">
          {status === "loading" ? (
            <p className="mono desk-empty">{t.loading}</p>
          ) : groups.length === 0 ? (
            <p className="md desk-empty">{dict.reservations.empty}</p>
          ) : (
            <div className="desk-days">
              {groups.map((group) => {
                const isPastDay = group.date < clock.dateKey;
                const active = group.items.filter(holdsTable);
                const guests = active.reduce((sum, item) => sum + item.guests, 0);
                const plan = planFor(group.date);
                return (
                  <section
                    className={`desk-day ${isPastDay ? "is-past" : ""}`}
                    key={group.date}
                  >
                    <header className="desk-day-head">
                      <span className="desk-day-number">{pad(Number(group.date.slice(8)))}</span>
                      <div className="desk-day-label">
                        <p className="mono">
                          {formatDateKey(group.date, locale, { weekday: "long" })}
                        </p>
                        <p className="mono">
                          {formatDateKey(group.date, locale, {
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                      </div>
                      {group.date === clock.dateKey && (
                        <span className="desk-today">{dict.ticket.today}</span>
                      )}
                      <p className="mono desk-day-count">
                        {fillTemplate(t.day, {
                          bookings:
                            group.items.length === 1
                              ? dict.reservations.countOne
                              : fillTemplate(dict.reservations.countOther, {
                                  count: group.items.length,
                                }),
                          guests: formatGuests(guests, dict.reserve),
                        })}
                      </p>
                    </header>

                    <ul className="desk-rows">
                      {group.items.map((reservation) => (
                        <DeskRow
                          key={reservation.id}
                          reservation={reservation}
                          state={getVisitState(reservation, clock)}
                          units={plan.tables.get(reservation.id)}
                          isFresh={freshIds.has(reservation.id)}
                          bookedAt={bookedFormat.format(new Date(reservation.createdAt))}
                          onAction={onRowAction}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}

              {hasMore && <span className="list-sentinel" ref={sentinelRef} aria-hidden="true" />}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={isDialogOpen}
        busy={saving}
        onCancel={() => setIsDialogOpen(false)}
        {...dialogProps}
      />
    </section>
  );
}

/* a row redraws only when what it shows changes (the visit state is a
   fresh object each time, so it is compared by value) */
const sameRow = (prev, next) =>
  prev.reservation === next.reservation &&
  prev.units === next.units &&
  prev.isFresh === next.isFresh &&
  prev.bookedAt === next.bookedAt &&
  prev.onAction === next.onAction &&
  JSON.stringify(prev.state) === JSON.stringify(next.state);

const DeskRow = memo(function DeskRow({ reservation, state, units, isFresh, bookedAt, onAction }) {
  const { locale, dict, localize } = useLocale();
  const t = dict.admin;
  const name = reservation.name || t.walkIn;
  const isSeated = Boolean(reservation.table?.length);
  const holds = ["booked", "late", "arrived"].includes(state.display);

  const stateLabel = {
    booked: t.states.booked,
    late: fillTemplate(t.states.late, { minutes: state.lateMinutes }),
    arrived: fillTemplate(t.states.arrived, {
      time: reservation.arrivedAt
        ? formatShopTime(reservation.arrivedAt, locale)
        : reservation.time,
    }),
    noShow: t.states.noShow,
    cancelled: t.states.cancelled,
  }[state.display];

  /* when check-in will open, for bookings not there yet */
  let hint = null;
  if (state.status === "booked" && !state.canCheckIn && !state.isPastDay) {
    if (state.display === "noShow") hint = t.hints.closed;
    else if (state.isToday) {
      hint = fillTemplate(t.hints.opensAt, { time: toTime(state.opensAt) });
    } else {
      hint = fillTemplate(t.hints.opensOn, {
        date: formatDateKey(reservation.date, locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
      });
    }
  }

  const link = (action) => (
    <button
      type="button"
      className="desk-link hover-line"
      onClick={() => onAction(action, reservation)}
    >
      {t.actions[action]}
    </button>
  );

  return (
    <li
      className={`desk-row is-${state.display} ${state.isPastDay ? "is-past" : ""} ${isFresh ? "is-fresh" : ""}`}
    >
      <p className="desk-time">{reservation.time}</p>

      <div className="desk-guest">
        <p className="desk-name">
          {name}
          {isFresh && <span className="desk-new">{t.new}</span>}
        </p>
        {reservation.notes && <p className="sm desk-notes">{reservation.notes}</p>}
      </div>

      <p className="mono desk-party">{formatGuests(reservation.guests, dict.reserve)}</p>

      <div className="desk-contact">
        {reservation.phone && (
          <a className="hover-line" href={`tel:${reservation.phone}`}>
            {formatPhone(reservation.phone)}
          </a>
        )}
        {reservation.email && (
          <a className="hover-line" href={`mailto:${reservation.email}`}>
            {reservation.email}
          </a>
        )}
        {reservation.phone && (
          <TransitionLink
            className="hover-line desk-history"
            href={localize(`/admin/guests?q=${encodeURIComponent(reservation.phone)}`)}
          >
            {dict.guestDesk.history}
          </TransitionLink>
        )}
      </div>

      <div className="desk-meta">
        <p className="mono">{reservation.id}</p>
        <p className="mono">{fillTemplate(t.booked, { date: bookedAt })}</p>
      </div>

      <p
        className={`mono desk-table ${isSeated ? "is-seated" : ""}`}
        title={holds ? (isSeated ? t.seated : t.planned) : undefined}
      >
        {holds
          ? units
            ? fillTemplate(t.table, { name: tableName(units) })
            : t.noTable
          : "—"}
      </p>

      <div className="desk-visit">
        <p className={`mono desk-state is-${state.display}`}>
          <span className="desk-state-dot" aria-hidden="true" />
          {stateLabel}
        </p>
        <div className="desk-actions">
          {state.canCheckIn && (
            <button
              type="button"
              className="rs-chip desk-checkin"
              onClick={() => onAction("checkIn", reservation)}
            >
              {t.actions.checkIn}
            </button>
          )}
          {hint && <span className="desk-hint">{hint}</span>}
          {state.canMarkNoShow && link("noShow")}
          {state.canUndo && link("undo")}
          {state.canCancel && link("cancel")}
        </div>
      </div>
    </li>
  );
}, sameRow);

/* the "new booking" form: a phone booking on any open day and time with a
   table free, or a walk-in seated now */
function BookingDraft({ draft, errors, clock, dayOf, walkInTable, onChange }) {
  const { locale, dict } = useLocale();
  const t = dict.admin.create;
  const r = dict.reserve;
  const isWalkIn = draft.kind === "walkIn";
  const errorText = (field) => {
    const key = errors[field];
    if (!key) return undefined;
    return fillTemplate(r.errors[key] ?? t.errors[key] ?? r.errors.unavailable, {
      max: MAX_GUESTS,
    });
  };

  /* the desk books with no notice period; free times are worked out once
     per party size rather than on every keystroke */
  const days = useMemo(
    () => getBookableDays(clock, { noticeMinutes: 0 }),
    [clock.dateKey, clock.minutes],
  );
  const freeTimes = useMemo(
    () =>
      new Map(
        days.map((option) => [
          option.key,
          new Set(
            option.timeSlots.filter((time) =>
              canSeat(dayOf(option.key), { time, guests: draft.guests }),
            ),
          ),
        ]),
      ),
    [days, dayOf, draft.guests],
  );
  const day = days.find((option) => option.key === draft.date);
  const timeFree = (dateKey, time) => freeTimes.get(dateKey)?.has(time) ?? false;
  const dayFull = (option) => option.isOpen && freeTimes.get(option.key)?.size === 0;

  return (
    <div className="desk-draft">
      <div className="rs-chips" role="radiogroup">
        {["booking", "walkIn"].map((kind) => (
          <button
            type="button"
            role="radio"
            aria-checked={draft.kind === kind}
            key={kind}
            className={`rs-chip ${draft.kind === kind ? "active" : ""}`}
            onClick={() => onChange("kind", kind)}
          >
            {t.kinds[kind]}
          </button>
        ))}
      </div>

      <div className="desk-draft-grid">
        <TextField
          field="name"
          label={isWalkIn ? t.walkInName : r.fields.name}
          placeholder={isWalkIn ? dict.admin.walkIn : r.fields.namePlaceholder}
          maxLength={MAX_LENGTH.name}
          value={draft.name}
          error={errorText("name")}
          onChange={onChange}
          autoFocus
        />
        <TextField
          field="phone"
          type="tel"
          label={r.fields.phone}
          hint={isWalkIn ? r.fields.optional : undefined}
          placeholder={r.fields.phonePlaceholder}
          value={draft.phone}
          error={errorText("phone")}
          onChange={onChange}
        />
        {!isWalkIn && (
          <TextField
            field="email"
            type="email"
            label={r.fields.email}
            hint={r.fields.optional}
            placeholder={r.fields.emailPlaceholder}
            maxLength={MAX_LENGTH.email}
            value={draft.email}
            error={errorText("email")}
            onChange={onChange}
          />
        )}
        <FieldShell
          field="guests"
          label={r.fields.guests}
          hint={fillTemplate(r.fields.guestsHint, { max: MAX_GUESTS })}
          error={errorText("guests")}
        >
          <div className="reserve-stepper">
            <button
              type="button"
              aria-label="-1"
              disabled={draft.guests <= MIN_GUESTS}
              onClick={() => onChange("guests", Math.max(MIN_GUESTS, draft.guests - 1))}
            >
              &minus;
            </button>
            <span className="reserve-stepper-value" aria-live="polite">
              <span>{pad(draft.guests)}</span>
              <em>{draft.guests === 1 ? r.guestOne : r.guestOther}</em>
            </span>
            <button
              type="button"
              aria-label="+1"
              disabled={draft.guests >= MAX_GUESTS}
              onClick={() => onChange("guests", Math.min(MAX_GUESTS, draft.guests + 1))}
            >
              +
            </button>
          </div>
        </FieldShell>
      </div>

      {isWalkIn ? (
        <p className={`mono desk-walkin ${walkInTable ? "" : "is-full"}`}>
          {walkInTable
            ? fillTemplate(t.walkInTable, { table: tableName(walkInTable) })
            : fillTemplate(t.walkInNone, {
                guests: formatGuests(draft.guests, r),
              })}
        </p>
      ) : (
        <>
          <FieldShell field="date" label={r.fields.date} error={errorText("date")}>
            <div className="reserve-chips reserve-days" role="radiogroup">
              {days.map((option) => {
                const isFull = dayFull(option);
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={draft.date === option.key}
                    title={!option.isOpen ? r.closed : isFull ? r.full : undefined}
                    disabled={!option.isOpen || isFull}
                    key={option.key}
                    className={`reserve-day ${draft.date === option.key ? "active" : ""}`}
                    onClick={() => {
                      onChange("date", option.key);
                      if (
                        !option.timeSlots.includes(draft.time) ||
                        !timeFree(option.key, draft.time)
                      ) {
                        onChange("time", "");
                      }
                    }}
                  >
                    <span className="reserve-day-weekday">
                      {formatDateKey(option.key, locale, { weekday: "short" })}
                    </span>
                    <span className="reserve-day-number">{Number(option.key.slice(8))}</span>
                    <span className="reserve-day-month">
                      {formatDateKey(option.key, locale, { month: "short" })}
                    </span>
                  </button>
                );
              })}
            </div>
          </FieldShell>

          <FieldShell field="time" label={r.fields.time} error={errorText("time")}>
            {day?.isOpen ? (
              <div className="reserve-chips reserve-times" role="radiogroup">
                {day.timeSlots.map((time) => {
                  const isFree = timeFree(day.key, time);
                  return (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={draft.time === time}
                      title={isFree ? undefined : r.full}
                      disabled={!isFree}
                      key={time}
                      className={`reserve-time ${draft.time === time ? "active" : ""}`}
                      onClick={() => onChange("time", time)}
                    >
                      {time}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mono reserve-time-hint">{r.fields.timeHint}</p>
            )}
          </FieldShell>
        </>
      )}

      <TextField
        field="notes"
        label={r.fields.notes}
        placeholder={r.fields.notesPlaceholder}
        maxLength={MAX_LENGTH.notes}
        value={draft.notes}
        error={errorText("notes")}
        onChange={onChange}
        multiline
      />
    </div>
  );
}
