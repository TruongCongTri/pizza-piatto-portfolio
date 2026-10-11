import { defaultLocale, locales } from "@/i18n/config";
import { getLanguageAlternates, getSiteUrl } from "@/i18n/metadata";
import { workshopsDb } from "@/lib/server/collections";
import { workshopPhase } from "@/lib/workshops";

const ROUTES = [
  { path: "", changeFrequency: "monthly", priority: 1 },
  { path: "/menu", changeFrequency: "weekly", priority: 0.9 },
  { path: "/reservation", changeFrequency: "monthly", priority: 0.8 },
  { path: "/workshops", changeFrequency: "weekly", priority: 0.7 },
  { path: "/about", changeFrequency: "yearly", priority: 0.6 },
];

/* read when asked, so a newly published class is listed */
export const dynamic = "force-dynamic";

/* one entry per route and locale, each listing its language alternates,
   then every published class (its page in both languages) */
export default async function sitemap() {
  const siteUrl = getSiteUrl();
  const absolute = (languages) =>
    Object.fromEntries(
      Object.entries(languages)
        .filter(([key]) => key !== "x-default")
        .map(([key, href]) => [key, `${siteUrl}${href}`]),
    );
  const entry = ({ path, changeFrequency, priority, lastModified = new Date(), images }) =>
    locales.map((locale) => ({
      url: `${siteUrl}/${locale}${path}`,
      lastModified,
      changeFrequency,
      priority: locale === defaultLocale ? priority : priority * 0.9,
      alternates: { languages: absolute(getLanguageAlternates(path)) },
      ...(images?.length ? { images } : {}),
    }));

  /* the store being out of reach leaves the classes out, not the map;
     sample classes are left out too */
  const now = Date.now();
  const classes = (await workshopsDb.list().catch(() => [])).filter(
    (workshop) => workshop.status !== "draft" && workshop.sessions?.length && !workshop.demo,
  );

  return [
    ...ROUTES.flatMap((route) => entry(route)),
    ...classes.flatMap((workshop) =>
      entry({
        path: `/workshops/${workshop.slug}`,
        changeFrequency: workshopPhase(workshop, now) === "past" ? "yearly" : "weekly",
        priority: workshopPhase(workshop, now) === "past" ? 0.4 : 0.6,
        lastModified: new Date(workshop.updatedAt ?? workshop.createdAt ?? Date.now()),
        images: [workshop.cover, workshop.recap?.images?.[0]?.url]
          .filter(Boolean)
          .map((src) => (src.startsWith("http") ? src : `${siteUrl}${src}`)),
      }),
    ),
  ];
}
