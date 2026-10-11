"use client";

import { useEffect, useState } from "react";

import { useLocale } from "@/i18n/LocaleProvider";
import { formatMoney } from "@/lib/payments";
import { RESTAURANT } from "@/lib/restaurant";
import { formatShopDateTime } from "@/lib/workshops";

import "@/components/Reservations/Reservations.css";
import "./MockCheckout.css";

const JSON_HEADERS = { "Content-Type": "application/json" };
const CLOSED = new Set(["FAILED", "CANCELLED", "EXPIRED"]);

/* the built-in test checkout: stands where a real payment provider's page
   would, so bookings can be tried end to end without real money. Besides
   paying, it can act out a slow bank, a webhook delivered twice, a decline,
   and money arriving on a link the shop already closed. */
export default function MockCheckout({ reference }) {
  const { locale, dict } = useLocale();
  const t = dict.mockPay;
  const [link, setLink] = useState(null);
  /* "loading" | "ready" | "notFound" */
  const [state, setState] = useState("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/payments/mock/${encodeURIComponent(reference)}`, { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) return setState("notFound");
        setLink((await response.json()).link);
        setState("ready");
      })
      .catch(() => active && setState("notFound"));
    return () => {
      active = false;
    };
  }, [reference]);

  async function act(action, options = {}) {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/payments/mock/${encodeURIComponent(reference)}`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ action, ...options }),
      });
      const data = await response.json();
      if (!response.ok || !data.redirect) throw new Error("No redirect");
      window.location.assign(data.redirect);
    } catch {
      setBusy(false);
    }
  }

  if (state !== "ready") {
    return (
      <section className="mockpay">
        <div className="container">
          <p className="mono">{state === "loading" ? dict.track.loading : t.notFound}</p>
        </div>
      </section>
    );
  }

  const expired = link.status === "PENDING" && Date.parse(link.expiresAt) <= Date.now();
  const shown = expired ? "EXPIRED" : link.status;
  const isOpen = shown === "PENDING";
  const isClosed = CLOSED.has(shown);

  return (
    <section className="mockpay">
      <div className="container">
        <div className="mockpay-card">
          <header className="mockpay-head">
            <p className="mono">{t.eyebrow}</p>
            <h4>{t.title}</h4>
            <p className="sm mockpay-notice">{t.notice}</p>
          </header>

          <dl className="mockpay-rows">
            <div>
              <dt className="mono">{t.merchant}</dt>
              <dd>{RESTAURANT.name}</dd>
            </div>
            <div>
              <dt className="mono">{t.amount}</dt>
              <dd className="mockpay-amount">{formatMoney(link.amount, locale)}</dd>
            </div>
            <div>
              <dt className="mono">{t.reference}</dt>
              <dd>{link.description}</dd>
            </div>
            <div>
              <dt className="mono">{t.status}</dt>
              <dd className={`mockpay-status is-${shown.toLowerCase()}`}>{t.statuses[shown]}</dd>
            </div>
            <div>
              <dt className="mono">{t.expires}</dt>
              <dd>{formatShopDateTime(link.expiresAt, locale)}</dd>
            </div>
          </dl>

          {isOpen && (
            <div className="mockpay-actions">
              <button type="button" className="mockpay-pay" disabled={busy} onClick={() => act("pay")}>
                {busy ? t.working : t.pay}
              </button>
              <div className="mockpay-more">
                <button type="button" className="rs-chip" disabled={busy} onClick={() => act("pay", { slow: true })}>
                  {t.paySlow}
                </button>
                <button type="button" className="rs-chip" disabled={busy} onClick={() => act("pay", { twice: true })}>
                  {t.payTwice}
                </button>
                <button type="button" className="rs-chip" disabled={busy} onClick={() => act("fail")}>
                  {t.fail}
                </button>
              </div>
              <button type="button" className="hover-line mockpay-cancel" disabled={busy} onClick={() => act("cancel")}>
                {t.cancel}
              </button>
            </div>
          )}

          {isClosed && (
            <div className="mockpay-actions">
              <p className="sm">{t.late}</p>
              <button type="button" className="mockpay-pay" disabled={busy} onClick={() => act("pay")}>
                {busy ? t.working : t.payLate}
              </button>
              <a className="hover-line mockpay-cancel" href={link.returnUrl}>
                {t.back}
              </a>
            </div>
          )}

          {!isOpen && !isClosed && (
            <div className="mockpay-actions">
              <p className="sm">{t.done}</p>
              <a className="hover-line mockpay-cancel" href={link.returnUrl}>
                {t.back}
              </a>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
