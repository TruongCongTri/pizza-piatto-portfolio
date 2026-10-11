"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";

import "./DishPreview.css";

/* space between the cursor and the photo, and from the viewport edges */
const CURSOR_GAP = 24;
const EDGE_MARGIN = 16;

/* photo of the hovered dish beside the cursor, its top edge level with the
   cursor; hover targets are the [data-dish-image] elements inside
   `containerRef`, found as the pointer moves, so cards drawn later (the
   list grows as it scrolls) work too. Pointer devices only. */
export default function DishPreview({ containerRef }) {
  const previewRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    const preview = previewRef.current;
    const image = imageRef.current;
    if (!container || !preview || !image) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
      return;
    }

    /* warm the cache so the first hover shows its photo straight away */
    container.querySelectorAll("[data-dish-image]").forEach((target) => {
      new Image().src = target.dataset.dishImage;
    });

    gsap.set(preview, { autoAlpha: 0, scale: 0.9 });
    const xTo = gsap.quickTo(preview, "x", { duration: 0.4, ease: "power3" });
    const yTo = gsap.quickTo(preview, "y", { duration: 0.4, ease: "power3" });
    let isVisible = false;

    /* right of the cursor, flipped to the left near the right edge; only
       lifted off the cursor line when it would run past the bottom */
    const place = (event, immediate) => {
      const width = preview.offsetWidth;
      const height = preview.offsetHeight;
      let x = event.clientX + CURSOR_GAP;
      if (x + width > window.innerWidth - EDGE_MARGIN) {
        x = event.clientX - CURSOR_GAP - width;
      }
      const y = Math.min(
        event.clientY,
        window.innerHeight - EDGE_MARGIN - height,
      );

      if (immediate) gsap.set(preview, { x, y });
      xTo(x);
      yTo(y);
    };

    const show = (target, event) => {
      const src = target.dataset.dishImage;
      if (image.getAttribute("src") !== src) image.setAttribute("src", src);
      place(event, !isVisible);
      if (isVisible) return;
      isVisible = true;
      gsap.to(preview, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.35,
        ease: "power3.out",
        overwrite: "auto",
      });
    };

    const hide = () => {
      if (!isVisible) return;
      isVisible = false;
      gsap.to(preview, {
        autoAlpha: 0,
        scale: 0.9,
        duration: 0.25,
        ease: "power2.out",
        overwrite: "auto",
      });
    };

    let current = null;
    const handleMove = (event) => {
      const target = event.target.closest?.("[data-dish-image]");
      if (!target || !container.contains(target)) {
        current = null;
        hide();
        return;
      }
      if (target !== current) {
        current = target;
        show(target, event);
      } else if (isVisible) {
        place(event, false);
      } else {
        show(target, event);
      }
    };
    const handleLeave = () => {
      current = null;
      hide();
    };

    container.addEventListener("pointermove", handleMove);
    container.addEventListener("pointerleave", handleLeave);
    /* cards slide away under a still cursor while scrolling */
    window.addEventListener("scroll", hide, { passive: true });

    return () => {
      container.removeEventListener("pointermove", handleMove);
      container.removeEventListener("pointerleave", handleLeave);
      window.removeEventListener("scroll", hide);
      gsap.killTweensOf(preview);
    };
  }, [containerRef]);

  return (
    <div className="dish-preview" ref={previewRef} aria-hidden="true">
      <img ref={imageRef} alt="" />
    </div>
  );
}
