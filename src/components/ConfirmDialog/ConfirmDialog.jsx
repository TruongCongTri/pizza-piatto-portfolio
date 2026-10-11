"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLenis } from "lenis/react";
import gsap from "gsap";

import Button from "@/components/Button/Button";

import "./ConfirmDialog.css";

const CLIP_SHOWN = "polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)";
const CLIP_BELOW = "polygon(0% 100%, 100% 100%, 100% 100%, 0% 100%)";
const CLIP_ABOVE = "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)";

/* a yes/no step before an action, with room for extra content (a table
   picker, a whole form); rendered on <body> so no transformed page wrapper
   can shift it. `focusConfirm={false}` leaves focus to the content;
   `actions={false}` leaves out the buttons, for content with its own (a
   whole form); `wide` is true, or "xl" for a big form. */
export default function ConfirmDialog({
  open,
  eyebrow,
  title,
  message,
  children,
  confirmLabel,
  cancelLabel,
  busy = false,
  confirmDisabled = false,
  focusConfirm = true,
  wide = false,
  actions = true,
  onConfirm,
  onCancel,
}) {
  const lenis = useLenis();
  const [rendered, setRendered] = useState(false);
  const overlayRef = useRef(null);
  const panelRef = useRef(null);
  const confirmRef = useRef(null);
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (open) setRendered(true);
  }, [open]);

  useEffect(() => {
    if (!rendered) return;
    const overlay = overlayRef.current;
    const panel = panelRef.current;
    gsap.killTweensOf([overlay, panel]);

    if (open) {
      returnFocusRef.current = document.activeElement;
      lenis?.stop();
      gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.4 });
      gsap.fromTo(
        panel,
        { clipPath: CLIP_BELOW, y: 40 },
        { clipPath: CLIP_SHOWN, y: 0, duration: 0.8, ease: "power4.out" },
      );
      if (focusConfirm) confirmRef.current?.focus({ preventScroll: true });
      return;
    }

    gsap.to(panel, { clipPath: CLIP_ABOVE, duration: 0.45, ease: "power3.in" });
    gsap.to(overlay, {
      opacity: 0,
      duration: 0.4,
      delay: 0.1,
      onComplete: () => {
        setRendered(false);
        lenis?.start();
        returnFocusRef.current?.focus?.({ preventScroll: true });
      },
    });
  }, [open, rendered]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, busy, onCancel]);

  if (!rendered) return null;

  return createPortal(
    <div
      className="confirm-overlay"
      ref={overlayRef}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className={`confirm-panel ${wide ? "is-wide" : ""} ${wide === "xl" ? "is-xl" : ""}`}
        ref={panelRef}
        data-lenis-prevent
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={message ? "confirm-message" : undefined}
      >
        <p className="mono">{eyebrow}</p>
        <h4 id="confirm-title">{title}</h4>
        {message && (
          <p className="md" id="confirm-message">
            {message}
          </p>
        )}
        {children}
        {actions && (
          <div className="confirm-actions">
            <Button
              type="button"
              ref={confirmRef}
              onClick={onConfirm}
              disabled={busy || confirmDisabled}
            >
              {confirmLabel}
            </Button>
            <button
              type="button"
              className="confirm-cancel hover-line"
              onClick={onCancel}
              disabled={busy}
            >
              {cancelLabel}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
