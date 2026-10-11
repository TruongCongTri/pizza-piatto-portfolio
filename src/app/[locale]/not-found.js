"use client";

import Button from "@/components/Button/Button";
import StatusPage from "@/components/StatusPage/StatusPage";
import { useLocale } from "@/i18n/LocaleProvider";

export default function NotFound() {
  const { dict } = useLocale();
  const t = dict.errors.notFound;

  return (
    <StatusPage code={t.code} title={t.title} message={t.message}>
      <Button href="/">{t.home}</Button>
    </StatusPage>
  );
}
