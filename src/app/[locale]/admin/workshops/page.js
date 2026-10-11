"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import DeskHeader from "@/components/DeskHeader/DeskHeader";
import DeskLogin from "@/components/DeskLogin/DeskLogin";
import { foldText } from "@/components/Reservations/reservation-list";
import ReservationControls from "@/components/Reservations/ReservationControls";
import { useToast } from "@/components/Toast/ToastProvider";
import TransitionLink from "@/components/TransitionLink/TransitionLink";
import { scheduleLine } from "@/components/Workshops/class-view";
import { useDeskEvents } from "@/hooks/useDeskEvents";
import { useDragScroll } from "@/hooks/useDragScroll";
import { useIncremental } from "@/hooks/useIncremental";
import { useStuck } from "@/hooks/useStuck";
import { useUrlState } from "@/hooks/useUrlState";
import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate } from "@/i18n/format";
import { formatDateKey, formatShopTime, getRestaurantClock } from "@/lib/booking";
import { formatMoney, isPaymentOpen, isPaymentPaid } from "@/lib/payments";
import { formatPhone } from "@/lib/phone";
import { toMinutes, toTime } from "@/lib/restaurant";
import {
  CHECK_IN_EARLY_MINUTES,
  checkInSession,
  formatSeats,
  formatShopDateTime,
  localized,
  sessionEnd,
  workshopPhase,
} from "@/lib/workshops";

import ClassForm from "./ClassForm";
import RecapEditor from "./RecapEditor";

import "../admin.css";
import "./classdesk.css";

const JSON_HEADERS = { "Content-Type": "application/json" };
const SECTIONS = ["bookings", "details", "recap"];
/* one shared empty list, so a booking without payments keeps the same props */
const NO_PAYMENTS = [];
/* the class list's filters */
const CLASS_VIEWS = ["all", "upcoming", "past"];
const CLASS_STATUSES = ["all", "published", "draft", "cancelled"];
const SORTS = ["asc", "desc"];
/* bookings whose seats are sold */
const SOLD = new Set(["confirmed", "attended"]);
/* rows: who is coming first, then who is paying, then the rest */
const ROW_ORDER = {
  confirmed: 0,
  attended: 0,
  pending_payment: 1,
  refund_pending: 2,
  expired: 3,
  cancelled: 3,
  refunded: 3,
};

const groupBy = (items, key) => {
  const groups = new Map();
  items.forEach((item) => {
    if (!groups.has(item[key])) groups.set(item[key], []);
    groups.get(item[key]).push(item);
  });
  return groups;
};

const firstSlot = (workshop) =>
  workshop.sessions?.length ? `${workshop.sessions[0].date} ${workshop.sessions[0].start}` : "";

/* classes without a date first (they need one), then what is coming up,
   soonest first, then past classes, latest first */
function sortClasses(workshops, now) {
  const rank = (workshop) =>
    !workshop.sessions?.length ? 0 : workshopPhase(workshop, now) === "past" ? 2 : 1;
  return [...workshops].sort((a, b) => {
    const byRank = rank(a) - rank(b);
    if (byRank) return byRank;
    return rank(a) === 2
      ? firstSlot(b).localeCompare(firstSlot(a))
      : firstSlot(a).localeCompare(firstSlot(b));
  });
}

/* the staff view of pizza classes: their bookings and payments, checking
   students in, refunds to send, editing classes and their recaps */
export default function ClassDesk() {
  const { locale, dict, localize } = useLocale();
  const t = dict.classDesk;
  const { toast } = useToast();

  /* "loading" | "login" | "ready" */
  const [status, setStatus] = useState("loading");
  const [data, setData] = useState({ workshops: [], enrollments: [], payments: [] });
  const [provider, setProvider] = useState(null);
  const [demoTools, setDemoTools] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [offline, setOffline] = useState(false);
  /* the "new class" popup */
  const [creating, setCreating] = useState(false);
  /* the open class and its tab, and the class list's search and filters,
     all kept in the address (?class=&section=&q=&show=&status=&sort=):
     a reload, a link from the guest lookup or the back button opens the
     same view */
  const [view, setView] = useUrlState(
    { selected: "", section: "bookings", query: "", show: "all", status: "all", sort: "asc" },
    {
      names: { selected: "class", query: "q" },
      options: { section: SECTIONS, show: CLASS_VIEWS, status: CLASS_STATUSES, sort: SORTS },
      remember: "admin-classes",
    },
  );
  /* on a phone the classes are a row to swipe (or drag) through */
  const classListRef = useDragScroll();
  const selectedId = view.selected || null;
  const section = view.section;
  const setSelectedId = useCallback(
    (id) => setView((prev) => ({ ...prev, selected: id ?? "" })),
    [setView],
  );
  const setSection = useCallback(
    (key) => setView((prev) => ({ ...prev, section: key })),
    [setView],
  );
  /* { type, enrollmentId, paymentId }, kept while the dialog animates out */
  const [dialog, setDialog] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const versionRef = useRef(null);
  const knownPaidRef = useRef(null);

  const seatsText = useCallback((count) => formatSeats(count, dict.workshops.form), [dict]);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/workshops?version=${versionRef.current ?? ""}`, {
        cache: "no-store",
      });
      if (response.status === 401) {
        versionRef.current = null;
        knownPaidRef.current = null;
        setStatus("login");
        return;
      }
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);

      const next = await response.json();
      setOffline(false);
      setLastSync(new Date());
      setNow(Date.now());
      setProvider(next.provider);
      setDemoTools(Boolean(next.demoTools));
      if (next.unchanged) return;

      /* a booking paid since the last look is news */
      const known = knownPaidRef.current;
      const sold = next.enrollments.filter((enrollment) => SOLD.has(enrollment.status));
      if (known) {
        const classes = new Map(next.workshops.map((workshop) => [workshop.id, workshop]));
        sold
          .filter((enrollment) => !known.has(enrollment.id))
          .forEach((enrollment) =>
            toast({
              eyebrow: t.toasts.paidEyebrow,
              title: enrollment.name,
              message: fillTemplate(t.toasts.newMessage, {
                title: localized(classes.get(enrollment.workshopId)?.title, locale),
                seats: seatsText(enrollment.seats),
              }),
              duration: 12_000,
            }),
          );
      }
      knownPaidRef.current = new Set([...(known ?? []), ...sold.map(({ id }) => id)]);
      versionRef.current = next.version;
      setData({ workshops: next.workshops, enrollments: next.enrollments, payments: next.payments });
      setStatus("ready");
    } catch {
      setOffline(true);
    }
  }, [toast, t, locale, seatsText]);

  const isSignedOut = status === "login";

  /* read the classes once when signed in, then again only when the
     server says something changed (a booking, a payment, another desk) or
     the tab is looked at again: no asking on a timer */
  useEffect(() => {
    if (!isSignedOut) refresh();
  }, [isSignedOut, refresh]);
  useDeskEvents("classes", refresh, !isSignedOut);

  /* check-in windows open and close as time passes */
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const workshops = useMemo(() => sortClasses(data.workshops, now), [data.workshops, now]);
  const enrollmentsByClass = useMemo(() => groupBy(data.enrollments, "workshopId"), [data.enrollments]);
  const paymentsByBooking = useMemo(() => groupBy(data.payments, "enrollmentId"), [data.payments]);
  const paymentsByClass = useMemo(() => groupBy(data.payments, "workshopId"), [data.payments]);
  const enrollmentById = useMemo(
    () => new Map(data.enrollments.map((enrollment) => [enrollment.id, enrollment])),
    [data.enrollments],
  );
  const classById = useMemo(
    () => new Map(data.workshops.map((workshop) => [workshop.id, workshop])),
    [data.workshops],
  );

  /* the first class coming up is open to begin with */
  useEffect(() => {
    if (status !== "ready") return;
    if (selectedId && classById.has(selectedId)) return;
    const next =
      workshops.find((workshop) => workshopPhase(workshop, now) !== "past" && workshop.sessions?.length) ??
      workshops[0];
    setSelectedId(next?.id ?? null);
  }, [status, selectedId, classById, workshops, now, setSelectedId]);

  const selected = selectedId ? classById.get(selectedId) : null;
  const refundsDue = data.payments.filter((payment) => payment.status === "refund_pending");

  /* the class list, searched and filtered */
  const visibleClasses = useMemo(() => {
    const words = foldText(view.query).split(/\s+/).filter(Boolean);
    const list = workshops.filter((workshop) => {
      const phase = workshopPhase(workshop, now);
      if (view.show === "upcoming" && workshop.sessions?.length && phase === "past") return false;
      if (view.show === "past" && phase !== "past") return false;
      if (view.status !== "all" && workshop.status !== view.status) return false;
      if (!words.length) return true;
      const text = foldText(`${workshop.title?.vi ?? ""} ${workshop.title?.en ?? ""} ${workshop.id}`);
      return words.every((word) => text.includes(word));
    });
    return view.sort === "desc" ? list.reverse() : list;
  }, [workshops, view.query, view.show, view.status, view.sort, now]);

  /* the class list a few at a time (more as its end comes near), but
     always down to the class that is open */
  const classList = useIncremental(visibleClasses.length, {
    resetKey: `${view.query}|${view.show}|${view.status}|${view.sort}`,
  });
  const classesShown = Math.max(
    classList.count,
    visibleClasses.findIndex((workshop) => workshop.id === selectedId) + 1,
  );

  const classGroups = useMemo(
    () => [
      {
        key: "show",
        label: dict.reservations.show,
        options: CLASS_VIEWS,
        labels: dict.reservations.filters,
        defaultValue: "all",
      },
      {
        key: "status",
        label: dict.reservations.status,
        options: CLASS_STATUSES,
        labels: { all: dict.reservations.statuses.all, ...t.statuses },
        defaultValue: "all",
      },
    ],
    [dict, t],
  );

  /* the counts: classes coming up, the seats sold for them, bookings
     waiting on a payment and refunds still to send */
  const stats = useMemo(() => {
    const coming = data.workshops.filter(
      (workshop) =>
        workshop.status === "published" &&
        workshop.sessions?.length &&
        workshopPhase(workshop, now) !== "past",
    );
    const comingIds = new Set(coming.map((workshop) => workshop.id));
    const seats = data.enrollments
      .filter((enrollment) => comingIds.has(enrollment.workshopId) && SOLD.has(enrollment.status))
      .reduce((sum, enrollment) => sum + enrollment.seats, 0);
    const awaiting = data.enrollments.filter((enrollment) => enrollment.status === "pending_payment").length;
    const two = (value) => String(value).padStart(2, "0");
    return [
      { key: "upcoming", value: two(coming.length) },
      { key: "seats", value: two(seats) },
      { key: "awaiting", value: two(awaiting) },
      { key: "refunds", value: two(data.payments.filter((payment) => payment.status === "refund_pending").length) },
    ].map((stat) => ({ ...stat, label: t.stats[stat.key] }));
  }, [data, now, t]);

  const failToast = () =>
    toast({
      tone: "error",
      eyebrow: t.toasts.errorEyebrow,
      title: t.toasts.errorTitle,
      message: t.toasts.errorMessage,
    });

  const signedOut = () => {
    versionRef.current = null;
    knownPaidRef.current = null;
    setIsDialogOpen(false);
    setStatus("login");
  };

  async function signOut() {
    await fetch("/api/admin/session", { method: "DELETE" }).catch(() => {});
    setData({ workshops: [], enrollments: [], payments: [] });
    signedOut();
  }

  /* sample classes: loaded or cleared, then the desk reloads without a
     toast for each sample booking */
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
      knownPaidRef.current = null;
      setSelectedId(null);
      await refresh();
      toast({
        eyebrow: t.demo.eyebrow,
        title: action === "seedClasses" ? fillTemplate(t.demo.loaded, { count: result.added }) : t.demo.cleared,
      });
    } catch {
      failToast();
    } finally {
      setDemoBusy(false);
    }
  }

  /* the rows get one action handler that never changes, so a row only
     redraws when its own booking does */
  const openActionRef = useRef(null);
  openActionRef.current = openAction;
  const onRowAction = useCallback(
    (type, enrollment, paymentId) => openActionRef.current(type, enrollment, paymentId),
    [],
  );

  function openAction(type, enrollment, paymentId) {
    if (type === "check") {
      runAction({ type, enrollmentId: enrollment.id });
      return;
    }
    setDialog({ type, enrollmentId: enrollment.id, paymentId });
    setIsDialogOpen(true);
  }

  async function runAction(target = dialog) {
    if (!target || saving) return;
    const { type, enrollmentId, paymentId } = target;
    const enrollment = enrollmentById.get(enrollmentId);
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/enrollments/${encodeURIComponent(enrollmentId)}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        /* "refund" is a cancel of a paid booking: the server refunds it */
        body: JSON.stringify({ action: type === "refund" ? "cancel" : type, paymentId }),
      });
      if (response.status === 401) return signedOut();
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const result = await response.json();
      setIsDialogOpen(false);
      const eyebrow = {
        checkIn: t.toasts.checkedInEyebrow,
        undo: t.toasts.undoneEyebrow,
        cancel: t.toasts.cancelledEyebrow,
        refund: t.toasts.refundEyebrow,
        markRefunded: t.toasts.refundedEyebrow,
        check: t.toasts.checkedEyebrow,
      }[type];
      toast({
        eyebrow,
        title: enrollment?.name,
        message: result.enrollment?.status ? t.enrollment[result.enrollment.status] : undefined,
      });
      await refresh();
    } catch {
      failToast();
    } finally {
      setSaving(false);
    }
  }

  if (isSignedOut) {
    return (
      <DeskLogin title={t.login.title} intro={t.login.intro} onSignedIn={() => setStatus("loading")} />
    );
  }

  /* ---------- the open dialog ---------- */

  let dialogProps = {};
  if (dialog) {
    const enrollment = enrollmentById.get(dialog.enrollmentId);
    const payment = dialog.paymentId ? data.payments.find(({ id }) => id === dialog.paymentId) : null;
    const amount = formatMoney(payment?.amount ?? enrollment?.amount ?? 0, locale);
    const copy = t.dialogs[dialog.type];
    const details = enrollment
      ? fillTemplate(t.dialogs.details, {
          name: enrollment.name,
          seats: seatsText(enrollment.seats),
          amount: formatMoney(enrollment.amount, locale),
        })
      : "";
    dialogProps = {
      eyebrow: copy.eyebrow,
      title: fillTemplate(copy.title, { amount }),
      message: copy.note ? `${details}. ${copy.note}` : details,
      confirmLabel: copy.confirm,
      cancelLabel: t.dialogs.back,
      onConfirm: () => runAction(),
    };
  }

  const selectedEnrollments = selected ? enrollmentsByClass.get(selected.id) ?? [] : [];
  const classCount =
    visibleClasses.length === 1
      ? t.classOne
      : fillTemplate(t.classOther, { count: visibleClasses.length });

  return (
    <section className="desk class-desk">
      <div className="container">
        <DeskHeader
          current="classes"
          eyebrow={t.eyebrow}
          title={t.title}
          liveText={
            offline
              ? dict.admin.offline
              : lastSync
                ? `${dict.admin.live} · ${fillTemplate(dict.admin.updated, {
                    time: formatShopTime(lastSync.toISOString(), locale),
                  })}`
                : dict.admin.loading
          }
          offline={offline}
          onSignOut={signOut}
          action={{ label: t.newClass, onClick: () => setCreating(true) }}
          stats={stats}
          panel={{
            filters: view,
            onChange: setView,
            groups: classGroups,
            search: { label: t.search, placeholder: t.searchPlaceholder },
            summary: classCount,
          }}
          filters={
            <ReservationControls
              filters={view}
              onChange={setView}
              groups={classGroups}
              search={{ label: t.search, placeholder: t.searchPlaceholder }}
              countLabels={{ one: t.classOne, other: t.classOther }}
              count={visibleClasses.length}
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
                onClick={() => runDemo("seedClasses")}
              >
                {t.demo.load}
              </button>
              <button
                type="button"
                className="desk-link hover-line"
                disabled={demoBusy}
                onClick={() => runDemo("clearClasses")}
              >
                {t.demo.clear}
              </button>
            </div>
          )}
        </DeskHeader>

        <p className={`mono cd-provider is-${provider ?? "off"}`}>
          <span>{t.provider.label}</span>
          {t.provider[provider ?? "off"]}
        </p>

        {refundsDue.length > 0 && (
          <section className="cd-refunds" aria-label={t.refunds.title}>
            <header>
              <h6>{t.refunds.title}</h6>
              <p className="sm">{t.refunds.intro}</p>
            </header>
            <ul>
              {refundsDue.map((payment) => {
                const enrollment = enrollmentById.get(payment.enrollmentId);
                const workshop = classById.get(payment.workshopId);
                return (
                  <li key={payment.id}>
                    <div>
                      <p className="cd-refund-who">{enrollment?.name}</p>
                      <p className="mono">
                        {enrollment && formatPhone(enrollment.phone)} · {localized(workshop?.title, locale)}
                      </p>
                    </div>
                    <p className="mono">{t.reasons[payment.refundReason] ?? ""}</p>
                    <p className="cd-refund-amount">{formatMoney(payment.amount, locale)}</p>
                    <button
                      type="button"
                      className="rs-chip desk-checkin"
                      onClick={() => enrollment && openAction("markRefunded", enrollment, payment.id)}
                    >
                      {t.actions.markRefunded}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {status === "loading" ? (
          <p className="mono desk-empty">{dict.admin.loading}</p>
        ) : (
          <div className="cd-layout">
            <nav className="cd-classes" aria-label={t.title} ref={classListRef} data-lenis-prevent-touch>
              {workshops.length === 0 && <p className="sm">{t.empty}</p>}
              {workshops.length > 0 && visibleClasses.length === 0 && (
                <p className="sm">{t.noMatch}</p>
              )}
              {visibleClasses.slice(0, classesShown).map((workshop) => {
                const enrollments = enrollmentsByClass.get(workshop.id) ?? [];
                const sold = enrollments
                  .filter((enrollment) => SOLD.has(enrollment.status))
                  .reduce((sum, enrollment) => sum + enrollment.seats, 0);
                const phase = workshopPhase(workshop, now);
                return (
                  <button
                    type="button"
                    key={workshop.id}
                    className={`cd-class ${workshop.id === selectedId ? "is-active" : ""} is-${phase}`}
                    aria-current={workshop.id === selectedId ? "true" : undefined}
                    onClick={() => {
                      setSelectedId(workshop.id);
                      setSection("bookings");
                    }}
                  >
                    <span className="mono cd-class-when">
                      {workshop.sessions?.length ? scheduleLine(workshop, locale, dict.workshops) : t.noDate}
                    </span>
                    <span className="cd-class-title">{localized(workshop.title, locale)}</span>
                    <span className="cd-class-meta">
                      <span className={`cd-chip is-${workshop.status}`}>{t.statuses[workshop.status]}</span>
                      {workshop.sessions?.length > 0 && <span className="mono">{t.phases[phase]}</span>}
                      <span className="mono">
                        {fillTemplate(t.seatsSold, { taken: sold, capacity: workshop.capacity ?? 0 })}
                      </span>
                    </span>
                  </button>
                );
              })}
              {classesShown < visibleClasses.length && (
                <span className="list-sentinel" ref={classList.sentinelRef} aria-hidden="true" />
              )}
            </nav>

            <div className="cd-detail">
              {selected ? (
                <ClassDetail
                  workshop={selected}
                  enrollments={selectedEnrollments}
                  payments={paymentsByClass.get(selected.id) ?? []}
                  paymentsByBooking={paymentsByBooking}
                  section={section}
                  onSection={setSection}
                  now={now}
                  onAction={onRowAction}
                  onChanged={refresh}
                  onDeleted={async () => {
                    setSelectedId(null);
                    await refresh();
                  }}
                  onSignedOut={signedOut}
                />
              ) : (
                <p className="sm desk-empty">{t.empty}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={isDialogOpen}
        busy={saving}
        onCancel={() => setIsDialogOpen(false)}
        {...dialogProps}
      />

      {/* a new class opens in a popup, like a new booking on the tables
          desk; once saved it is the class open on the desk */}
      <ConfirmDialog
        open={creating}
        eyebrow={t.eyebrow}
        title={t.form.createTitle}
        wide="xl"
        actions={false}
        focusConfirm={false}
        onCancel={() => setCreating(false)}
      >
        <ClassForm
          workshop={null}
          hasBookings={false}
          bare
          onSaved={async (created) => {
            setCreating(false);
            await refresh();
            setSelectedId(created.id);
            setSection("bookings");
          }}
          onClose={() => setCreating(false)}
          onSignedOut={signedOut}
        />
      </ConfirmDialog>
    </section>
  );
}

function ClassDetail({
  workshop,
  enrollments,
  payments,
  paymentsByBooking,
  section,
  onSection,
  now,
  onAction,
  onChanged,
  onDeleted,
  onSignedOut,
}) {
  const { locale, dict, localize } = useLocale();
  const t = dict.classDesk;
  /* the bookings a few at a time, from the first again for another class */
  const {
    count: rowsShown,
    hasMore: rowsMore,
    sentinelRef: rowsSentinel,
  } = useIncremental(enrollments.length, { resetKey: `${workshop.id}|${section}` });
  const [headRef, headStuck] = useStuck();
  const phase = workshopPhase(workshop, now);
  const sold = enrollments
    .filter((enrollment) => SOLD.has(enrollment.status))
    .reduce((sum, enrollment) => sum + enrollment.seats, 0);
  const revenue = payments
    .filter((payment) => payment.status === "succeeded")
    .reduce((sum, payment) => sum + payment.amount, 0);
  const rows = [...enrollments].sort(
    (a, b) =>
      (ROW_ORDER[a.status] ?? 9) - (ROW_ORDER[b.status] ?? 9) ||
      b.createdAt.localeCompare(a.createdAt),
  );

  return (
    <div className="cd-detail-inner">
      {/* the class's heading and tabs stay put under the pinned header;
          only what is below them scrolls */}
      <div className={`cd-detail-top ${headStuck ? "is-stuck" : ""}`} ref={headRef}>
        <header className="cd-detail-head">
          <div className="cd-detail-title">
            <p className="mono">
              {workshop.sessions?.length ? scheduleLine(workshop, locale, dict.workshops) : t.noDate}
            </p>
            <h5>{localized(workshop.title, locale)}</h5>
            <p className="mono cd-detail-meta">
              <span className={`cd-chip is-${workshop.status}`}>{t.statuses[workshop.status]}</span>
              {workshop.sessions?.length > 0 && <span>{t.phases[phase]}</span>}
              <span>{fillTemplate(t.seatsSold, { taken: sold, capacity: workshop.capacity ?? 0 })}</span>
              <span>{fillTemplate(t.revenue, { amount: formatMoney(revenue, locale) })}</span>
            </p>
          </div>
          {workshop.status !== "draft" && (
            <a
              className="hover-line desk-link"
              href={localize(`/workshops/${workshop.slug}`)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.view} ↗
            </a>
          )}
        </header>

        <div className="rs-chips cd-sections" role="tablist">
          {SECTIONS.map((key) => (
            <button
              type="button"
              role="tab"
              aria-selected={section === key}
              key={key}
              className={`rs-chip ${section === key ? "active" : ""}`}
              onClick={() => onSection(key)}
            >
              {t.sections[key]}
              {key === "bookings" && rows.length > 0 ? ` · ${rows.length}` : ""}
            </button>
          ))}
        </div>
      </div>

      {section === "bookings" &&
        (rows.length === 0 ? (
          <p className="sm desk-empty">{t.bookingsEmpty}</p>
        ) : (
          <ul className="cd-rows">
            {rows.slice(0, rowsShown).map((enrollment) => (
              <BookingRow
                key={enrollment.id}
                enrollment={enrollment}
                workshop={workshop}
                payments={paymentsByBooking.get(enrollment.id) ?? NO_PAYMENTS}
                now={now}
                onAction={onAction}
              />
            ))}
            {rowsMore && <li className="list-sentinel" ref={rowsSentinel} aria-hidden="true" />}
          </ul>
        ))}

      {section === "details" && (
        <ClassForm
          key={workshop.id}
          workshop={workshop}
          hasBookings={enrollments.length > 0}
          onSaved={onChanged}
          onDeleted={onDeleted}
          onSignedOut={onSignedOut}
        />
      )}

      {section === "recap" && (
        <RecapEditor key={workshop.id} workshop={workshop} onChanged={onChanged} onSignedOut={onSignedOut} />
      )}
    </div>
  );
}

/* when check-in opens for a paid booking that can't be checked in yet */
function checkInHint(workshop, now, t, locale) {
  const next = workshop.sessions?.find((session) => sessionEnd(session) >= now);
  if (!next) return t.hints.closed;
  if (next.start && next.date === getRestaurantClock(new Date(now)).dateKey) {
    return fillTemplate(t.hints.opensAt, {
      time: toTime(Math.max(0, toMinutes(next.start) - CHECK_IN_EARLY_MINUTES)),
    });
  }
  return fillTemplate(t.hints.opensOn, {
    date: formatDateKey(next.date, locale, { weekday: "short", day: "numeric", month: "short" }),
  });
}

/* a booking row redraws only when its own booking, payments or the
   check-in clock change */
const BookingRow = memo(function BookingRow({ enrollment, workshop, payments, now, onAction }) {
  const { locale, dict, localize } = useLocale();
  const t = dict.classDesk;
  const { status } = enrollment;
  const ordered = [...payments].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const last = enrollment.log?.[enrollment.log.length - 1];
  /* why a booking ended: the system's note, or who cancelled it */
  const lastNote =
    last?.note ??
    (status === "cancelled" ? { student: "studentCancelled", staff: "staffCancelled" }[last?.by] : null);
  const paidLate = enrollment.log?.some((entry) => entry.note === "paidLate");

  let detail = null;
  if (status === "pending_payment") {
    detail = fillTemplate(t.heldUntil, { time: formatShopTime(enrollment.holdExpiresAt, locale) });
  } else if (status === "confirmed" && enrollment.paidAt) {
    detail = `${fillTemplate(t.paidAt, { time: formatShopDateTime(enrollment.paidAt, locale) })}${paidLate ? ` · ${t.paidLate}` : ""}`;
  } else if (status === "attended" && enrollment.checkedInAt) {
    detail = fillTemplate(t.checkedIn, { time: formatShopTime(enrollment.checkedInAt, locale) });
  } else if (status === "refund_pending" || status === "refunded") {
    detail = t.reasons[enrollment.refundReason] ?? null;
  } else if (lastNote) {
    detail = t.reasons[lastNote] ?? null;
  }

  const actions = [];
  let hint = null;
  if (status === "confirmed") {
    if (checkInSession(workshop, now)) actions.push({ type: "checkIn", primary: true });
    else hint = checkInHint(workshop, now, t, locale);
    actions.push({ type: "refund" });
  }
  if (status === "attended") actions.push({ type: "undo" });
  if (status === "pending_payment") actions.push({ type: "check" }, { type: "cancel" });
  if ((status === "expired" || status === "cancelled") && payments.some((p) => isPaymentOpen(p.status))) {
    actions.push({ type: "check" });
  }
  payments
    .filter((payment) => payment.status === "refund_pending")
    .forEach((payment) => actions.push({ type: "markRefunded", paymentId: payment.id }));

  return (
    <li className={`cd-row is-${status}`}>
      <div className="cd-row-who">
        <p className="cd-row-name">{enrollment.name}</p>
        <p className="mono">{enrollment.id}</p>
      </div>
      <div className="cd-row-contact">
        <a className="hover-line" href={`tel:${enrollment.phone}`}>
          {formatPhone(enrollment.phone)}
        </a>
        {enrollment.email && (
          <a className="hover-line" href={`mailto:${enrollment.email}`} title={enrollment.email}>
            {enrollment.email}
          </a>
        )}
        <TransitionLink
          className="hover-line desk-history"
          href={localize(`/admin/guests?q=${encodeURIComponent(enrollment.phone)}`)}
        >
          {dict.guestDesk.history}
        </TransitionLink>
      </div>
      <p className="mono cd-row-seats">
        {formatSeats(enrollment.seats, dict.workshops.form)} · {formatMoney(enrollment.amount, locale)}
      </p>
      <div className="cd-row-state">
        <p className={`mono desk-state cd-state is-${status}`}>
          <span className="desk-state-dot" aria-hidden="true" />
          {t.enrollment[status]}
        </p>
        {detail && <p className="mono cd-row-detail">{detail}</p>}
        {ordered.length > 0 && (
          <p className="cd-pays">
            {ordered.map((payment) => (
              <span key={payment.id} className={`cd-pay is-${payment.status}`} title={payment.id}>
                {payment.id !== enrollment.paymentId && isPaymentPaid(payment.status)
                  ? `${fillTemplate(t.extra, { amount: formatMoney(payment.amount, locale) })} · `
                  : ""}
                {t.payment[payment.status]}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className="desk-actions cd-row-actions">
        {hint && <span className="desk-hint">{hint}</span>}
        {actions.map((action) =>
          action.primary ? (
            <button
              type="button"
              key={action.type}
              className="rs-chip desk-checkin"
              onClick={() => onAction(action.type, enrollment, action.paymentId)}
            >
              {t.actions[action.type]}
            </button>
          ) : (
            <button
              type="button"
              key={`${action.type}-${action.paymentId ?? ""}`}
              className="desk-link hover-line"
              onClick={() => onAction(action.type, enrollment, action.paymentId)}
            >
              {t.actions[action.type]}
            </button>
          ),
        )}
      </div>
    </li>
  );
});
