"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const LIST_STEP = 5;

/* a long list drawn a few at a time: the first `step` items, then `step`
   more each time the end of what is drawn comes near the screen. Returns
   { count, hasMore, sentinelRef }: draw items.slice(0, count) and put an
   element with sentinelRef after them. Starts again from the first few
   when `resetKey` changes (a new search or filter). */
export function useIncremental(total, { step = LIST_STEP, resetKey } = {}) {
  const [count, setCount] = useState(step);
  const observerRef = useRef(null);
  const hasMore = count < total;

  useEffect(() => setCount(step), [resetKey, step]);

  const sentinelRef = useCallback(
    (node) => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      if (!node || !hasMore) return;
      /* draws the next few just before the end of the list shows */
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            setCount((current) => current + step);
          }
        },
        { rootMargin: "0px 0px 150px 0px" },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    /* re-armed after each batch, in case the end is still in view */
    [hasMore, step, count],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { count, hasMore, sentinelRef };
}
