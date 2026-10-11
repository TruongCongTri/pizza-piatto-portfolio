"use client";

import { useCallback, useRef } from "react";

/* a sideways list that can be dragged with the mouse, as it is swiped on
   a touch screen. Only acts while the list actually overflows; a drag
   longer than a few pixels doesn't count as a click on what it started on.
   Touch keeps the browser's own scrolling (the list needs
   data-lenis-prevent-touch so the page's smooth scroll leaves it alone).
   While the list has more than it shows (either way), the mouse wheel
   scrolls the list rather than the page; otherwise it scrolls the page.
   Returns a callback ref, so a list that shows up later is picked up. */
export function useDragScroll() {
  const cleanupRef = useRef(null);

  return useCallback((list) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!list) return;

    let start = null;
    let moved = false;

    const handleDown = (event) => {
      if (event.pointerType !== "mouse" || event.button !== 0) return;
      if (list.scrollWidth <= list.clientWidth) return;
      start = { x: event.clientX, left: list.scrollLeft };
      moved = false;
    };
    const handleMove = (event) => {
      if (!start) return;
      const dx = event.clientX - start.x;
      if (!moved && Math.abs(dx) < 6) return;
      if (!moved) {
        moved = true;
        list.classList.add("is-dragging");
        list.setPointerCapture?.(event.pointerId);
      }
      list.scrollLeft = start.left - dx;
    };
    const handleUp = () => {
      if (!start) return;
      start = null;
      list.classList.remove("is-dragging");
    };
    /* the click that ends a drag is swallowed */
    const handleClick = (event) => {
      if (!moved) return;
      moved = false;
      event.preventDefault();
      event.stopPropagation();
    };

    const overflow = new ResizeObserver(() => {
      const scrolls =
        list.scrollHeight > list.clientHeight + 1 || list.scrollWidth > list.clientWidth + 1;
      list.toggleAttribute("data-lenis-prevent-wheel", scrolls);
    });
    overflow.observe(list);
    [...list.children].forEach((child) => overflow.observe(child));

    list.addEventListener("pointerdown", handleDown);
    list.addEventListener("pointermove", handleMove);
    list.addEventListener("pointerup", handleUp);
    list.addEventListener("pointercancel", handleUp);
    list.addEventListener("click", handleClick, true);
    cleanupRef.current = () => {
      overflow.disconnect();
      list.removeEventListener("pointerdown", handleDown);
      list.removeEventListener("pointermove", handleMove);
      list.removeEventListener("pointerup", handleUp);
      list.removeEventListener("pointercancel", handleUp);
      list.removeEventListener("click", handleClick, true);
    };
  }, []);
}
