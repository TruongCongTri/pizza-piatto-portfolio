import "server-only";

import { createHmac, randomInt } from "node:crypto";

import { safeEqual } from "../session";

/* PayOS (payos.vn): VietQR bank-transfer checkout, a good fit for a small
   Vietnamese shop. Follows the PayOS API v2 and signs exactly as the
   official SDK (@payos/node) does: requests over five fixed fields,
   responses and webhooks over every `data` field sorted by name. Refunds
   are bank transfers the shop makes itself, so they are tracked by hand. */

const API = "https://api-merchant.payos.vn";
const { PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY } = process.env;

export const payosConfigured = Boolean(PAYOS_CLIENT_ID && PAYOS_API_KEY && PAYOS_CHECKSUM_KEY);

const hmac = (text) => createHmac("sha256", PAYOS_CHECKSUM_KEY).update(text).digest("hex");

const sortKeys = (object) =>
  Object.fromEntries(Object.keys(object).sort().map((key) => [key, object[key]]));

/* as the SDK's createSignatureFromObj: sorted key=value pairs, undefined
   left out, null as "", arrays as JSON of key-sorted objects */
function signData(data) {
  const sorted = sortKeys(data);
  const query = Object.keys(sorted)
    .filter((key) => sorted[key] !== undefined)
    .map((key) => {
      let value = sorted[key];
      if (Array.isArray(value)) value = JSON.stringify(value.map(sortKeys));
      if ([null, undefined, "undefined", "null"].includes(value)) value = "";
      return `${key}=${value}`;
    })
    .join("&");
  return hmac(query);
}

/* `verify`: check the response's signature, as the SDK does for a new
   payment link (the checkout URL the student is sent to) */
async function call(path, init = {}, { verify = false } = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "x-client-id": PAYOS_CLIENT_ID,
      "x-api-key": PAYOS_API_KEY,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const json = await response.json().catch(() => ({}));
  if (json.code !== "00" || !json.data) {
    throw new Error(`PayOS ${path} failed: ${json.code ?? response.status} ${json.desc ?? ""}`);
  }
  if (verify && !(json.signature && safeEqual(json.signature, signData(json.data)))) {
    throw new Error(`PayOS ${path}: response signature does not match`);
  }
  return json.data;
}

function statusOf(data, amount) {
  const paid = Number(data.amountPaid ?? 0);
  if (paid >= amount) return "succeeded";
  /* part of the money is in: wait for the rest */
  if (paid > 0) return "processing";
  switch (data.status) {
    case "PAID":
      return "succeeded";
    case "PROCESSING":
      return "processing";
    case "CANCELLED":
      return "canceled";
    case "EXPIRED":
      return "expired";
    case "FAILED":
      return "failed";
    default:
      /* PENDING */
      return "requires_payment";
  }
}

export const payosProvider = {
  name: "payos",

  async createPayment({ payment, description, returnUrl, cancelUrl, expiresAt, buyer, item }) {
    /* PayOS wants a unique whole number per link */
    const orderCode = Math.floor(Date.now() / 1000) * 1000 + randomInt(1000);
    const request = {
      orderCode,
      amount: payment.amount,
      /* the bank transfer note: at most 9 characters on unlinked accounts */
      description: description.slice(0, 9),
      cancelUrl,
      returnUrl,
    };
    const data = await call("/v2/payment-requests", {
      method: "POST",
      body: JSON.stringify({
        ...request,
        expiredAt: Math.floor(expiresAt / 1000),
        buyerName: buyer.name || undefined,
        buyerEmail: buyer.email || undefined,
        buyerPhone: buyer.phone || undefined,
        items: [item],
        signature: hmac(
          `amount=${request.amount}&cancelUrl=${cancelUrl}&description=${request.description}&orderCode=${orderCode}&returnUrl=${returnUrl}`,
        ),
      }),
    }, { verify: true });
    return { providerRef: String(orderCode), checkoutUrl: data.checkoutUrl };
  },

  async fetchPayment(payment) {
    const data = await call(`/v2/payment-requests/${payment.providerRef}`);
    return { status: statusOf(data, payment.amount), amountPaid: Number(data.amountPaid ?? 0) };
  },

  async cancelPayment(payment, reason = "Seat released") {
    await call(`/v2/payment-requests/${payment.providerRef}/cancel`, {
      method: "POST",
      body: JSON.stringify({ cancellationReason: reason }),
    });
  },

  /* PayOS posts one webhook per successful transfer; null when unsigned
     or forged. Its "confirm webhook" test sends sample data, which matches
     no payment and is simply acknowledged. */
  verifyWebhook(raw) {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!body?.data || !body.signature) return null;
    if (!safeEqual(body.signature, signData(body.data))) return null;
    if (body.code !== "00" || body.data.code !== "00") return [];
    return [
      {
        eventId: `payos:${body.data.orderCode}:${body.data.reference}`,
        providerRef: String(body.data.orderCode),
        status: "succeeded",
        amount: Number(body.data.amount),
      },
    ];
  },

  /* bank transfers are refunded by the shop, outside PayOS */
  async refund() {
    return { status: "refund_pending", manual: true };
  },
};
