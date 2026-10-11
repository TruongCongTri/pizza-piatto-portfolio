"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import Button from "@/components/Button/Button";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import { useToast } from "@/components/Toast/ToastProvider";
import { useViewTransition } from "@/hooks/useViewTransition";
import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate } from "@/i18n/format";
import { formatShopTime } from "@/lib/booking";
import { formatMoney } from "@/lib/payments";
import { RESTAURANT } from "@/lib/restaurant";
import { formatShopDateTime, localized } from "@/lib/workshops";

import ClassTicket from "./ClassTicket";

import "./Workshops.css";

const JSON_HEADERS = { "Content-Type": "application/json" };
/* while the payment can still change, the ticket is looked at this often */
const POLL_MS = 4000;
const LIVE = new Set(["awaitingPayment", "processing", "paymentFailed"]);
const COUNTING = new Set(["awaitingPayment", "paymentFailed"]);
const pad = (value) => String(value).padStart(2, "0");

/* a student's class ticket, opened from its secret link: where the booking
   and its payment stand, with paying and cancelling from here */
export default function TicketView({ id, token, checkout }) {
  const { locale, dict, localize } = useLocale();
  const t = dict.classTicket;
  const { toast } = useToast();
  const { navigateWithTransition } = useViewTransition();
  /* "loading" | "ready" | "notFound" | "error" */
  const [state, setState] = useState("loading");
  const [ticket, setTicket] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const shownStatusRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/workshops/tickets/${encodeURIComponent(id)}?t=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      if (response.status === 404) {
        setState("notFound");
        return;
      }
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      const data = await response.json();
      setTicket(data.ticket);
      setNow(Date.now());
      setState("ready");
    } catch {
      setState((prev) => (prev === "ready" ? prev : "error"));
    }
  }, [id, token]);

  useEffect(() => {
    load();
  }, [load]);

  const status = ticket?.status;
  const isLive = LIVE.has(status);

  /* the moment the payment lands, say so */
  useEffect(() => {
    if (!ticket) return;
    const previous = shownStatusRef.current;
    shownStatusRef.current = ticket.status;
    if (previous && LIVE.has(previous) && ticket.status === "paid") {
      toast({
        eyebrow: t.toasts.paidEyebrow,
        title: t.toasts.paidTitle,
        message: localized(ticket.workshop.title, locale),
      });
    }
  }, [ticket, toast, t, locale]);

  /* polling while the payment can still change, and on coming back */
  useEffect(() => {
    if (!isLive) return;
    let timer;
    const schedule = () => {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible") await load();
        schedule();
      }, POLL_MS);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    schedule();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isLive, load]);

  /* back here with the browser's back button from a payment page */
  useEffect(() => {
    const handleShow = (event) => {
      if (!event.persisted) return;
      setBusy(false);
      load();
    };
    window.addEventListener("pageshow", handleShow);
    return () => window.removeEventListener("pageshow", handleShow);
  }, [load]);

  /* the hold's countdown; at zero the server is asked (it releases it) */
  const isCounting = COUNTING.has(status);
  useEffect(() => {
    if (!isCounting) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isCounting]);
  const leftMs = ticket ? Date.parse(ticket.holdExpiresAt) - now : 0;
  const holdOver = isCounting && leftMs <= 0;
  useEffect(() => {
    if (holdOver) load();
  }, [holdOver, load]);

  const failToast = () =>
    toast({
      tone: "error",
      eyebrow: t.toasts.errorEyebrow,
      title: t.toasts.errorTitle,
      message: t.toasts.errorMessage,
    });

  async function pay() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/workshops/tickets/${encodeURIComponent(id)}/pay`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.checkoutUrl) {
        window.location.assign(data.checkoutUrl);
        return;
      }
      setBusy(false);
      if (data.error === "notPayable") {
        toast({ tone: "error", eyebrow: t.toasts.errorEyebrow, title: t.toasts.notPayable });
      } else if (data.error !== "processing") {
        failToast();
      }
      load();
    } catch {
      setBusy(false);
      failToast();
    }
  }

  async function cancel() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/workshops/tickets/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      setConfirming(false);
      if (response.ok) {
        setTicket(data.ticket);
        toast({
          eyebrow: t.toasts.cancelledEyebrow,
          title:
            data.ticket.status === "cancelled" ? t.toasts.cancelledTitle : t.toasts.refundTitle,
        });
      } else if (data.error === "tooLate") {
        toast({
          tone: "error",
          eyebrow: t.toasts.errorEyebrow,
          title: fillTemplate(t.toasts.tooLate, { phone: RESTAURANT.phone }),
        });
        load();
      } else {
        failToast();
      }
    } catch {
      failToast();
    } finally {
      setBusy(false);
    }
  }

  const go = (href) => (e) => {
    e.preventDefault();
    navigateWithTransition(href);
  };

  if (state === "loading" || state === "error" || state === "notFound") {
    return (
      <section className="class-ticket-page">
        <div className="container">
          {state === "loading" ? (
            <p className="mono">{dict.track.loading}</p>
          ) : (
            <div className="class-ticket-missing">
              <p className="mono">{t.eyebrow}</p>
              <h3>{state === "notFound" ? t.notFoundTitle : t.toasts.errorTitle}</h3>
              <p className="md">
                {state === "notFound"
                  ? fillTemplate(t.notFoundMessage, { phone: RESTAURANT.phone })
                  : t.toasts.errorMessage}
              </p>
              <div className="class-ticket-actions">
                {state === "error" && (
                  <Button type="button" onClick={load}>
                    {dict.errors.error.retry}
                  </Button>
                )}
                <a href={localize("/workshops")} className="hover-line class-link" onClick={go("/workshops")}>
                  {t.back}
                </a>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  const amount = formatMoney(ticket.amount, locale, ticket.currency);
  const holdTime = formatShopTime(ticket.holdExpiresAt, locale);
  const reason = ticket.refundReason ? t.reasons[ticket.refundReason] ?? "" : "";
  const message = {
    awaitingPayment: fillTemplate(t.messages.awaitingPayment, { time: holdTime }),
    processing: t.messages.processing,
    paymentFailed: fillTemplate(t.messages.paymentFailed, { time: holdTime }),
    expired: t.messages.expired,
    paid: t.messages.paid,
    attended: t.messages.attended,
    cancelled: t.messages.cancelled,
    refundPending: `${fillTemplate(t.messages.refundPending, { amount })} ${reason}`.trim(),
    refunded: `${fillTemplate(t.messages.refunded, { amount })} ${reason}`.trim(),
  }[status];
  const countdown =
    isCounting && leftMs > 0
      ? fillTemplate(t.holdLeft, {
          time: `${pad(Math.floor(leftMs / 60_000))}:${pad(Math.floor((leftMs % 60_000) / 1000))}`,
        })
      : null;
  const classHref = `/workshops/${ticket.workshop.slug}`;
  const isPaid = status === "paid";

  return (
    <section className="class-ticket-page">
      <div className="container">
        <header className="class-ticket-head">
          <p className="mono">{t.eyebrow}</p>
          <h3>{localized(ticket.workshop.title, locale)}</h3>
        </header>

        <div className="class-ticket-wrap">
          <ClassTicket ticket={ticket} />
        </div>

        <div className={`class-ticket-state is-${status}`} aria-live="polite">
          <p className="mono class-ticket-status">
            <span className="class-ticket-dot" aria-hidden="true" />
            {t.statuses[status]}
            {countdown && <span className="class-ticket-countdown">{countdown}</span>}
          </p>
          <p className="md">{message}</p>
          {checkout === "cancelled" && status === "awaitingPayment" && (
            <p className="class-ticket-note">
              {fillTemplate(t.checkoutCancelled, { time: holdTime })}
            </p>
          )}
          {ticket.extraPayments.map((payment) => (
            <p className="class-ticket-note" key={payment.id}>
              {fillTemplate(payment.status === "refunded" ? t.extraDone : t.extraPending, {
                amount: formatMoney(payment.amount, locale, ticket.currency),
              })}
            </p>
          ))}
        </div>

        {(ticket.canPay || ticket.canCancel) && (
          <div className="class-ticket-actions">
            {ticket.canPay && (
              <Button type="button" disabled={busy} onClick={pay}>
                {status === "paymentFailed" ? t.payAgain : fillTemplate(t.pay, { amount })}
              </Button>
            )}
            {ticket.canCancel && (
              <button
                type="button"
                className="hover-line class-link"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                {t.cancel}
              </button>
            )}
          </div>
        )}

        <div className="class-ticket-notes">
          {isPaid && (
            <p className="sm">
              {ticket.canCancel
                ? fillTemplate(t.refundUntil, {
                    date: formatShopDateTime(ticket.refundUntil, locale),
                  })
                : fillTemplate(t.noRefund, { phone: RESTAURANT.phone })}
            </p>
          )}
          {(isLive || isPaid) && <p className="sm">{t.keep}</p>}
          {isLive && ticket.email && (
            <p className="sm">{fillTemplate(t.emailNote, { email: ticket.email })}</p>
          )}
        </div>

        <nav className="class-ticket-links">
          <a href={localize(classHref)} className="hover-line class-link" onClick={go(classHref)}>
            {t.details}
          </a>
          <a href={localize("/workshops")} className="hover-line class-link" onClick={go("/workshops")}>
            {t.back}
          </a>
          <a
            href={localize("/reservation/track")}
            className="hover-line class-link"
            onClick={go("/reservation/track")}
          >
            {t.allBookings}
          </a>
        </nav>
      </div>

      <ConfirmDialog
        open={confirming}
        busy={busy}
        eyebrow={t.dialog.eyebrow}
        title={isPaid ? t.dialog.paidTitle : t.dialog.unpaidTitle}
        message={isPaid ? fillTemplate(t.dialog.paidNote, { amount }) : t.dialog.unpaidNote}
        confirmLabel={t.dialog.confirm}
        cancelLabel={t.dialog.back}
        onConfirm={cancel}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}
