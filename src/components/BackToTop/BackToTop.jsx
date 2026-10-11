"use client";

import { useEffect, useState } from "react";
import { useLenis } from "lenis/react";

import { useLocale } from "@/i18n/LocaleProvider";

import "./BackToTop.css";

/* shown once the page is a good way down */
const SHOW_AFTER_SCREENS = 1.2;
const SCROLL_SECONDS = 2.2;

const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* a round arrow in the corner that glides the page back to the top,
   slowly enough to see where you have been */
export default function BackToTop() {
  const { dict } = useLocale();
  const lenis = useLenis();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setShown(window.scrollY > window.innerHeight * SHOW_AFTER_SCREENS);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    /* iOS only applies :active (the tap look of buttons) once a page
       listens for touches */
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("touchstart", noop);
    };
  }, []);

  const toTop = () => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (lenis) {
      lenis.scrollTo(0, reduced ? { immediate: true } : { duration: SCROLL_SECONDS, easing: easeInOutCubic });
    } else {
      window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    }
  };

  return (
    <button
      type="button"
      className={`back-to-top ${shown ? "is-shown" : ""}`}
      aria-label={dict.common.backToTop}
      title={dict.common.backToTop}
      tabIndex={shown ? 0 : -1}
      aria-hidden={!shown}
      onClick={toTop}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
