import en from "./en.json";
import vi from "./vi.json";

import { defaultLocale } from "../config";

const dictionaries = { en, vi };

export function getDictionary(locale) {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}
