export const locales = ["en", "vi"];
export const defaultLocale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export function hasLocale(value) {
  return locales.includes(value);
}

/* first path segment if it is a supported locale, otherwise null */
export function getPathLocale(pathname = "") {
  const segment = pathname.split("/")[1];
  return hasLocale(segment) ? segment : null;
}

/* prefix an internal href with the locale, e.g. "/menu" -> "/vi/menu" */
export function localizeHref(href, locale) {
  if (!href || !href.startsWith("/") || href.startsWith("//")) return href;
  if (getPathLocale(href)) return href;
  return href === "/" ? `/${locale}` : `/${locale}${href}`;
}

/* swap the locale segment of a pathname, keeping the rest of the route */
export function switchLocaleInPath(pathname, locale) {
  const current = getPathLocale(pathname);
  if (!current) return localizeHref(pathname, locale);
  return `/${locale}${pathname.slice(current.length + 1)}`;
}
