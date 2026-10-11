"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { useLenis } from "lenis/react";

import Button from "@/components/Button/Button";
import Photo from "@/components/Photo/Photo";
import { useLocale } from "@/i18n/LocaleProvider";

import "./Preloader.css";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const EXIT_ANIMATION_MS = 700;

let isInitialLoad = true;

/* the dishes behind the title: the same photos as the home page's menu
   collage, in columns that drift slowly, every other one the other way */
const DISH_COUNT = 30;
const COLUMNS = 6;
const PER_COLUMN = 5;
const DRIFT = Array.from({ length: COLUMNS }, (_, column) =>
  Array.from({ length: PER_COLUMN }, (_, row) => {
    /* stepping by 7 (coprime with 30) keeps neighbouring tiles different */
    const number = (((column * PER_COLUMN + row) * 7) % DISH_COUNT) + 1;
    return `/dining-menu/collage/dish-${String(number).padStart(2, "0")}.jpg`;
  }),
);

/* drawn once: the progress below updates every frame and must not redraw
   it. Each column holds its photos twice, so moving it by half loops. */
const DishDrift = memo(function DishDrift() {
  return (
    <div className="preloader-drift" aria-hidden="true">
      {DRIFT.map((column, columnIndex) => (
        <div className="preloader-drift-col" key={columnIndex}>
          {[...column, ...column].map((src, index) => (
            <div className="preloader-drift-tile" key={index}>
              <Photo
                src={src}
                sizes="(max-width: 600px) 36vw, (max-width: 1000px) 28vw, 18vw"
                width={800}
                height={1000}
                loading="eager"
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});

export default function Preloader({
  title = "Pizza Piatto",
  duration = 2600,
  buttonText,
  buttonHref = "#",
  onEnter,
  onAnimationComplete,
}) {
  const lenis = useLenis();
  const { dict } = useLocale();
  const t = dict.preloader;
  const [isVisible, setIsVisible] = useState(isInitialLoad);
  const [isScrollLocked, setIsScrollLocked] = useState(isInitialLoad);
  const [progress, setProgress] = useState(0);
  const [hasFinishedLoading, setHasFinishedLoading] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  /* lock/unlock scroll while preloader is active */
  useEffect(() => {
    if (!isScrollLocked) {
      if (lenis) lenis.start();
      document.body.style.overflow = "";
      return;
    }

    if (lenis) lenis.stop();
    document.body.style.overflow = "hidden";

    return () => {
      if (lenis) lenis.start();
      document.body.style.overflow = "";
    };
  }, [lenis, isScrollLocked]);

  /* animate progress from 0 to 100 */
  useEffect(() => {
    if (!isVisible) return;

    let frameId = null;
    const startTime = performance.now();

    const tick = (now) => {
      const elapsed = now - startTime;
      const ratio = clamp(elapsed / duration, 0, 1);
      const percent = Math.round(ratio * 100);

      setProgress(percent);

      if (percent >= 100) {
        setHasFinishedLoading(true);
        return;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);

    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [duration, isVisible]);

  const loadingText = useMemo(
    () => t.loading.replace("{progress}", progress),
    [t, progress],
  );

  const handleEnterClick = (event) => {
    if (event) event.preventDefault();
    if (!hasFinishedLoading || isExiting) return;

    if (onEnter) onEnter(event);

    setIsExiting(true);
    setIsScrollLocked(false);

    window.setTimeout(() => {
      isInitialLoad = false;
      setIsVisible(false);
      if (onAnimationComplete) onAnimationComplete();
    }, EXIT_ANIMATION_MS);
  };

  if (!isVisible) return null;

  return (
    <section
      className={`preloader ${isExiting ? "is-exiting" : ""}`}
      aria-label={t.label}
    >
      <DishDrift />
      <div className="preloader-inner">
        <div className="preloader-title-wrap">
          <h2 className="preloader-title preloader-title-base">{title}</h2>
          <h2
            className="preloader-title preloader-title-fill"
            style={{ width: `${progress}%` }}
          >
            {title}
          </h2>
        </div>

        <div className="preloader-action-slot">
          <p
            className={`preloader-loading ${hasFinishedLoading ? "is-hidden" : ""} mono`}
            aria-live="polite"
          >
            {loadingText}
          </p>

          <div
            className={`preloader-button-wrap ${hasFinishedLoading ? "is-visible" : ""}`}
          >
            <Button
              href={buttonHref}
              onClick={handleEnterClick}
              className="preloader-enter-button"
            >
              {buttonText ?? t.enter}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export { isInitialLoad };
