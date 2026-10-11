import { notFound } from "next/navigation";

/* any unmatched route under /[locale] renders [locale]/not-found.js */
export default function CatchAll() {
  notFound();
}
