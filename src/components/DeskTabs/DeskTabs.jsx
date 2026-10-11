"use client";

import TransitionLink from "@/components/TransitionLink/TransitionLink";
import { useLocale } from "@/i18n/LocaleProvider";

const TABS = [
  { key: "tables", href: "/admin" },
  { key: "classes", href: "/admin/workshops" },
  { key: "guests", href: "/admin/guests" },
];

/* switches between the staff desks, with the site's page transition */
export default function DeskTabs({ current, className = "" }) {
  const { dict, localize } = useLocale();
  const t = dict.classDesk.tabs;
  return (
    <nav className={`desk-tabs ${className}`} aria-label={dict.admin.eyebrow} data-lenis-prevent-touch>
      {TABS.map((tab) => (
        <TransitionLink
          key={tab.key}
          href={localize(tab.href)}
          className={`desk-tab ${tab.key === current ? "is-active" : ""}`}
          aria-current={tab.key === current ? "page" : undefined}
        >
          {t[tab.key]}
        </TransitionLink>
      ))}
    </nav>
  );
}
