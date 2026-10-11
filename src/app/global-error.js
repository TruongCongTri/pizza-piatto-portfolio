"use client";

import { useEffect, useState } from "react";

import StatusPage from "@/components/StatusPage/StatusPage";
import { defaultLocale, getPathLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

import "./globals.css";

/* last-resort boundary: replaces the root layout when it (or anything the
   [locale]/error.js boundary cannot handle) throws */
export default function GlobalError({ error, reset }) {
  const [locale, setLocale] = useState(defaultLocale);
  const t = getDictionary(locale).errors.error;

  useEffect(() => {
    console.error(error);
    setLocale(getPathLocale(window.location.pathname) ?? defaultLocale);
  }, [error]);

  return (
    <html lang={locale}>
      <body>
        <StatusPage code={t.code} title={t.title} message={t.message}>
          <button
            className="status-page-link hover-line"
            onClick={() => reset()}
          >
            {t.retry}
          </button>
          <a className="status-page-link hover-line" href={`/${locale}`}>
            {t.home}
          </a>
        </StatusPage>
      </body>
    </html>
  );
}
