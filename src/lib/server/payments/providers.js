import "server-only";

import { mockProvider } from "./mock-provider";
import { payosConfigured, payosProvider } from "./payos-provider";

const PROVIDERS = { mock: mockProvider, payos: payosProvider };

/* who takes payment for new bookings: PAYMENT_PROVIDER when set, else
   PayOS once configured, else the built-in test checkout, which only runs
   in development or where PAYMENT_PROVIDER=mock (a demo site). null means
   paid bookings are switched off. */
export function activeProvider() {
  const choice = process.env.PAYMENT_PROVIDER;
  if (choice === "payos") return payosConfigured ? payosProvider : null;
  if (choice === "mock") return mockProvider;
  if (payosConfigured) return payosProvider;
  return process.env.NODE_ENV !== "production" ? mockProvider : null;
}

/* the provider an existing payment was made with */
export const providerNamed = (name) => PROVIDERS[name] ?? null;

/* the test checkout page and its webhook exist only where it can be used */
export const mockCheckoutEnabled = () =>
  process.env.PAYMENT_PROVIDER === "mock" || process.env.NODE_ENV !== "production";

/* whether a provider's webhook is listened to here */
export function providerEnabled(name) {
  if (name === "mock") return mockCheckoutEnabled();
  if (name === "payos") return payosConfigured;
  return false;
}
