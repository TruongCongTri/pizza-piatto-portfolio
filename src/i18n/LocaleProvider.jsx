"use client";

import { createContext, useContext } from "react";

import { defaultLocale, localizeHref } from "./config";
import { getDictionary } from "./dictionaries";

const LocaleContext = createContext({
  locale: defaultLocale,
  dict: getDictionary(defaultLocale),
});

export function LocaleProvider({ locale, children }) {
  return (
    <LocaleContext.Provider value={{ locale, dict: getDictionary(locale) }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const { locale, dict } = useContext(LocaleContext);
  const localize = (href) => localizeHref(href, locale);
  return { locale, dict, localize };
}
