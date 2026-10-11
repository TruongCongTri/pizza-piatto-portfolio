"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLenis } from "lenis/react";

import Button from "@/components/Button/Button";
import Copy from "@/components/Copy/Copy";
import Photo from "@/components/Photo/Photo";
import { FieldShell, TextField } from "@/components/Reserve/Fields";
import { useViewTransition } from "@/hooks/useViewTransition";
import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate } from "@/i18n/format";
import { MAX_LENGTH } from "@/lib/booking";
import { formatMoney } from "@/lib/payments";
import { RESTAURANT } from "@/lib/restaurant";
import {
  formatSeats,
  formatSession,
  HOLD_MINUTES,
  localized,
  localizedList,
  MAX_SEATS_PER_BOOKING,
} from "@/lib/workshops";

import { classBadge, coverOf, newIdempotencyKey, scheduleLine } from "./class-view";

import "@/components/Reservations/Reservations.css";
import "./Workshops.css";

const JSON_HEADERS = { "Content-Type": "application/json" };
/* seats change while the page is open; look again this often */
const REFRESH_MS = 60_000;
const pad = (value) => String(value).padStart(2, "0");

/* one class: what it teaches, when, what it costs, seats left and the
   booking form; once it has happened, its photos and notes come first */
export default function WorkshopDetail({ workshop: initial, provider }) {
  const { locale, dict, localize } = useLocale();
  const t = dict.workshops;
  const lenis = useLenis();
  const { navigateWithTransition } = useViewTransition();
  const [workshop, setWorkshop] = useState(initial);
  const asideRef = useRef(null);

  useEffect(() => {
    let timer;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/workshops/${encodeURIComponent(initial.slug)}`, {
          cache: "no-store",
        });
        if (response.ok) setWorkshop((await response.json()).workshop);
      } catch {
        /* keep what we have */
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = setTimeout(async () => {
        await refresh();
        schedule();
      }, REFRESH_MS);
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        schedule();
      } else {
        clearTimeout(timer);
      }
    };
    schedule();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [initial.slug]);

  const title = localized(workshop.title, locale);
  const summary = localized(workshop.summary, locale);
  const description = localized(workshop.description, locale);
  const learn = localizedList(workshop.learn, locale);
  const recapText = localized(workshop.recap?.text, locale);
  const images = workshop.recap?.images ?? [];
  const hasRecap = Boolean(recapText || images.length);
  const isPast = workshop.phase === "past";
  /* a class with no place given is at the shop; for a past class brought
     in from the shop's posts, where it was held may not be known */
  const location = localized(workshop.location, locale) || (isPast ? "" : dict.reserve.info[1]);

  const scrollToForm = () => {
    const target = asideRef.current;
    if (!target) return;
    if (lenis) lenis.scrollTo(target, { offset: -110 });
    else target.scrollIntoView({ behavior: "smooth" });
  };

  const recap = hasRecap && (
    <section className="class-block class-recap">
      <h6>{t.recapTitle}</h6>
      {recapText &&
        recapText
          .split(/\n{2,}/)
          .map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {images.length > 0 && <RecapGallery images={images} />}
    </section>
  );

  return (
    <>
      <section className="class-hero">
        <div className="container">
          <a
            href={localize("/workshops")}
            className="hover-line class-back"
            onClick={(e) => {
              e.preventDefault();
              navigateWithTransition("/workshops");
            }}
          >
            ← {t.back}
          </a>
          <p className="mono class-hero-when">{scheduleLine(workshop, locale, t)}</p>
          <Copy type="words" animateOnScroll={false} delay={0.6}>
            <h2>{title}</h2>
          </Copy>
          {summary && (
            <Copy type="lines" animateOnScroll={false} delay={0.9}>
              <p className="lg">{summary}</p>
            </Copy>
          )}
          <dl className="class-facts">
            {workshop.price > 0 && (
              <div>
                <dt className="mono">{t.fee}</dt>
                <dd>{fillTemplate(t.perSeat, { price: formatMoney(workshop.price, locale) })}</dd>
              </div>
            )}
            {!isPast && workshop.capacity > 0 && workshop.status !== "cancelled" && (
              <div>
                <dt className="mono">{t.seats}</dt>
                <dd>
                  {workshop.seatsLeft > 0
                    ? fillTemplate(t.seatsOf, {
                        left: workshop.seatsLeft,
                        capacity: workshop.capacity,
                      })
                    : t.full}
                </dd>
              </div>
            )}
            {workshop.instructor && (
              <div>
                <dt className="mono">{t.teacher}</dt>
                <dd>{workshop.instructor}</dd>
              </div>
            )}
          </dl>
          {workshop.bookable && (
            <div className="class-hero-cta">
              <Button type="button" onClick={scrollToForm}>
                {t.book}
              </Button>
            </div>
          )}
        </div>
      </section>

      <div className="class-cover">
        <Photo src={coverOf(workshop)} sizes="100vw" preload />
      </div>

      <section className="class-body">
        <div className="container class-layout">
          <div className="class-main">
            {workshop.status === "cancelled" && (
              <p className="class-alert" role="status">
                {t.cancelledNote}
              </p>
            )}
            {isPast && recap}
            {description && (
              <section className="class-block">
                <h6>{t.about}</h6>
                {description.split(/\n{2,}/).map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </section>
            )}
            {learn.length > 0 && (
              <section className="class-block">
                <h6>{t.learn}</h6>
                <ul className="class-learn">
                  {learn.map((item, index) => (
                    <li key={index}>
                      <span className="mono">{pad(index + 1)}</span>
                      <p>{item}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {workshop.sessions.length > 0 && (
              <section className="class-block">
                <h6>{t.schedule}</h6>
                <ul className="class-sessions">
                  {workshop.sessions.map((session) => (
                    <li key={`${session.date}-${session.start}`}>
                      <p>{formatSession(session, locale, { long: true })}</p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {location && (
              <section className="class-block">
                <h6>{t.where}</h6>
                <p>{location}</p>
              </section>
            )}
            {!isPast && recap}
          </div>

          <aside className="class-aside" ref={asideRef}>
            {workshop.bookable ? (
              <BookingForm
                workshop={workshop}
                provider={provider}
                onSeatsLeft={(left) =>
                  setWorkshop((prev) => ({
                    ...prev,
                    seatsLeft: left,
                    bookable: prev.bookable && left > 0,
                  }))
                }
              />
            ) : (
              <ClassClosed workshop={workshop} />
            )}
          </aside>
        </div>
      </section>
    </>
  );
}

/* where the form would be, for a class that can't be booked online */
function ClassClosed({ workshop }) {
  const { dict } = useLocale();
  const t = dict.workshops;
  const badge = classBadge(workshop, t);
  const isPast = workshop.phase === "past";
  return (
    <div className="class-panel is-closed">
      {!isPast && <p className="mono">{t.form.eyebrow}</p>}
      <p className="md">{isPast ? t.finished : badge?.label}</p>
      <p className="sm">
        <a href={`tel:${RESTAURANT.phoneIntl.replace(/\s/g, "")}`}>
          {fillTemplate(t.questions, { phone: RESTAURANT.phone })}
        </a>
      </p>
    </div>
  );
}

/* name, phone, optional email and seats; holds the seats and goes on to
   the payment page. A retried submit carries the same key, so it can never
   book twice. */
function BookingForm({ workshop, provider, onSeatsLeft }) {
  const { locale, dict } = useLocale();
  const t = dict.workshops.form;
  const r = dict.reserve;
  const [form, setForm] = useState({ name: "", phone: "", email: "", seats: 1 });
  const [errors, setErrors] = useState({});
  /* { text, action: { label, run } } */
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const attemptRef = useRef(null);

  const most = Math.max(1, Math.min(MAX_SEATS_PER_BOOKING, workshop.seatsLeft));
  useEffect(() => {
    setForm((prev) => (prev.seats > most ? { ...prev, seats: most } : prev));
  }, [most]);

  /* leaving for the payment page and coming back restores this page from
     the browser's cache: let the form be used again */
  useEffect(() => {
    const handleShow = (event) => {
      if (event.persisted) setBusy(false);
    };
    window.addEventListener("pageshow", handleShow);
    return () => window.removeEventListener("pageshow", handleShow);
  }, []);

  const change = (field, value) => {
    /* a changed form is a new booking */
    attemptRef.current = null;
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setNotice(null);
  };

  const errorText = (field) => {
    const key = errors[field];
    if (!key) return undefined;
    if (field === "seats") return fillTemplate(t.invalidSeats, { max: most });
    return r.errors[key] ?? r.errors.required;
  };

  const submit = useCallback(
    async ({ additional = false } = {}) => {
      if (busy) return;
      const missing = {};
      if (!form.name.trim()) missing.name = "required";
      if (!form.phone.trim()) missing.phone = "required";
      if (Object.keys(missing).length) {
        setErrors(missing);
        return;
      }

      attemptRef.current ??= newIdempotencyKey();
      const key = attemptRef.current;
      setBusy(true);
      setNotice(null);
      const phone = RESTAURANT.phone;
      try {
        const response = await fetch(`/api/workshops/${encodeURIComponent(workshop.slug)}/book`, {
          method: "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({
            ...form,
            locale,
            idempotencyKey: key,
            allowAdditional: additional,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          /* stays busy while the browser leaves for the payment page */
          window.location.assign(data.checkoutUrl || data.ticketPath);
          return;
        }
        setBusy(false);
        switch (data.error) {
          case "validation":
            setErrors(data.fields ?? {});
            break;
          case "alreadyBooked":
            setNotice({
              text: t.alreadyBooked,
              action: { label: t.bookMore, run: () => submit({ additional: true }) },
            });
            break;
          case "full":
            onSeatsLeft(0);
            setNotice({ text: t.full });
            break;
          case "notEnoughSeats":
            onSeatsLeft(data.seatsLeft);
            setNotice({
              text: fillTemplate(t.notEnoughSeats, { count: formatSeats(data.seatsLeft, t) }),
            });
            break;
          case "closed":
          case "notFound":
            setNotice({ text: t.closedError });
            break;
          case "paymentsOff":
            setNotice({ text: fillTemplate(t.paymentsOff, { phone }) });
            break;
          case "rateLimited":
            setNotice({ text: t.rateLimited });
            break;
          default:
            setNotice({ text: fillTemplate(t.failed, { phone }) });
        }
        /* the server answered: anything sent next is a new attempt */
        attemptRef.current = null;
      } catch {
        /* no answer: a retry reuses the same key, in case it got through */
        setBusy(false);
        setNotice({ text: fillTemplate(t.failed, { phone }) });
      }
    },
    [busy, form, locale, onSeatsLeft, t, workshop.slug],
  );

  const total = formatMoney(form.seats * workshop.price, locale);

  if (!provider) {
    return (
      <div className="class-panel">
        <p className="mono">{t.eyebrow}</p>
        <p className="md">
          <a href={`tel:${RESTAURANT.phoneIntl.replace(/\s/g, "")}`}>
            {fillTemplate(t.paymentsOff, { phone: RESTAURANT.phone })}
          </a>
        </p>
      </div>
    );
  }

  return (
    <form
      className="class-panel class-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="class-form-head">
        <p className="mono">{t.eyebrow}</p>
        <h6>{t.title}</h6>
      </div>

      {/* the fields scroll between the title and the pay button, so the
          whole form fits on screen and stays put beside the class */}
      <div className="class-form-body" data-lenis-prevent>
        <TextField
          field="name"
          label={r.fields.name}
          placeholder={r.fields.namePlaceholder}
          autoComplete="name"
          maxLength={MAX_LENGTH.name}
          value={form.name}
          error={errorText("name")}
          onChange={change}
        />
        <TextField
          field="phone"
          type="tel"
          label={r.fields.phone}
          placeholder={r.fields.phonePlaceholder}
          autoComplete="tel"
          value={form.phone}
          error={errorText("phone")}
          onChange={change}
        />
        <TextField
          field="email"
          type="email"
          label={r.fields.email}
          hint={r.fields.optional}
          placeholder={r.fields.emailPlaceholder}
          autoComplete="email"
          maxLength={MAX_LENGTH.email}
          value={form.email}
          error={errorText("email")}
          onChange={change}
        />
        <FieldShell
          field="seats"
          label={t.seats}
          hint={fillTemplate(t.seatsHint, { max: most })}
          error={errorText("seats")}
        >
          <div className="reserve-stepper">
            <button
              type="button"
              aria-label="-1"
              disabled={form.seats <= 1}
              onClick={() => change("seats", Math.max(1, form.seats - 1))}
            >
              &minus;
            </button>
            <span className="reserve-stepper-value" aria-live="polite">
              <span>{pad(form.seats)}</span>
              <em>{form.seats === 1 ? t.seatOne : t.seatOther}</em>
            </span>
            <button
              type="button"
              aria-label="+1"
              disabled={form.seats >= most}
              onClick={() => change("seats", Math.min(most, form.seats + 1))}
            >
              +
            </button>
          </div>
        </FieldShell>

        <ul className="class-terms">
          <li>{fillTemplate(t.hold, { minutes: HOLD_MINUTES })}</li>
          <li>{fillTemplate(t.refund, { hours: workshop.refundUntilHours })}</li>
          <li>{fillTemplate(t.closes, { hours: workshop.bookingClosesHours })}</li>
          {provider === "mock" && <li className="is-test">{t.testMode}</li>}
        </ul>
      </div>

      <div className="class-form-foot">
        <div className="class-total">
          <span className="mono">{t.total}</span>
          <span className="class-total-value">{total}</span>
        </div>

        {notice && (
          <div className="class-notice" role="alert">
            <p>{notice.text}</p>
            {notice.action && (
              <button
                type="button"
                className="hover-line class-notice-action"
                disabled={busy}
                onClick={notice.action.run}
              >
                {notice.action.label}
              </button>
            )}
          </div>
        )}

        <div className="class-form-submit">
          <Button type="submit" disabled={busy}>
            {busy ? t.paying : t.pay}
          </Button>
        </div>
      </div>
    </form>
  );
}

/* the class's photos; one opens large, with its caption */
function RecapGallery({ images }) {
  const { locale } = useLocale();
  const [open, setOpen] = useState(null);

  return (
    <>
      <ul className="class-gallery">
        {images.map((image, index) => {
          const caption = localized(image.caption, locale);
          return (
            <li key={image.id}>
              <button
                type="button"
                className="class-gallery-item"
                onClick={() => setOpen(index)}
                aria-label={caption || undefined}
              >
                <Photo
                  src={image.url}
                  alt={caption}
                  sizes="(max-width: 700px) 50vw, 25vw"
                  width={image.width || 1200}
                  height={image.height || 900}
                />
              </button>
              {caption && <p className="sm class-gallery-caption">{caption}</p>}
            </li>
          );
        })}
      </ul>
      {open !== null && (
        <Lightbox images={images} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

function Lightbox({ images, index, onIndex, onClose }) {
  const { locale, dict } = useLocale();
  const t = dict.workshops;
  const lenis = useLenis();
  const closeRef = useRef(null);
  const image = images[index];
  const caption = localized(image.caption, locale);
  const step = useCallback(
    (by) => onIndex((index + by + images.length) % images.length),
    [index, images.length, onIndex],
  );

  useEffect(() => {
    const returnFocus = document.activeElement;
    lenis?.stop();
    closeRef.current?.focus();
    return () => {
      lenis?.start();
      returnFocus?.focus?.({ preventScroll: true });
    };
  }, [lenis]);

  useEffect(() => {
    const handleKey = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, step]);

  return createPortal(
    <div
      className="class-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={fillTemplate(t.photo, { index: index + 1, count: images.length })}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <figure>
        <img src={image.url} alt={caption} />
        <figcaption>
          <span className="mono">
            {fillTemplate(t.photo, { index: index + 1, count: images.length })}
          </span>
          {caption && <span>{caption}</span>}
        </figcaption>
      </figure>
      <div className="class-lightbox-controls">
        {images.length > 1 && (
          <button type="button" className="rs-chip" onClick={() => step(-1)}>
            ← {t.previous}
          </button>
        )}
        {images.length > 1 && (
          <button type="button" className="rs-chip" onClick={() => step(1)}>
            {t.next} →
          </button>
        )}
        <button type="button" className="rs-chip" ref={closeRef} onClick={onClose}>
          {t.close}
        </button>
      </div>
    </div>,
    document.body,
  );
}
