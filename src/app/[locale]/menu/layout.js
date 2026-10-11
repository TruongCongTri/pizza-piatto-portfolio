import { buildMenuJsonLd, buildPageMetadata } from "@/i18n/metadata";

/* server wrapper so the client page gets its own SEO metadata */
export async function generateMetadata({ params }) {
  const { locale } = await params;
  return buildPageMetadata(locale, { page: "menu", path: "/menu" });
}

/* the menu also goes out as structured data (dishes and prices) */
export default async function Layout({ children, params }) {
  const { locale } = await params;
  const jsonLd = JSON.stringify(buildMenuJsonLd(locale)).replace(/</g, "\\u003c");
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      {children}
    </>
  );
}
