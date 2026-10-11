"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLenis } from "lenis/react";
import gsap from "gsap";

import Button from "@/components/Button/Button";
import Photo from "@/components/Photo/Photo";
import ReservationTicket from "@/components/Reservations/ReservationTicket";
import { useToast } from "@/components/Toast/ToastProvider";
import { useViewTransition } from "@/hooks/useViewTransition";
import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate, formatGuests } from "@/i18n/format";
import {
  FIELD_ORDER,
  HOLD_MINUTES,
  MAX_GUESTS,
  MAX_LENGTH,
  MAX_UPCOMING_PER_PHONE,
  MIN_GUESTS,
  formatDateKey,
  getBookableDays,
  validateReservation,
} from "@/lib/booking";
import { RESTAURANT } from "@/lib/restaurant";

import { FieldShell, TextField } from "./Fields";
import { useReserve } from "./ReserveProvider";

import "./Reserve.css";

const CLIP_CLOSED = "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)";
const CLIP_OPEN = "polygon(0% 0%, 100% 0%, 100% 175%, 0% 100%)";
const CONTENT_HIDDEN = {
  rotation: -15,
  x: -100,
  y: -100,
  scale: 1.5,
  opacity: 0.25,
};
const TRACK_PATH = "/reservation/track";
const PHONE_HREF = `tel:${RESTAURANT.phoneIntl.replace(/\s/g, "")}`;
/* mail statuses that mean the ticket left (or, in development, was saved) */
const EMAIL_DELIVERED = ["sent", "previewed"];

/* bookable days in shop time, labelled in the visitor's language */
function buildDays(locale) {
  return getBookableDays().map((day) => ({
    ...day,
    weekday: formatDateKey(day.key, locale, { weekday: "short" }),
    day: Number(day.key.slice(8)),
    month: formatDateKey(day.key, locale, { month: "short" }),
    label: formatDateKey(day.key, locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
    }),
  }));
}

export default function ReservePopup({ pageRef }) {
  const { locale, dict, localize } = useLocale();
  const t = dict.reserve;
  const lenis = useLenis();
  const pathname = usePathname();
  const { toast } = useToast();
  const { navigateWithTransition } = useViewTransition();
  const {
    isOpen,
    close,
    form,
    showErrors,
    submitted,
    confirmation,
    setField,
    setShowErrors,
    confirm,
    startAnother,
  } = useReserve();

  const overlayRef = useRef(null);
  const contentRef = useRef(null);
  const scrollRef = useRef(null);
  const submitRef = useRef(null);
  const hasMountedRef = useRef(false);
  const closeInstantlyRef = useRef(false);
  const [isSending, setIsSending] = useState(false);
  /* field -> error key the server sent back, cleared on the next edit */
  const [serverErrors, setServerErrors] = useState({});
  const [daysVersion, setDaysVersion] = useState(0);
  /* { guests, days: { date: { time: available } } } from /api/availability */
  const [availability, setAvailability] = useState(null);
  const [scrollEdges, setScrollEdges] = useState({ top: false, bottom: false });

  /* rebuilt on open, and after the server turns a time down, so "today" and
     its remaining times are never stale */
  const days = useMemo(
    () => buildDays(locale),
    [locale, isOpen, daysVersion],
  );

  /* times with no table left for this party size, once the server has
     said so; until then nothing is ruled out (it checks again on submit) */
  const knownAvailability =
    availability?.guests === form.guests ? availability.days : null;
  const isTimeFull = (dateKey, time) =>
    knownAvailability?.[dateKey]?.[time] === false;
  const isDayFull = (day) =>
    day.isOpen &&
    Boolean(knownAvailability?.[day.key]) &&
    day.timeSlots.every((time) => isTimeFull(day.key, time));

  const selectedDay = days.find((day) => day.key === form.date);
  const availabilityErrors = {};
  if (selectedDay && isDayFull(selectedDay)) availabilityErrors.date = "full";
  else if (form.time && isTimeFull(form.date, form.time)) {
    availabilityErrors.time = "full";
  }
  const errors = {
    ...availabilityErrors,
    ...validateReservation(form, days).errors,
    ...serverErrors,
  };
  const errorCount = Object.keys(errors).length;
  const visibleErrors = showErrors ? errors : {};
  const errorText = (field) => {
    const key = visibleErrors[field];
    if (!key) return undefined;
    return fillTemplate(t.errors[key] ?? t.errors.unavailable, {
      max: key === "tooMany" ? MAX_UPCOMING_PER_PHONE : MAX_GUESTS,
    });
  };

  const updateField = (field, value) => {
    setServerErrors({});
    setField(field, value);
  };

  /* which times still have a table for this many guests; refreshed when
     the party size changes and after the server turns a time down */
  useEffect(() => {
    if (!isOpen || submitted) return;
    const guests = form.guests;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/availability?guests=${guests}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const data = await response.json();
        setAvailability({
          guests: data.guests,
          days: Object.fromEntries(
            data.days.map((day) => [
              day.date,
              Object.fromEntries(
                day.times.map(({ time, available }) => [time, available]),
              ),
            ]),
          ),
        });
      } catch {
        /* offline or aborted: the booking is still checked on submit */
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [isOpen, submitted, form.guests, daysVersion]);

  /* initial hidden state */
  useEffect(() => {
    gsap.set(overlayRef.current, { clipPath: CLIP_CLOSED, visibility: "hidden" });
    gsap.set(contentRef.current, CONTENT_HIDDEN);
  }, []);

  /* open / close choreography, mirrors the nav menu */
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }

    const overlay = overlayRef.current;
    const content = contentRef.current;
    const page = pageRef?.current;
    const targets = [overlay, content, page].filter(Boolean);
    gsap.killTweensOf(targets);

    if (isOpen) {
      const scrollY = window.scrollY;
      lenis?.stop();
      document.body.style.overflow = "hidden";
      if (scrollRef.current) scrollRef.current.scrollTop = 0;

      gsap.set(overlay, { visibility: "visible" });

      if (page) {
        page.style.transformOrigin = `right ${scrollY}px`;
        gsap.to(page, {
          rotation: 10,
          x: 300,
          y: 450,
          scale: 1.5,
          duration: 1.25,
          ease: "power4.inOut",
        });
      }

      gsap.to(content, {
        rotation: 0,
        x: 0,
        y: 0,
        scale: 1,
        opacity: 1,
        duration: 1.25,
        ease: "power4.inOut",
      });

      gsap.to(overlay, {
        clipPath: CLIP_OPEN,
        duration: 1.25,
        ease: "power4.inOut",
      });

      revealItems(0.75);
      overlay.focus({ preventScroll: true });
      return;
    }

    /* leaving the page: the incoming view covers us, so just reset */
    if (closeInstantlyRef.current) {
      closeInstantlyRef.current = false;
      gsap.set(overlay, { clipPath: CLIP_CLOSED, visibility: "hidden" });
      gsap.set(content, CONTENT_HIDDEN);
      if (page) {
        gsap.set(page, { clearProps: "all" });
        page.style.transformOrigin = "";
      }
      document.body.style.overflow = "";
      lenis?.start();
      return;
    }

    if (page) {
      gsap.to(page, {
        rotation: 0,
        x: 0,
        y: 0,
        scale: 1,
        duration: 1.25,
        ease: "power4.inOut",
        onComplete: () => {
          gsap.set(page, { clearProps: "all" });
          page.style.transformOrigin = "";
        },
      });
    }

    gsap.to(content, {
      ...CONTENT_HIDDEN,
      duration: 1.25,
      ease: "power4.inOut",
    });

    gsap.to(overlay, {
      clipPath: CLIP_CLOSED,
      duration: 1.25,
      ease: "power4.inOut",
      onComplete: () => {
        gsap.set(overlay, { visibility: "hidden" });
        document.body.style.overflow = "";
        lenis?.start();
      },
    });
  }, [isOpen]);

  /* a route change (e.g. "Track my reservations") closes the popup */
  useEffect(() => {
    if (!isOpen) return;
    closeInstantlyRef.current = true;
    close();
  }, [pathname]);

  /* swap between form and confirmation views */
  useEffect(() => {
    if (!isOpen) return;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    revealItems(0);
  }, [submitted]);

  /* escape closes */
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  /* fade the scrolling fields out under the fixed title and button, only on
     the sides that have more to scroll to */
  function updateScrollEdges() {
    const node = scrollRef.current;
    if (!node) return;
    const top = node.scrollTop > 2;
    const bottom = node.scrollTop + node.clientHeight < node.scrollHeight - 2;
    setScrollEdges((prev) =>
      prev.top === top && prev.bottom === bottom ? prev : { top, bottom },
    );
  }

  useEffect(updateScrollEdges);

  useEffect(() => {
    window.addEventListener("resize", updateScrollEdges);
    return () => window.removeEventListener("resize", updateScrollEdges);
  }, []);

  function revealItems(delay) {
    const items = overlayRef.current?.querySelectorAll(".reserve-reveal");
    if (!items?.length) return;
    gsap.killTweensOf(items);
    gsap.fromTo(
      items,
      { y: "140%", opacity: 0.25 },
      {
        y: "0%",
        opacity: 1,
        delay,
        duration: 1,
        ease: "power3.out",
        stagger: 0.05,
      },
    );
  }

  /* shake the button and bring the first field that needs attention into view */
  function flagErrors(fieldErrors) {
    setShowErrors(true);

    gsap.fromTo(
      submitRef.current,
      { x: 0 },
      {
        keyframes: { x: [-12, 10, -8, 6, -3, 0] },
        duration: 0.5,
        ease: "power2.out",
      },
    );

    const firstInvalid = FIELD_ORDER.find((field) => fieldErrors[field]);
    const target = overlayRef.current?.querySelector(
      `[data-field="${firstInvalid}"]`,
    );
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target
      ?.querySelector("input, textarea, button")
      ?.focus({ preventScroll: true });
  }

  function showFailure(reason) {
    toast({
      tone: "error",
      eyebrow: t.failed.eyebrow,
      title: t.failed.title,
      message: fillTemplate(
        reason === "rateLimited" ? t.failed.rateLimited : t.failed.message,
        { phone: RESTAURANT.phone },
      ),
      duration: 9000,
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (isSending) return;

    if (errorCount > 0) {
      flagErrors(errors);
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, locale }),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        confirm(data);
        return;
      }
      if (data.error === "validation" && data.fields) {
        setServerErrors(data.fields);
        setDaysVersion((version) => version + 1);
        flagErrors(data.fields);
        return;
      }
      showFailure(data.error);
    } catch {
      showFailure();
    } finally {
      setIsSending(false);
    }
  }

  function openTracking(e) {
    e.preventDefault();
    if (window.location.pathname === localize(TRACK_PATH)) close();
    else navigateWithTransition(TRACK_PATH);
  }

  const reservation = submitted ? confirmation?.reservation : null;
  const successMessage = reservation
    ? fillTemplate(t.success.message, {
        name: reservation.name,
        guests: formatGuests(reservation.guests, t),
        date: formatDateKey(reservation.date, locale, {
          weekday: "long",
          day: "numeric",
          month: "long",
        }),
        time: reservation.time,
      })
    : "";
  const emailNote = !reservation
    ? ""
    : !reservation.email
      ? t.success.noEmail
      : fillTemplate(
          EMAIL_DELIVERED.includes(confirmation.emails?.guest)
            ? t.success.emailSent
            : t.success.emailFailed,
          { email: reservation.email },
        );
  const holdNote = fillTemplate(t.success.hold, { minutes: HOLD_MINUTES });
  const [groupNoteStart, groupNoteEnd] = fillTemplate(t.largeGroup, {
    next: MAX_GUESTS + 1,
    phone: "\u0000",
  }).split("\u0000");

  const scrollClasses = `reserve-body ${scrollEdges.top ? "fade-top" : ""} ${scrollEdges.bottom ? "fade-bottom" : ""}`;

  return (
    <div
      className="reserve-overlay"
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="reserve-title"
      aria-hidden={!isOpen}
      inert={!isOpen}
      tabIndex={-1}
    >
      <div className="reserve-bar">
        <p className="mono">{reservation ? t.success.eyebrow : t.eyebrow}</p>
        <button type="button" className="reserve-close hover-line" onClick={close}>
          {t.close}
        </button>
      </div>

      <div className="reserve-content" ref={contentRef}>
        <div className="reserve-col-lg">
          <div className="reserve-photo">
            <div className="reserve-preview-img">
              <Photo src="/menu/menu-book.jpg" sizes="(max-width: 900px) 1px, 30vw" width={900} height={1400} />
            </div>
            {/* the shop's note, pinned to the photo like a slip of menu
                paper; on phones it stays under the title instead */}
            <p className="reserve-note">{t.intro}</p>
          </div>
          <div className="reserve-info">
            {t.info.map((line) => (
              <p className="mono" key={line}>
                {line}
              </p>
            ))}
          </div>
        </div>

        <div className="reserve-col-sm">
          {reservation ? (
            <div className="reserve-panel reserve-success" key="success">
              <div className="reserve-head">
                <div className="reserve-mask">
                  <h3 id="reserve-title" className="reserve-reveal">
                    {t.success.title}
                  </h3>
                </div>
                <div className="reserve-mask">
                  <p className="reserve-reveal reserve-intro">{successMessage}</p>
                </div>
              </div>

              <div
                className={scrollClasses}
                ref={scrollRef}
                onScroll={updateScrollEdges}
                data-lenis-prevent
              >
                <div className="reserve-mask">
                  <div className="reserve-reveal">
                    <ReservationTicket reservation={reservation} />
                  </div>
                </div>
                <div className="reserve-mask">
                  <p className="mono reserve-reveal reserve-email-note">{emailNote}</p>
                </div>
                <div className="reserve-mask">
                  <p className="mono reserve-reveal reserve-email-note">{holdNote}</p>
                </div>
              </div>

              <div className="reserve-foot reserve-success-actions">
                <div className="reserve-mask">
                  <div className="reserve-reveal">
                    <Button type="button" onClick={startAnother}>
                      {t.success.another}
                    </Button>
                  </div>
                </div>
                <div className="reserve-mask">
                  <div className="reserve-reveal">
                    <a
                      href={localize(TRACK_PATH)}
                      className="reserve-track-link hover-line"
                      onClick={openTracking}
                    >
                      {t.success.track}
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <form
              className="reserve-panel reserve-form"
              key="form"
              onSubmit={handleSubmit}
              noValidate
            >
              <div className="reserve-head">
                <div className="reserve-mask">
                  <h3 id="reserve-title" className="reserve-reveal">
                    {t.title}
                  </h3>
                </div>
                <div className="reserve-mask">
                  <p className="reserve-reveal reserve-intro">{t.intro}</p>
                </div>
              </div>

              <div
                className={scrollClasses}
                ref={scrollRef}
                onScroll={updateScrollEdges}
                data-lenis-prevent
              >
                <div className="reserve-grid">
                  <TextField
                    field="name"
                    label={t.fields.name}
                    placeholder={t.fields.namePlaceholder}
                    autoComplete="name"
                    maxLength={MAX_LENGTH.name}
                    value={form.name}
                    error={errorText("name")}
                    onChange={updateField}
                  />
                  <TextField
                    field="phone"
                    type="tel"
                    label={t.fields.phone}
                    placeholder={t.fields.phonePlaceholder}
                    autoComplete="tel"
                    value={form.phone}
                    error={errorText("phone")}
                    onChange={updateField}
                  />
                  <TextField
                    field="email"
                    type="email"
                    label={t.fields.email}
                    hint={t.fields.optional}
                    placeholder={t.fields.emailPlaceholder}
                    autoComplete="email"
                    maxLength={MAX_LENGTH.email}
                    value={form.email}
                    error={errorText("email")}
                    onChange={updateField}
                  />

                  <FieldShell
                    field="guests"
                    label={t.fields.guests}
                    hint={fillTemplate(t.fields.guestsHint, { max: MAX_GUESTS })}
                    error={errorText("guests")}
                  >
                    <div className="reserve-stepper">
                      <button
                        type="button"
                        aria-label="-1"
                        disabled={form.guests <= MIN_GUESTS}
                        onClick={() =>
                          updateField(
                            "guests",
                            Math.max(MIN_GUESTS, form.guests - 1),
                          )
                        }
                      >
                        &minus;
                      </button>
                      <span className="reserve-stepper-value" aria-live="polite">
                        <span>{String(form.guests).padStart(2, "0")}</span>
                        <em>{form.guests === 1 ? t.guestOne : t.guestOther}</em>
                      </span>
                      <button
                        type="button"
                        aria-label="+1"
                        disabled={form.guests >= MAX_GUESTS}
                        onClick={() =>
                          updateField(
                            "guests",
                            Math.min(MAX_GUESTS, form.guests + 1),
                          )
                        }
                      >
                        +
                      </button>
                    </div>
                  </FieldShell>
                </div>

                <div className="reserve-mask">
                  <p className="reserve-reveal reserve-group-note">
                    {groupNoteStart}
                    <a href={PHONE_HREF}>{RESTAURANT.phone}</a>
                    {groupNoteEnd}
                  </p>
                </div>

                <FieldShell
                  field="date"
                  label={t.fields.date}
                  error={errorText("date")}
                >
                  <div className="reserve-chips reserve-days" role="radiogroup">
                    {days.map((day) => {
                      const isFull = isDayFull(day);
                      const note = !day.isOpen ? t.closed : isFull ? t.full : null;
                      return (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={form.date === day.key}
                          aria-label={note ? `${day.label} (${note})` : day.label}
                          title={note ?? undefined}
                          disabled={!day.isOpen || isFull}
                          key={day.key}
                          className={`reserve-day ${form.date === day.key ? "active" : ""}`}
                          onClick={() => {
                            updateField("date", day.key);
                            if (
                              !day.timeSlots.includes(form.time) ||
                              isTimeFull(day.key, form.time)
                            ) {
                              updateField("time", "");
                            }
                          }}
                        >
                          <span className="reserve-day-weekday">{day.weekday}</span>
                          <span className="reserve-day-number">{day.day}</span>
                          <span className="reserve-day-month">{day.month}</span>
                        </button>
                      );
                    })}
                  </div>
                </FieldShell>

                <FieldShell
                  field="time"
                  label={t.fields.time}
                  error={errorText("time")}
                >
                  {selectedDay ? (
                    <div className="reserve-chips reserve-times" role="radiogroup">
                      {selectedDay.timeSlots.map((slot) => {
                        const isFull = isTimeFull(selectedDay.key, slot);
                        return (
                          <button
                            type="button"
                            role="radio"
                            aria-checked={form.time === slot}
                            aria-label={isFull ? `${slot} (${t.full})` : undefined}
                            title={isFull ? t.full : undefined}
                            disabled={isFull}
                            key={slot}
                            className={`reserve-time ${form.time === slot ? "active" : ""}`}
                            onClick={() => updateField("time", slot)}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mono reserve-time-hint">{t.fields.timeHint}</p>
                  )}
                </FieldShell>

                <TextField
                  field="notes"
                  label={t.fields.notes}
                  placeholder={t.fields.notesPlaceholder}
                  maxLength={MAX_LENGTH.notes}
                  value={form.notes}
                  error={errorText("notes")}
                  onChange={updateField}
                  multiline
                />
              </div>

              <div className="reserve-foot">
                <div
                  className={`reserve-missing ${showErrors && errorCount > 0 ? "is-visible" : ""}`}
                  aria-live="polite"
                >
                  <p className="mono">
                    <span className="reserve-missing-dot" />
                    {errorCount === 1
                      ? t.missingOne
                      : fillTemplate(t.missingOther, { count: errorCount })}
                  </p>
                </div>
                <div className="reserve-mask">
                  <div className="reserve-reveal" ref={submitRef}>
                    <Button type="submit" disabled={isSending}>
                      {isSending ? t.submitting : t.submit}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
