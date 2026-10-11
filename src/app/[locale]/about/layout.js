import { buildPageMetadata } from "@/i18n/metadata";

/* server wrapper so the client page gets its own SEO metadata */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return buildPageMetadata(locale, { page: "about", path: "/about" });
}

export default function Layout({ children }) {
  return children;
}
