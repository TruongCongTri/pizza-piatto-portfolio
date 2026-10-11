import { getSiteUrl } from "@/i18n/metadata";

export default function robots() {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      /* the staff desks, guests' own bookings and tickets, the test
         checkout and the API */
      disallow: [
        "/api/",
        "/*/admin",
        "/*/reservation/track",
        "/*/workshops/ticket/",
        "/*/pay/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
