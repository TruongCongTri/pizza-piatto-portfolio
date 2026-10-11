"use client";

import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate } from "@/i18n/format";
import { formatDateKey, getRestaurantClock, getVisitState } from "@/lib/booking";

import "./Reservations.css";

/* a booking as a ticket on the golden paper of the printed menu: date on
   the stub, details past the perforation. Once the guest is checked in the
   ticket is torn at the perforation, like a used one; past, cancelled and
   missed bookings are crossed out. `onCancel` adds a cancel link while the
   guest can still cancel. */
export default function ReservationTicket({ reservation, clock, onCancel, className = "" }) {
  const { locale, dict } = useLocale();
  const t = dict.ticket;
  const now = clock ?? getRestaurantClock();
  const state = getVisitState(reservation, now);
  const { date } = reservation;
  const isPast = date < now.dateKey;
  const isInactive =
    isPast || state.display === "cancelled" || state.display === "noShow";
  const stamp =
    state.display === "cancelled"
      ? t.cancelled
      : state.display === "arrived"
        ? t.arrived
        : state.display === "noShow"
          ? t.missed
          : isPast
            ? t.past
            : date === now.dateKey
              ? t.today
              : null;

  return (
    <article
      className={`ticket ${isInactive ? "is-inactive" : ""} ${state.display === "arrived" ? "is-torn" : ""} ${stamp ? "has-stamp" : ""} ${className}`}
    >
      <div className="ticket-stub">
        <span className="ticket-small">
          {formatDateKey(date, locale, { weekday: "short" })}
        </span>
        <span className="ticket-day ticket-crossable">{Number(date.slice(8))}</span>
        <span className="ticket-small">
          {formatDateKey(date, locale, { month: "short" })}
        </span>
      </div>

      <div className="ticket-main">
        <div className="ticket-top">
          <span>{t.label}</span>
          <span>{fillTemplate(t.number, { code: reservation.id })}</span>
        </div>
        <p className="ticket-name ticket-crossable">{reservation.name}</p>
        <div className="ticket-details">
          <div>
            <span className="ticket-label">{t.time}</span>
            <span className="ticket-value ticket-crossable">{reservation.time}</span>
          </div>
          <div>
            <span className="ticket-label">{t.guests}</span>
            <span className="ticket-value ticket-crossable">
              {String(reservation.guests).padStart(2, "0")}
            </span>
          </div>
        </div>
        {reservation.notes && (
          <p className="ticket-notes">
            <span className="ticket-label">{t.notes}</span>
            {reservation.notes}
          </p>
        )}
        {onCancel && state.canGuestCancel && (
          <button
            type="button"
            className="ticket-cancel hover-line"
            onClick={() => onCancel(reservation)}
          >
            {t.cancel}
          </button>
        )}
      </div>

      {stamp && <span className="ticket-stamp">{stamp}</span>}
    </article>
  );
}
