"use client";

import { useEffect, useRef } from "react";

/* keeps a staff desk current without asking on a timer: `onChange` runs
   when the server says `topic` ("reservations" | "classes", or several)
   changed, when the live line comes back after dropping (anything may
   have happened meanwhile) and when the tab is looked at again. The line
   is one server-sent event stream (/api/admin/events); the browser
   reconnects it by itself. */
export function useDeskEvents(topics, onChange, enabled = true) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const key = [].concat(topics).join(",");

  useEffect(() => {
    if (!enabled) return;
    const wanted = new Set(key.split(","));
    const run = () => onChangeRef.current();
    const source = new EventSource("/api/admin/events");
    let connectedOnce = false;

    source.addEventListener("change", (event) => {
      if (wanted.has(event.data)) run();
    });
    /* the first "ready" is the page's own first load; later ones follow a
       reconnect, when changes may have been missed */
    source.addEventListener("ready", () => {
      if (connectedOnce) run();
      connectedOnce = true;
    });
    const handleVisibility = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      source.close();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [key, enabled]);
}
