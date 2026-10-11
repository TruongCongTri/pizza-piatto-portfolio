import { cache } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { DEFAULT_COVER } from "@/components/Workshops/class-view";
import WorkshopDetail from "@/components/Workshops/WorkshopDetail";
import { getDictionary } from "@/i18n/dictionaries";
import { buildPageMetadata, getSiteUrl } from "@/i18n/metadata";
import { RESTAURANT } from "@/lib/restaurant";
import { getPublicWorkshop } from "@/lib/server/classes";
import { activeProvider } from "@/lib/server/payments/providers";
import {
  bookingClosesAt,
  hasTimes,
  localized,
  workshopEnd,
  workshopStart,
} from "@/lib/workshops";

/* the page and its metadata read the class once per request */
const loadWorkshop = cache((slug) => getPublicWorkshop(slug));

const absolute = (url) => (url.startsWith("/") ? `${getSiteUrl()}${url}` : url);

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  const base = buildPageMetadata(locale, { page: "workshops", path: `/workshops/${slug}` });
  const workshop = await loadWorkshop(slug);
  if (!workshop) return { ...base, robots: { index: false, follow: false } };

  const title = localized(workshop.title, locale);
  const description = localized(workshop.summary, locale) || base.description;
  const socialTitle = `${title} | ${getDictionary(locale).seo.siteName}`;
  const images = workshop.cover ? [{ url: workshop.cover, alt: title }] : base.openGraph.images;
  return {
    ...base,
    title,
    description,
    openGraph: { ...base.openGraph, title: socialTitle, description, images },
    twitter: { ...base.twitter, title: socialTitle, description, images },
  };
}

/* schema.org Event, so search engines can show the class's date and price */
function eventJsonLd(workshop, locale) {
  const siteUrl = getSiteUrl();
  const { address } = RESTAURANT;
  const place = localized(workshop.location, locale);
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: localized(workshop.title, locale),
    description: localized(workshop.summary, locale) || undefined,
    url: `${siteUrl}/${locale}/workshops/${workshop.slug}`,
    /* plain dates when the class's hours aren't known */
    startDate: workshop.sessions.every(hasTimes)
      ? new Date(workshopStart(workshop)).toISOString()
      : workshop.sessions[0].date,
    endDate: workshop.sessions.every(hasTimes)
      ? new Date(workshopEnd(workshop)).toISOString()
      : workshop.sessions.at(-1).date,
    eventStatus:
      workshop.status === "cancelled"
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    image: [absolute(workshop.cover || DEFAULT_COVER)],
    location: {
      "@type": "Place",
      name: place || RESTAURANT.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: place || address.street,
        addressLocality: address.ward,
        addressRegion: address.city,
        postalCode: address.postalCode,
        addressCountry: address.country,
      },
    },
    organizer: { "@type": "Organization", name: RESTAURANT.name, url: `${siteUrl}/${locale}` },
    ...(workshop.instructor && {
      performer: { "@type": "Person", name: workshop.instructor },
    }),
    ...(workshop.price > 0 && {
      offers: {
        "@type": "Offer",
        url: `${siteUrl}/${locale}/workshops/${workshop.slug}`,
        price: workshop.price,
        priceCurrency: workshop.currency,
        availability: workshop.bookable
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
        validThrough: new Date(bookingClosesAt(workshop)).toISOString(),
      },
    }),
  };
}

export default async function WorkshopPage({ params }) {
  await connection();
  const { locale, slug } = await params;
  const workshop = await loadWorkshop(slug);
  if (!workshop) notFound();

  const jsonLd = workshop.sessions.length
    ? JSON.stringify(eventJsonLd(workshop, locale)).replace(/</g, "\\u003c")
    : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      )}
      <WorkshopDetail workshop={workshop} provider={activeProvider()?.name ?? null} />
    </>
  );
}
