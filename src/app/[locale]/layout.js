import {
  Be_Vietnam_Pro,
  Fraunces,
  IBM_Plex_Mono,
  JetBrains_Mono,
} from "next/font/google";
import { notFound } from "next/navigation";

import ClientLayout from "@/client-layout";
import { hasLocale, locales } from "@/i18n/config";
import { buildRestaurantJsonLd, buildRootMetadata } from "@/i18n/metadata";
import { getGoogleReviews } from "@/lib/google-reviews";

import "../globals.css";

/* Vietnamese-capable fonts; the CSS variable names are kept for existing styles */
const hostGrotesk = Be_Vietnam_Pro({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["300", "400", "500", "600", "700", "800"],
  /* italic for the printed-menu ingredient lines */
  style: ["normal", "italic"],
  variable: "--font-host-grotesk",
});

const dmMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500"],
  variable: "--font-dm-mono",
});

const display = Fraunces({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: "variable",
  variable: "--font-display",
});

/* typewriter face of the printed menu (closest match with Vietnamese) */
const typewriter = IBM_Plex_Mono({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["500", "600"],
  variable: "--font-typewriter",
});

export const viewport = {
  themeColor: "#1c2541",
  colorScheme: "dark",
};

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }) {
  const { locale } = await params;
  return buildRootMetadata(hasLocale(locale) ? locale : locales[0]);
}

export default async function RootLayout({ children, params }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();

  /* escape "<" so the JSON can never close the script tag */
  const jsonLd = JSON.stringify(buildRestaurantJsonLd(locale)).replace(
    /</g,
    "\\u003c",
  );
  const googleReviews = await getGoogleReviews(locale);

  return (
    <html lang={locale}>
      <body
        className={`${hostGrotesk.variable} ${dmMono.variable} ${display.variable} ${typewriter.variable}`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLd }}
        />
        <ClientLayout locale={locale} googleReviews={googleReviews}>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
