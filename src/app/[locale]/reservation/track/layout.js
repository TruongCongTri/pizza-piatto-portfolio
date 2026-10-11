import { buildPageMetadata } from "@/i18n/metadata";

/* server wrapper so the client page gets its own metadata; a guest's own
   bookings have no business in search results */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return {
    ...buildPageMetadata(locale, { page: "track", path: "/reservation/track" }),
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }) {
  return children;
}
