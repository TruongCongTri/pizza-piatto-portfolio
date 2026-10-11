"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate } from "@/i18n/format";
import { formatDateKey } from "@/lib/booking";
import { formatMoney } from "@/lib/payments";
import { formatSession, localized } from "@/lib/workshops";

import "@/components/Reservations/Reservations.css";
import "./Workshops.css";

/* statuses whose ticket is no longer good for the class: faded and crossed
   out, like a past table booking */
const INACTIVE = new Set(["expired", "cancelled", "refundPending", "refunded"]);

/* a class booking as a ticket on the same golden paper as table bookings:
   first day on the stub, the class and the student past the perforation,
   and a stamp with where the payment stands. Torn once the student has
   been checked in. */
export default function ClassTicket({ ticket }) {
  const { locale, dict } = useLocale();
  const t = dict.classTicket;
  const workshop = ticket.workshop;
  const first = workshop.sessions[0];

  return (
    <article
      className={`ticket class-ticket has-stamp is-${ticket.status} ${INACTIVE.has(ticket.status) ? "is-inactive" : ""} ${ticket.status === "attended" ? "is-torn" : ""}`}
    >
      <div className="ticket-stub">
        {first && (
          <>
            <span className="ticket-small">
              {formatDateKey(first.date, locale, { weekday: "short" })}
            </span>
            <span className="ticket-day ticket-crossable">{Number(first.date.slice(8))}</span>
            <span className="ticket-small">
              {formatDateKey(first.date, locale, { month: "short" })}
            </span>
          </>
        )}
      </div>

      <div className="ticket-main">
        <div className="ticket-top">
          <span>{t.label}</span>
          <span>{fillTemplate(t.number, { code: ticket.id })}</span>
        </div>
        <p className="ticket-name ticket-crossable">{localized(workshop.title, locale)}</p>
        <p className="class-ticket-student">{ticket.name}</p>
        <div className="class-ticket-when">
          <span className="ticket-label">{t.when}</span>
          {workshop.sessions.map((session) => (
            <span className="ticket-crossable" key={`${session.date}-${session.start}`}>
              {formatSession(session, locale)}
            </span>
          ))}
        </div>
        <div className="ticket-details">
          <div>
            <span className="ticket-label">{t.seats}</span>
            <span className="ticket-value ticket-crossable">
              {String(ticket.seats).padStart(2, "0")}
            </span>
          </div>
          <div>
            <span className="ticket-label">{t.total}</span>
            <span className="ticket-value ticket-crossable">
              {formatMoney(ticket.amount, locale, ticket.currency)}
            </span>
          </div>
        </div>
      </div>

      <span className="ticket-stamp">{t.stamps[ticket.status]}</span>
    </article>
  );
}
