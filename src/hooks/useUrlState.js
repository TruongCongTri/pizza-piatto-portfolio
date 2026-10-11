"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/* state mirrored in the page's query string, for filters that should
   survive a reload and come back with the back button:

     const [filters, setFilters] = useUrlState(
       { query: "", view: "today", sort: "asc" },
       { names: { query: "q" }, options: { view: VIEWS, sort: ["asc", "desc"] } },
     );

   Read from the URL once mounted and on back/forward; written back with
   replaceState (no history entry per keystroke). A value equal to its
   default is left out of the URL, and one outside `options` is ignored.
   Query parameters the state doesn't own are kept as they are.

   With `remember` (a name for the page), the last values are also kept
   for the browser session: coming back to the page by a link without any
   of these parameters picks up where it was left, instead of the
   defaults. */
export function useUrlState(defaults, { names = {}, options = {}, remember } = {}) {
  const [state, setState] = useState(defaults);
  const configRef = useRef({ defaults, names, options, remember });
  configRef.current = { defaults, names, options, remember };
  /* nothing is written until the state read from the URL is in place:
     the first render's defaults would wipe a URL not read yet */
  const readStateRef = useRef(null);
  const hasReadRef = useRef(false);

  const fromUrl = useCallback(({ restore = false } = {}) => {
    const { defaults: base, names: keys, options: allowed, remember: page } = configRef.current;
    let params = new URLSearchParams(window.location.search);
    const owns = Object.keys(base).some((key) => params.has(keys[key] ?? key));
    if (restore && page && !owns) {
      const saved = readSaved(page);
      if (saved !== null) params = new URLSearchParams(saved);
    }
    const next = { ...base };
    for (const key of Object.keys(base)) {
      const value = params.get(keys[key] ?? key);
      if (value === null) continue;
      if (allowed[key] && !allowed[key].includes(value)) continue;
      next[key] = value;
    }
    return next;
  }, []);

  useEffect(() => {
    const initial = fromUrl({ restore: true });
    readStateRef.current = initial;
    setState(initial);
    const handlePop = () => setState(fromUrl());
    window.addEventListener("popstate", handlePop);
    return () => window.removeEventListener("popstate", handlePop);
  }, [fromUrl]);

  useEffect(() => {
    if (!hasReadRef.current) {
      if (state !== readStateRef.current) return;
      hasReadRef.current = true;
    }
    const { defaults: base, names: keys } = configRef.current;
    const url = new URL(window.location.href);
    for (const key of Object.keys(base)) {
      const name = keys[key] ?? key;
      const value = state[key];
      if (value === base[key] || value === "" || value == null) url.searchParams.delete(name);
      else url.searchParams.set(name, String(value));
    }
    if (url.href !== window.location.href) window.history.replaceState(null, "", url);
    if (configRef.current.remember) {
      const own = new URLSearchParams();
      for (const key of Object.keys(base)) {
        const name = keys[key] ?? key;
        if (url.searchParams.has(name)) own.set(name, url.searchParams.get(name));
      }
      writeSaved(configRef.current.remember, own.toString());
    }
  }, [state]);

  return [state, setState];
}

const storageKey = (page) => `pp-filters:${page}`;

/* session storage can be missing or blocked: then nothing is remembered */
function readSaved(page) {
  try {
    return window.sessionStorage.getItem(storageKey(page));
  } catch {
    return null;
  }
}

function writeSaved(page, query) {
  try {
    window.sessionStorage.setItem(storageKey(page), query);
  } catch {
    /* not remembered this time */
  }
}
