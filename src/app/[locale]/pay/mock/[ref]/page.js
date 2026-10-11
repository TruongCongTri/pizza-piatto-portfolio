import { notFound } from "next/navigation";

import MockCheckout from "@/components/Payments/MockCheckout";
import { buildPageMetadata } from "@/i18n/metadata";
import { mockCheckoutEnabled } from "@/lib/server/payments/providers";

export async function generateMetadata({ params }) {
  const { locale, ref } = await params;
  return {
    ...buildPageMetadata(locale, { page: "mockPay", path: `/pay/mock/${ref}` }),
    robots: { index: false, follow: false },
  };
}

/* the built-in test checkout (development and demo sites only) */
export default async function MockPayPage({ params }) {
  if (!mockCheckoutEnabled()) notFound();
  const { ref } = await params;
  return <MockCheckout reference={ref} />;
}
