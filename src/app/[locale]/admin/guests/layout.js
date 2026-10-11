import { buildPageMetadata } from "@/i18n/metadata";

/* server wrapper for the guest lookup's metadata: kept out of search engines */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return {
    ...buildPageMetadata(locale, { page: "guestDesk", path: "/admin/guests" }),
    robots: { index: false, follow: false },
  };
}

export default function Layout({ children }) {
  return children;
}
