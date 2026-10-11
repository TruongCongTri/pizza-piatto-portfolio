/* The lifecycle of a paid class booking and its payments, shared by the
   server (which enforces it) and the pages (which show it).

   Payment attempt, modelled on card-processor intents:

     requires_payment ─┬─▶ processing ─┬─▶ succeeded ─▶ refund_pending ─▶ refunded
                       │               └─▶ failed
                       ├─▶ succeeded
                       ├─▶ failed  /  canceled  /  expired

   A provider can still report money after we gave up on a link (a bank
   transfer confirmed late), so failed, canceled and expired may move on to
   succeeded; the booking then decides whether a seat is still there. While
   a payment is processing, its booking's seat hold is extended.
   Every change goes through canMovePayment, so a late or repeated provider
   message can never move a payment backwards.

   Class booking (enrollment):

     pending_payment ─┬─▶ confirmed ─┬─▶ attended
     (seat held)      │              └─▶ refund_pending ─▶ refunded
                      ├─▶ expired    (hold ran out, seat released)
                      ├─▶ cancelled  (given up before paying)
                      └─▶ refund_pending  (paid, but no seat left)

   Money that arrives late reopens an expired booking (confirmed if a seat
   is free, refunded if not); a cancelled one is always refunded.
*/

export const PAYMENT_STATUSES = [
  "requires_payment",
  "processing",
  "succeeded",
  "failed",
  "canceled",
  "expired",
  "refund_pending",
  "refunded",
];

const PAYMENT_MOVES = {
  requires_payment: ["processing", "succeeded", "failed", "canceled", "expired"],
  processing: ["succeeded", "failed"],
  succeeded: ["refund_pending", "refunded"],
  failed: ["succeeded"],
  canceled: ["succeeded"],
  expired: ["succeeded"],
  /* once a refund is decided, a repeated "paid" message can't undo it */
  refund_pending: ["refunded"],
  refunded: [],
};

/* true when `from` may become `to`; staying put is always allowed */
export function canMovePayment(from, to) {
  return from === to || Boolean(PAYMENT_MOVES[from]?.includes(to));
}

export const isPaymentOpen = (status) =>
  status === "requires_payment" || status === "processing";

export const isPaymentPaid = (status) =>
  status === "succeeded" || status === "refund_pending" || status === "refunded";

const ENROLLMENT_MOVES = {
  pending_payment: ["confirmed", "expired", "cancelled", "refund_pending"],
  confirmed: ["attended", "refund_pending"],
  attended: ["confirmed"],
  /* paid after the hold ran out: confirmed if a seat is still free,
     otherwise refunded */
  expired: ["confirmed", "refund_pending"],
  /* paid after it was given up: always refunded */
  cancelled: ["refund_pending"],
  refund_pending: ["refunded"],
  refunded: [],
};

export function canMoveEnrollment(from, to) {
  return from === to || Boolean(ENROLLMENT_MOVES[from]?.includes(to));
}

/* the status a ticket shows, from the booking and its latest payment:
   awaitingPayment | processing | paymentFailed | expired | paid | attended
   | cancelled | refundPending | refunded */
export function ticketStatus(enrollment, payment, now = Date.now()) {
  switch (enrollment.status) {
    case "pending_payment":
      if (Date.parse(enrollment.holdExpiresAt) <= now) return "expired";
      if (payment?.status === "processing") return "processing";
      if (payment && ["failed", "canceled", "expired"].includes(payment.status)) {
        return "paymentFailed";
      }
      return "awaitingPayment";
    case "confirmed":
      return "paid";
    case "attended":
      return "attended";
    case "refund_pending":
      return "refundPending";
    default:
      return enrollment.status;
  }
}

/* "2.500.000 ₫" / "2,500,000 ₫" */
export function formatMoney(amount, locale, currency = "VND") {
  return new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
