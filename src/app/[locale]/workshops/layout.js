import { buildPageMetadata } from "@/i18n/metadata";

/* server wrapper so the class pages get their own SEO metadata */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return buildPageMetadata(locale, { page: "workshops", path: "/workshops" });
}

export default function Layout({ children }) {
  return children;
}
