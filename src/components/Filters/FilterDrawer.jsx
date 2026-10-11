"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLenis } from "lenis/react";

import { useLocale } from "@/i18n/LocaleProvider";

/* the filters in a drawer: up from the bottom on a phone, in from the
   right on a larger screen. The page stops scrolling underneath while it
   is open; Escape, the backdrop or "Done" close it. */
export default function FilterDrawer({ open, onClose, onReset, summary, children }) {
  const { dict } = useLocale();
  const t = dict.reservations;
  const lenis = useLenis();
  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  /* rendered into <body>, so only once on the client */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    lenis?.stop();
    const previous = document.activeElement;
    panelRef.current?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      lenis?.start();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, [open, lenis]);

  if (!mounted) return null;

  return createPortal(
    <div className={`rs-drawer ${open ? "is-open" : ""}`} aria-hidden={!open} inert={!open}>
      <div className="rs-drawer-backdrop" onClick={onClose} />
      <div
        className="rs-drawer-panel"
        role="dialog"
        aria-modal="true"
        aria-label={t.filterTitle}
        tabIndex={-1}
        ref={panelRef}
      >
        <header className="rs-drawer-head">
          <p className="mono">{t.filterTitle}</p>
          <button type="button" className="hover-line rs-drawer-close" onClick={onClose}>
            {dict.reserve.close}
          </button>
        </header>
        <div className="rs-drawer-body" data-lenis-prevent>
          {children}
        </div>
        <footer className="rs-drawer-foot">
          {summary && <p className="mono rs-drawer-summary">{summary}</p>}
          {onReset && (
            <button type="button" className="hover-line rs-drawer-reset" onClick={onReset}>
              {t.reset}
            </button>
          )}
          <button type="button" className="rs-chip active rs-drawer-done" onClick={onClose}>
            {t.done}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
