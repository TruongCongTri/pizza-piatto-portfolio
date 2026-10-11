import "server-only";

import { randomBytes } from "node:crypto";

import { collection } from "../collections";
import { safeEqual, signValue } from "../session";

/* The built-in test checkout, standing in for a real payment provider in
   development and on demo sites. It behaves like one: it hosts its own
   checkout page (/[locale]/pay/mock/[ref]), keeps its own record of every
   payment link, and tells the shop's server what happened through signed
   webhooks sent separately from the shopper's redirect. On request it
   confirms late, delivers a webhook twice, or takes money on a link the
   shop already closed, so the shop's handling of each case can be tried. */

const linksDb = collection("mockpay");
const SLOW_CONFIRM_MS = 15_000;

const sign = (body) => signValue(`mock-webhook:${body}`);
const now = () => new Date().toISOString();

/* the provider's own status, mapped onto ours */
function statusOf(link) {
  switch (link.status) {
    case "PAID":
      return "succeeded";
    case "PROCESSING":
      return "processing";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "canceled";
    case "EXPIRED":
      return "expired";
    default:
      return Date.parse(link.expiresAt) <= Date.now() ? "expired" : "requires_payment";
  }
}

async function deliver(origin, event) {
  const body = JSON.stringify(event);
  const response = await fetch(`${origin}/api/payments/webhook/mock`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-mock-signature": sign(body) },
    body,
  });
  if (!response.ok) {
    console.error(`[mockpay] webhook ${event.id} answered ${response.status}`);
  }
}

export const mockProvider = {
  name: "mock",

  async createPayment({ payment, description, returnUrl, cancelUrl, expiresAt, locale, siteUrl }) {
    const ref = `mock_${randomBytes(9).toString("base64url")}`;
    await linksDb.insert({
      id: ref,
      merchantPaymentId: payment.id,
      amount: payment.amount,
      description,
      status: "PENDING",
      returnUrl,
      cancelUrl,
      expiresAt: new Date(expiresAt).toISOString(),
      createdAt: now(),
    });
    return { providerRef: ref, checkoutUrl: `${siteUrl}/${locale}/pay/mock/${ref}` };
  },

  async fetchPayment(payment) {
    const link = await linksDb.get(payment.providerRef);
    if (!link) return { status: "failed" };
    return { status: statusOf(link), amountPaid: link.amountPaid ?? 0 };
  },

  /* the shop closes a link it no longer wants paid */
  async cancelPayment(payment) {
    const link = await linksDb.get(payment.providerRef);
    if (link && link.status === "PENDING") {
      await linksDb.put({ ...link, status: "CANCELLED", cancelledAt: now() });
    }
  },

  /* events from a raw webhook, or null when the signature is wrong */
  verifyWebhook(raw, headers) {
    const signature = headers.get("x-mock-signature");
    if (!signature || !safeEqual(signature, sign(raw))) return null;
    const event = JSON.parse(raw);
    return [
      {
        eventId: event.id,
        providerRef: event.ref,
        status: event.status,
        amount: event.amount,
      },
    ];
  },

  /* the test bank sends refunds straight back */
  async refund() {
    return { status: "refunded", refundRef: `mockrf_${randomBytes(6).toString("hex")}` };
  },
};

/* ---------- the test checkout page's side ---------- */

export const getMockLink = (ref) => linksDb.get(ref);

/* what the shopper did on the test checkout: "pay" | "fail" | "cancel".
   Options: `slow` (the bank confirms 15 s later, via a "processing" step),
   `twice` (the webhook is delivered twice). Paying a link the shop closed
   simulates a bank transfer that arrives anyway. Returns where to send the
   shopper next. */
export async function actOnMockLink(ref, action, { slow = false, twice = false, origin, later }) {
  const link = await linksDb.get(ref);
  if (!link) return null;

  const status = { pay: slow ? "PROCESSING" : "PAID", fail: "FAILED", cancel: "CANCELLED" }[action];
  if (!status) return null;
  /* a link takes money once; the shopper is just sent back */
  if (link.status === "PAID" || link.status === "PROCESSING") {
    return { redirect: link.returnUrl };
  }
  await linksDb.put({
    ...link,
    status,
    ...(status === "PAID" && { amountPaid: link.amount, paidAt: now() }),
  });

  const event = (eventStatus) => ({
    id: `evt_${randomBytes(9).toString("base64url")}`,
    ref,
    status: eventStatus,
    amount: link.amount,
    createdAt: now(),
  });
  const ourStatus = { PAID: "succeeded", PROCESSING: "processing", FAILED: "failed", CANCELLED: "canceled" }[status];
  const first = event(ourStatus);

  /* webhooks go out after the shopper has been redirected, like a real
     provider's would */
  later(async () => {
    await deliver(origin, first);
    if (twice) await deliver(origin, first);
    if (slow && action === "pay") {
      await new Promise((resolve) => setTimeout(resolve, SLOW_CONFIRM_MS));
      const current = await linksDb.get(ref);
      await linksDb.put({ ...current, status: "PAID", amountPaid: link.amount, paidAt: now() });
      await deliver(origin, event("succeeded"));
    }
  });

  return { redirect: action === "cancel" ? link.cancelUrl : link.returnUrl };
}
