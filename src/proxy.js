import { NextResponse } from "next/server";

import {
  defaultLocale,
  getPathLocale,
  hasLocale,
  locales,
  LOCALE_COOKIE,
} from "@/i18n/config";

/* cookie preference first, then Accept-Language, then default */
function detectLocale(request) {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (hasLocale(cookieLocale)) return cookieLocale;

  const acceptLanguage = request.headers.get("accept-language") ?? "";
  const preferred = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, q = "q=1"] = part.trim().split(";");
      return { tag: tag.toLowerCase(), q: parseFloat(q.split("=")[1]) || 0 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of preferred) {
    const base = tag.split("-")[0];
    if (locales.includes(base)) return base;
  }

  return defaultLocale;
}

export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (getPathLocale(pathname)) return NextResponse.next();

  const locale = detectLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  /* skip Next internals, API routes, generated icons (extension-less URLs)
     and anything that looks like a file */
  matcher: [
    "/((?!api|_next/static|_next/image|icon|apple-icon|.*\\..*).*)",
  ],
};
