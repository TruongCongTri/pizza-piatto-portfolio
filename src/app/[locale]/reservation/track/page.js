"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Button from "@/components/Button/Button";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import Copy from "@/components/Copy/Copy";
import { TextField } from "@/components/Reserve/Fields";
import {
  useReserve,
  useReserveTrigger,
} from "@/components/Reserve/ReserveProvider";
import ReservationControls from "@/components/Reservations/ReservationControls";
import ReservationTicket from "@/components/Reservations/ReservationTicket";
import {
  filterClassBookings,
  filterReservations,
  mergeBookings,
} from "@/components/Reservations/reservation-list";
import { useToast } from "@/components/Toast/ToastProvider";
import ClassTicket from "@/components/Workshops/ClassTicket";
import { LIST_STEP, useIncremental } from "@/hooks/useIncremental";
import { useUrlState } from "@/hooks/useUrlState";
import { useViewTransition } from "@/hooks/useViewTransition";
import { switchLocaleInPath } from "@/i18n/config";
import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate, formatGuests } from "@/i18n/format";
import { formatDateKey, getRestaurantClock } from "@/lib/booking";
import { formatPhone, normalizePhone } from "@/lib/phone";
import { RESTAURANT } from "@/lib/restaurant";

import "./track.css";

const JSON_HEADERS = { "Content-Type": "application/json" };
const VIEWS = ["upcoming", "past", "all"];
const KINDS = ["all", "tables", "classes"];
const SORTS = ["asc", "desc"];

async function fetchOwnReservations() {
  const response = await fetch("/api/track/reservations", { cache: "no-store" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`Request failed with ${response.status}`);
  return response.json();
}

/* a guest looks up their bookings, tables and classes alike: phone number
   -> one-time code -> tickets */
export default function TrackReservations() {
  const { locale, dict, localize } = useLocale();
  const t = dict.track;
  const { form: reserveForm, confirmation } = useReserve();
  const openReserve = useReserveTrigger();
  const { toast } = useToast();
  const { navigateWithTransition } = useViewTransition();

  /* "checking" (existing sign-in?) | "phone" | "code" | "list" */
  const [step, setStep] = useState("checking");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [delivery, setDelivery] = useState(null);
  const [busy, setBusy] = useState(false);
  /* { field, key } shown in the field's label, or a sentence below the form */
  const [fieldError, setFieldError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [account, setAccount] = useState(null);
  /* kept in the address (?q=&show=&type=&sort=), so a reload or a shared
     link opens the same list */
  const [filters, setFilters] = useUrlState(
    { query: "", view: "upcoming", kind: "all", sort: "asc" },
    {
      names: { query: "q", view: "show", kind: "type" },
      options: { view: VIEWS, kind: KINDS, sort: SORTS },
      remember: "track",
    },
  );
  /* the first title waits for the page transition, later swaps don't */
  const isFirstTitleRef = useRef(true);
  /* the booking being cancelled; kept while the dialog animates out */
  const [cancelTarget, setCancelTarget] = useState(null);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const errorMessage = (key) =>
    fillTemplate(t.errors[key] ?? t.errors.server, { phone: RESTAURANT.phone });

  /* already signed in on this device? */
  useEffect(() => {
    let active = true;
    fetchOwnReservations()
      .then((data) => {
        if (!active) return;
        setAccount(data);
        setStep(data ? "list" : "phone");
      })
      .catch(() => active && setStep("phone"));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (step !== "checking") isFirstTitleRef.current = false;
  }, [step]);

  /* start from the number they just booked with */
  useEffect(() => {
    if (reserveForm.phone) setPhone((current) => current || reserveForm.phone);
  }, [reserveForm.phone]);

  /* a booking made in the popup while this page is open shows up here */
  useEffect(() => {
    if (step !== "list" || !confirmation?.reservation) return;
    fetchOwnReservations()
      .then((data) => data && setAccount(data))
      .catch(() => {});
  }, [confirmation?.reservation?.id]);

  /* resend countdown */
  useEffect(() => {
    if (step !== "code" || resendAt <= Date.now()) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= resendAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [step, resendAt]);

  async function requestCode(e) {
    e?.preventDefault();
    if (busy) return;
    if (!phone.trim()) return setFieldError({ field: "phone", key: "required" });
    if (!normalizePhone(phone)) {
      return setFieldError({ field: "phone", key: "invalidPhone" });
    }

    setFieldError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch("/api/track/otp", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ phone, locale }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setDelivery(data);
        setCode("");
        setStep("code");
        setResendAt(Date.now() + data.retryAfter * 1000);
        setNow(Date.now());
        return;
      }
      if (data.error === "invalidPhone") {
        setFieldError({ field: "phone", key: "invalidPhone" });
        return;
      }
      /* a code from a moment ago is still valid: let them type it in */
      if (data.error === "cooldown") {
        setStep("code");
        setResendAt(Date.now() + (data.retryAfter ?? 60) * 1000);
        setNow(Date.now());
      }
      setNotice(errorMessage(data.error));
    } catch {
      setNotice(errorMessage("server"));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e) {
    e.preventDefault();
    if (busy) return;
    const digits = code.replace(/\D/g, "");
    if (digits.length !== 6) {
      return setFieldError({ field: "code", key: digits ? "invalid" : "required" });
    }

    setFieldError(null);
    setNotice(null);
    setBusy(true);
    try {
      const response = await fetch("/api/track/session", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ phone, code: digits }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        setAccount(data);
        setStep("list");
        setCode("");
        setDelivery(null);
        return;
      }
      if (data.error === "invalid") {
        setFieldError({ field: "code", key: "invalid" });
      } else if (data.error === "expired") {
        setFieldError({ field: "code", key: "expired" });
        setNotice(t.errors.expiredHint);
        setResendAt(0);
      } else {
        setNotice(errorMessage(data.error));
      }
    } catch {
      setNotice(errorMessage("server"));
    } finally {
      setBusy(false);
    }
  }

  function changeNumber() {
    setStep("phone");
    setCode("");
    setDelivery(null);
    setFieldError(null);
    setNotice(null);
  }

  function askCancel(reservation) {
    setCancelTarget(reservation);
    setIsCancelOpen(true);
  }

  async function confirmCancel() {
    if (!cancelTarget || isCancelling) return;
    const tc = t.cancel;
    setIsCancelling(true);
    try {
      const response = await fetch(
        `/api/track/reservations/${encodeURIComponent(cancelTarget.id)}/cancel`,
        { method: "POST" },
      );
      if (response.status === 401) {
        setIsCancelOpen(false);
        setAccount(null);
        changeNumber();
        return;
      }
      const data = await response.json().catch(() => ({}));
      setIsCancelOpen(false);
      if (!response.ok) {
        toast({
          tone: "error",
          eyebrow: tc.failedEyebrow,
          title: tc.failedTitle,
          message: fillTemplate(tc.failedMessage, { phone: RESTAURANT.phone }),
          duration: 9000,
        });
        return;
      }
      setAccount((prev) => ({
        ...prev,
        reservations: prev.reservations.map((reservation) =>
          reservation.id === data.reservation.id ? data.reservation : reservation,
        ),
      }));
      toast({
        eyebrow: tc.doneEyebrow,
        title: fillTemplate(tc.doneTitle, {
          date: formatDateKey(data.reservation.date, locale, {
            weekday: "short",
            day: "numeric",
            month: "short",
          }),
          time: data.reservation.time,
        }),
        message: tc.doneMessage,
      });
    } catch {
      setIsCancelOpen(false);
      toast({
        tone: "error",
        eyebrow: t.cancel.failedEyebrow,
        title: t.errors.server,
      });
    } finally {
      setIsCancelling(false);
    }
  }

  async function signOut() {
    await fetch("/api/track/session", { method: "DELETE" }).catch(() => {});
    setAccount(null);
    changeNumber();
  }

  const clock = getRestaurantClock();
  const reservations = account?.reservations ?? [];
  const classBookings = account?.classBookings ?? [];
  const hasClasses = classBookings.length > 0;
  const visible = useMemo(() => {
    const options = { ...filters, locale, clock };
    return mergeBookings(
      {
        reservations: filters.kind === "classes" ? [] : filterReservations(reservations, options),
        classBookings: filters.kind === "tables" ? [] : filterClassBookings(classBookings, options),
      },
      filters,
    );
  }, [reservations, classBookings, filters, locale, clock.dateKey, clock.minutes]);
  const totalBookings = reservations.length + classBookings.length;
  /* the tickets a few at a time, from the first again on a new filter */
  const { count: shown, hasMore, sentinelRef } = useIncremental(visible.length, {
    resetKey: `${filters.query}|${filters.view}|${filters.kind}|${filters.sort}`,
  });

  const resendIn = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const sentMessage = delivery
    ? [
        delivery.channel === "sms" &&
          fillTemplate(t.sentSms, { destination: delivery.destination }),
        delivery.channel === "email" &&
          fillTemplate(t.sentEmail, { destination: delivery.destination }),
        delivery.demoCode && fillTemplate(t.sentDemo, { code: delivery.demoCode }),
      ]
        .filter(Boolean)
        .join(" ")
    : null;
  const errorFor = (field) =>
    fieldError?.field === field ? t.errors[fieldError.key] : undefined;

  return (
    <section className="track">
      <div className="container">
        <header className="track-head">
          <p className="mono">{t.eyebrow}</p>
          {/* keyed so the split-text reveal runs again for the new title */}
          <Copy
            key={step === "list" ? "list" : "find"}
            type="words"
            animateOnScroll={false}
            delay={isFirstTitleRef.current ? 0.85 : 0}
          >
            <h2>{step === "list" ? t.listTitle : t.title}</h2>
          </Copy>
          {step !== "list" && <p className="lg track-intro">{t.intro}</p>}
        </header>

        {step === "checking" && <p className="mono track-loading">{t.loading}</p>}

        {(step === "phone" || step === "code") && (
          <form
            className="track-form"
            onSubmit={step === "phone" ? requestCode : verifyCode}
            noValidate
          >
            {step === "phone" ? (
              <TextField
                field="phone"
                type="tel"
                label={t.phone}
                placeholder={t.phonePlaceholder}
                autoComplete="tel"
                value={phone}
                error={errorFor("phone")}
                onChange={(_, value) => {
                  setFieldError(null);
                  setPhone(value);
                }}
              />
            ) : (
              <>
                {sentMessage && <p className="track-sent">{sentMessage}</p>}
                <TextField
                  field="code"
                  label={t.code}
                  placeholder={t.codePlaceholder}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                  value={code}
                  error={errorFor("code")}
                  onChange={(_, value) => {
                    setFieldError(null);
                    setCode(value.replace(/\D/g, ""));
                  }}
                />
              </>
            )}

            {notice && (
              <p className="track-notice" role="alert">
                {notice}
              </p>
            )}

            <div className="track-actions">
              <Button type="submit" disabled={busy}>
                {step === "phone"
                  ? busy
                    ? t.sending
                    : t.send
                  : busy
                    ? t.verifying
                    : t.verify}
              </Button>
              {step === "code" && (
                <div className="track-links">
                  <button
                    type="button"
                    className="hover-line"
                    disabled={busy || resendIn > 0}
                    onClick={requestCode}
                  >
                    {resendIn > 0
                      ? fillTemplate(t.resendIn, { seconds: resendIn })
                      : t.resend}
                  </button>
                  <button type="button" className="hover-line" onClick={changeNumber}>
                    {t.changeNumber}
                  </button>
                </div>
              )}
            </div>
          </form>
        )}

        {step === "list" && account && (
          <div className="track-list">
            <div className="track-account">
              <p className="mono">
                {fillTemplate(t.signedInAs, { phone: formatPhone(account.phone) })}
              </p>
              <button type="button" className="hover-line" onClick={signOut}>
                {t.signOut}
              </button>
            </div>

            <ReservationControls
              filters={filters}
              onChange={setFilters}
              views={VIEWS}
              kinds={hasClasses ? KINDS : undefined}
              count={visible.length}
            />

            <div className="rs-results">
              {visible.length > 0 ? (
                <div className="track-tickets">
                  {visible.slice(0, shown).map(({ kind, item }, index) =>
                    kind === "table" ? (
                      <ReservationTicket
                        className={index >= LIST_STEP ? "list-item-in" : ""}
                        key={item.id}
                        reservation={item}
                        clock={clock}
                        onCancel={askCancel}
                      />
                    ) : (
                      <div
                        className={`track-class ${index >= LIST_STEP ? "list-item-in" : ""}`}
                        key={item.id}
                      >
                        <ClassTicket ticket={item} />
                        <div className="track-class-foot">
                          <p className="mono">{dict.classTicket.statuses[item.status]}</p>
                          <a
                            className="hover-line"
                            href={switchLocaleInPath(item.ticketPath, locale)}
                            onClick={(e) => {
                              e.preventDefault();
                              navigateWithTransition(switchLocaleInPath(item.ticketPath, locale));
                            }}
                          >
                            {t.openTicket}
                          </a>
                        </div>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="md track-empty">
                  {totalBookings
                    ? hasClasses
                      ? dict.reservations.noBookings
                      : dict.reservations.empty
                    : t.empty}
                </p>
              )}

              {hasMore && <span className="list-sentinel" ref={sentinelRef} aria-hidden="true" />}

              <div className="track-book">
                <Button type="button" onClick={openReserve}>
                  {t.book}
                </Button>
                <a
                  className="hover-line track-classes-link"
                  href={localize("/workshops")}
                  onClick={(e) => {
                    e.preventDefault();
                    navigateWithTransition("/workshops");
                  }}
                >
                  {t.classes}
                </a>
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={isCancelOpen}
          eyebrow={t.cancel.eyebrow}
          title={t.cancel.title}
          message={
            cancelTarget &&
            `${formatDateKey(cancelTarget.date, locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}, ${cancelTarget.time} · ${formatGuests(cancelTarget.guests, dict.reserve)}`
          }
          confirmLabel={t.cancel.confirm}
          cancelLabel={t.cancel.keep}
          busy={isCancelling}
          onConfirm={confirmCancel}
          onCancel={() => setIsCancelOpen(false)}
        />
      </div>
    </section>
  );
}
