"use client";

import { memo, useMemo } from "react";

import Copy from "@/components/Copy/Copy";
import HeroCollage from "@/components/HeroCollage/HeroCollage";
import Photo from "@/components/Photo/Photo";
import { LIST_STEP, useIncremental } from "@/hooks/useIncremental";
import { useViewTransition } from "@/hooks/useViewTransition";
import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate } from "@/i18n/format";
import { formatDateKey } from "@/lib/booking";
import { formatMoney } from "@/lib/payments";
import { RESTAURANT } from "@/lib/restaurant";
import { hasTimes, localized } from "@/lib/workshops";

import { classBadge, coverOf } from "./class-view";

import "./Workshops.css";

/* the class calendar: what is coming up (with seats left), then past
   classes with their photos */
export default function WorkshopList({ workshops }) {
  const { dict } = useLocale();
  const t = dict.workshops;
  const upcoming = useMemo(() => workshops.filter((workshop) => workshop.phase !== "past"), [workshops]);
  const past = useMemo(
    () => workshops.filter((workshop) => workshop.phase === "past").reverse(),
    [workshops],
  );
  /* photos from the classes so far, behind the title */
  const photos = useMemo(
    () => workshops.flatMap((workshop) => (workshop.recap?.images ?? []).map((image) => image.url)),
    [workshops],
  );

  return (
    <>
      <section className="classes-hero">
        <HeroCollage images={photos} />
        <div className="container">
          <Copy type="lines" animateOnScroll={false} delay={0.6}>
            <p className="mono">{t.eyebrow}</p>
          </Copy>
          <Copy type="words" animateOnScroll={false} delay={0.75}>
            <h2>{t.title}</h2>
          </Copy>
          <Copy type="lines" animateOnScroll={false} delay={1.1}>
            <p className="lg">{t.intro}</p>
          </Copy>
        </div>
      </section>

      <section className="classes-section">
        <div className="container">
          <h4 className="classes-heading">{t.upcoming}</h4>
          {upcoming.length ? (
            <ClassGrid workshops={upcoming} />
          ) : (
            <div className="classes-empty">
              <p className="md">{t.none}</p>
              <a
                className="hover-line classes-link"
                href={RESTAURANT.links.facebook}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.facebook}
              </a>
            </div>
          )}
        </div>
      </section>

      <section className="classes-section is-past">
        <div className="container">
          <h4 className="classes-heading">{t.past}</h4>
          {past.length ? (
            <ClassGrid workshops={past} />
          ) : (
            <div className="classes-empty">
              <p className="md">{t.noPast}</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}

/* a few classes at a time: the first five, then five more as the end
   comes near (useIncremental) */
function ClassGrid({ workshops }) {
  const { count, hasMore, sentinelRef } = useIncremental(workshops.length);
  return (
    <>
      <div className="classes-grid">
        {workshops.slice(0, count).map((workshop, index) => (
          <ClassCard
            key={workshop.slug}
            workshop={workshop}
            className={index >= LIST_STEP ? "list-item-in" : ""}
          />
        ))}
      </div>
      {hasMore && <span className="list-sentinel" ref={sentinelRef} aria-hidden="true" />}
    </>
  );
}

/* the hours of a class when every session keeps the same ones */
function sharedHours(sessions) {
  const [first] = sessions;
  if (!first || !hasTimes(first)) return "";
  const same = sessions.every((session) => session.start === first.start && session.end === first.end);
  return same ? `${first.start}–${first.end}` : "";
}

const sameMonth = (first, last) => !last || first.date.slice(0, 7) === last.date.slice(0, 7);
const dayOf = (session) => Number(session.date.slice(8));

/* the stub's big date: "18" or "22–24" (or "31–3" across two months,
   which the month line then spells out) */
const dayRange = (first, last) => (last ? `${dayOf(first)}–${dayOf(last)}` : `${dayOf(first)}`);

function monthLine(first, last, locale) {
  const month = (session) => formatDateKey(session.date, locale, { month: "short" });
  if (sameMonth(first, last)) return formatDateKey(first.date, locale, { month: "short", year: "numeric" });
  return `${month(first)} – ${month(last)} ${last.date.slice(0, 4)}`;
}

/* one class on the calendar, set like a flyer pinned up in the shop: a
   sheet of menu paper with a snapshot, dotted lines like the menu's and a
   stub to tear off. Past classes are on cream paper, like an archive. */
const ClassCard = memo(function ClassCard({ workshop, className = "" }) {
  const { locale, dict, localize } = useLocale();
  const { navigateWithTransition } = useViewTransition();
  const t = dict.workshops;
  const href = `/workshops/${workshop.slug}`;
  const isPast = workshop.phase === "past";
  const hasRecap = Boolean(
    workshop.recap?.images?.length || localized(workshop.recap?.text, locale),
  );
  const badge = isPast && workshop.status !== "cancelled" ? { label: t.held, tone: "held" } : classBadge(workshop, t);
  const summary = localized(workshop.summary, locale);
  const sessions = workshop.sessions ?? [];
  const first = sessions[0];
  const hours = sharedHours(sessions);
  const when = [
    sessions.length > 1 ? fillTemplate(t.sessionsOther, { count: sessions.length }) : "",
    hours,
  ]
    .filter(Boolean)
    .join(" · ");
  const lastDay = sessions.length > 1 ? sessions.at(-1) : null;
  const showFee = workshop.price > 0 && !isPast;
  const showSeats = !isPast && workshop.capacity > 0 && workshop.status !== "cancelled";
  const open = (e) => {
    e.preventDefault();
    navigateWithTransition(href);
  };

  return (
    <article
      className={`class-card ${isPast ? "is-past" : ""} ${workshop.status === "cancelled" ? "is-cancelled" : ""} ${className}`}
    >
      <a href={localize(href)} className="class-card-sheet" onClick={open}>
        <header className="class-card-head">
          <span>{dict.classTicket.label}</span>
          <span>Pizza Piatto</span>
        </header>

        <div className="class-card-photo">
          <Photo src={coverOf(workshop)} sizes="(max-width: 700px) 90vw, 30vw" />
        </div>
        {badge && <span className={`class-card-stamp is-${badge.tone}`}>{badge.label}</span>}

        <h5 className="class-card-title">{localized(workshop.title, locale)}</h5>
        {summary && <p className="class-card-summary">{summary}</p>}

        <dl className="class-card-facts">
          {when && (
            <div>
              <dt>{t.schedule}</dt>
              <dd>{when}</dd>
            </div>
          )}
          {showFee && (
            <div>
              <dt>{t.fee}</dt>
              <dd>{fillTemplate(t.perSeat, { price: formatMoney(workshop.price, locale) })}</dd>
            </div>
          )}
          {showSeats && (
            <div>
              <dt>{t.seats}</dt>
              <dd>
                {fillTemplate(t.seatsOf, { left: workshop.seatsLeft, capacity: workshop.capacity })}
              </dd>
            </div>
          )}
        </dl>

        <footer className="class-card-stub">
          {first && (
            <p className="class-card-date">
              <span className="class-card-day">{dayRange(first, lastDay)}</span>
              <span className="class-card-month">{monthLine(first, lastDay, locale)}</span>
            </p>
          )}
          <span className="class-card-cta">
            {isPast && hasRecap ? t.recap : workshop.bookable ? t.book : t.details}
            <span aria-hidden="true"> →</span>
          </span>
        </footer>
      </a>
    </article>
  );
});
