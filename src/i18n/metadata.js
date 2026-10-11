import { defaultLocale, locales } from "./config";
import { getDictionary } from "./dictionaries";
import { localizeDiningMenu } from "@/components/DiningMenu/diningMenu-data";
import { RESTAURANT } from "@/lib/restaurant";

const SCHEMA_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/* group weekdays that share the same hours into one specification */
function buildOpeningHours() {
  const groups = new Map();
  RESTAURANT.hours.forEach((hours, weekday) => {
    if (!hours) return;
    const key = hours.join("-");
    if (!groups.has(key)) groups.set(key, { hours, days: [] });
    groups.get(key).days.push(SCHEMA_DAYS[weekday]);
  });

  return [...groups.values()].map(({ hours, days }) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: days,
    opens: hours[0],
    closes: hours[1],
  }));
}

const OG_LOCALES = { en: "en_US", vi: "vi_VN" };
const SHARE_IMAGE = { url: "/icon.jpg", width: 750, height: 750 };

/* absolute origin for canonical/OG URLs: explicit env first, then Vercel's
   production domain, then local dev */
export function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  /* emails and share links would point at localhost on a live site */
  if (process.env.NODE_ENV === "production" && !globalThis.__siteUrlWarned) {
    globalThis.__siteUrlWarned = true;
    console.warn("[site] NEXT_PUBLIC_SITE_URL is not set: links fall back to localhost");
  }
  return "http://localhost:3000";
}

/* "/about" -> { en: "/en/about", vi: "/vi/about", "x-default": "/en/about" } */
export function getLanguageAlternates(path = "") {
  const languages = Object.fromEntries(
    locales.map((locale) => [locale, `/${locale}${path}`]),
  );
  languages["x-default"] = `/${defaultLocale}${path}`;
  return languages;
}

/* per-page metadata; `page` is a key of dict.seo.pages (omit for home) */
export function buildPageMetadata(locale, { page, path = "" } = {}) {
  const { seo } = getDictionary(locale);
  const pageSeo = page ? seo.pages[page] : null;
  const title = pageSeo?.title;
  const description = pageSeo?.description ?? seo.description;
  const socialTitle = title ? `${title} | ${seo.siteName}` : seo.title;
  const url = `/${locale}${path}`;
  const image = { ...SHARE_IMAGE, alt: seo.imageAlt };

  return {
    ...(title && { title }),
    description,
    alternates: {
      canonical: url,
      languages: getLanguageAlternates(path),
    },
    openGraph: {
      type: "website",
      url,
      siteName: seo.siteName,
      title: socialTitle,
      description,
      locale: OG_LOCALES[locale],
      alternateLocale: locales
        .filter((other) => other !== locale)
        .map((other) => OG_LOCALES[other]),
      images: [image],
    },
    twitter: {
      card: "summary",
      title: socialTitle,
      description,
      images: [image],
    },
  };
}

/* site-wide defaults, set once on the root [locale] layout */
export function buildRootMetadata(locale) {
  const { seo } = getDictionary(locale);

  return {
    metadataBase: new URL(getSiteUrl()),
    title: {
      default: seo.title,
      template: `%s | ${seo.siteName}`,
    },
    applicationName: seo.siteName,
    keywords: seo.keywords,
    authors: [
      { name: "Truong Cong Tri", url: "https://truong-cong-tri-portfolio.vercel.app/" },
    ],
    creator: "Truong Cong Tri",
    publisher: seo.siteName,
    category: "restaurant",
    formatDetection: { telephone: false, email: false, address: false },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    },
    ...buildPageMetadata(locale),
  };
}

/* schema.org Restaurant data for rich results */
export function buildRestaurantJsonLd(locale) {
  const { seo } = getDictionary(locale);
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    name: seo.siteName,
    description: seo.description,
    url: `${siteUrl}/${locale}`,
    image: `${siteUrl}${SHARE_IMAGE.url}`,
    logo: `${siteUrl}${SHARE_IMAGE.url}`,
    telephone: RESTAURANT.phoneIntl,
    email: RESTAURANT.email,
    servesCuisine: ["Italian", "Pizza"],
    priceRange: "₫₫",
    acceptsReservations: `${siteUrl}/${locale}/reservation`,
    menu: `${siteUrl}/${locale}/menu`,
    inLanguage: locale,
    address: {
      "@type": "PostalAddress",
      streetAddress: RESTAURANT.address.street,
      addressLocality: RESTAURANT.address.ward,
      addressRegion: RESTAURANT.address.city,
      postalCode: RESTAURANT.address.postalCode,
      addressCountry: RESTAURANT.address.country,
    },
    geo: {
      "@type": "GeoCoordinates",
      ...RESTAURANT.geo,
    },
    hasMap: RESTAURANT.links.googleMaps,
    sameAs: [RESTAURANT.links.facebook, RESTAURANT.links.instagram],
    openingHoursSpecification: buildOpeningHours(),
  };
}

/* the menu as schema.org data (sections, dishes, prices in VND), so
   search engines can show dishes and prices; from the same data as the
   page */
export function buildMenuJsonLd(locale) {
  const dict = getDictionary(locale);
  const siteUrl = getSiteUrl();
  const sections = localizeDiningMenu(dict.diningMenu);
  const amount = (price) => Number(String(price).replace(/[^\d]/g, "")) || undefined;

  return {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: dict.seo.pages.menu?.title ?? dict.seo.siteName,
    url: `${siteUrl}/${locale}/menu`,
    inLanguage: locale,
    hasMenuSection: sections.map((section) => ({
      "@type": "MenuSection",
      name: section.category,
      ...(section.tagline ? { description: section.tagline } : {}),
      hasMenuItem: section.items.map((item) => ({
        "@type": "MenuItem",
        name: item.name,
        ...(item.description ? { description: item.description } : {}),
        ...(item.image ? { image: `${siteUrl}${item.image}` } : {}),
        ...(item.tags?.includes("veg") ? { suitableForDiet: "https://schema.org/VegetarianDiet" } : {}),
        offers: {
          "@type": "Offer",
          price: amount(item.price),
          priceCurrency: "VND",
        },
      })),
    })),
  };
}
