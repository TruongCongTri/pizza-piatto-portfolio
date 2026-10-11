import { fillTemplate } from "@/i18n/format";
import { formatDateKey } from "@/lib/booking";
import { formatSession } from "@/lib/workshops";

/* the shop's own photo of dough being stretched, for classes without a
   cover of their own */
export const DEFAULT_COVER = "/about/sticky-card-5.jpg";

/* a class's dates on one line: the session itself, or the first and last
   day with the number of sessions */
export function scheduleLine(workshop, locale, t) {
  const sessions = workshop.sessions ?? [];
  if (!sessions.length) return "";
  if (sessions.length === 1) return formatSession(sessions[0], locale);
  const day = (session) =>
    formatDateKey(session.date, locale, { day: "numeric", month: "short" });
  const last = sessions[sessions.length - 1];
  return `${day(sessions[0])} – ${day(last)} ${last.date.slice(0, 4)} · ${fillTemplate(
    t.sessionsOther,
    { count: sessions.length },
  )}`;
}

/* the label in a class's corner: seats left, full, closed, on now or
   cancelled (none once it is over) */
export function classBadge(workshop, t) {
  if (workshop.status === "cancelled") return { label: t.cancelled, tone: "muted" };
  if (workshop.phase === "past") return null;
  if (workshop.phase === "ongoing") return { label: t.ongoing, tone: "live" };
  if (workshop.bookable) {
    return {
      label:
        workshop.seatsLeft === 1
          ? t.seatsLeftOne
          : fillTemplate(t.seatsLeftOther, { count: workshop.seatsLeft }),
      tone: "open",
    };
  }
  return {
    label: workshop.capacity > 0 && workshop.seatsLeft === 0 ? t.full : t.closed,
    tone: "muted",
  };
}

/* a past class shows its first recap photo; otherwise its cover */
export const coverOf = (workshop) =>
  (workshop.phase === "past" && workshop.recap?.images?.[0]?.url) ||
  workshop.cover ||
  DEFAULT_COVER;

/* a random key naming one booking attempt, so a retried request is never
   booked twice (crypto.randomUUID needs https; this works on plain http) */
export function newIdempotencyKey() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
