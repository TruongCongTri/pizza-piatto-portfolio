"use client";

import { useEffect } from "react";

import Button from "@/components/Button/Button";
import StatusPage from "@/components/StatusPage/StatusPage";
import { useLocale } from "@/i18n/LocaleProvider";

/* catches runtime errors in any page under /[locale], keeping nav + footer */
export default function Error({ error, reset }) {
  const { dict } = useLocale();
  const t = dict.errors.error;

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatusPage code={t.code} title={t.title} message={t.message}>
      <button className="status-page-link hover-line" onClick={() => reset()}>
        {t.retry}
      </button>
      <Button href="/">{t.home}</Button>
    </StatusPage>
  );
}
