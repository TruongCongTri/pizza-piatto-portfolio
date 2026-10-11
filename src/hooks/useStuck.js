"use client";

import { useCallback, useEffect, useState } from "react";

/* whether a position: sticky element is currently held at its offset.
   Returns [callback ref, stuck]; never stuck while the element isn't
   sticky (e.g. a layout that only sticks on wider screens). */
export function useStuck() {
  const [node, setNode] = useState(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    if (!node) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const style = getComputedStyle(node);
      const top = parseFloat(style.top);
      setStuck(
        style.position === "sticky" &&
          Number.isFinite(top) &&
          window.scrollY > 0 &&
          node.getBoundingClientRect().top <= top + 1,
      );
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [node]);

  return [useCallback((element) => setNode(element), []), stuck];
}
