"use client";

import { useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import Photo from "@/components/Photo/Photo";

import "./HeroCollage.css";

gsap.registerPlugin(ScrollTrigger);

const COLUMNS = 6;
const ROWS = 5;

/* columns of photos, filled from `images` so neighbouring tiles differ
   (stepping by a number coprime with the count) */
function layout(images) {
  const count = images.length;
  if (!count) return [];
  let step = 7;
  while (count > 1 && gcd(step, count) !== 1) step += 1;
  return Array.from({ length: COLUMNS }, (_, column) =>
    Array.from({ length: ROWS }, (_, row) => images[((column * ROWS + row) * step) % count]),
  );
}

function gcd(a, b) {
  return b ? gcd(b, a % b) : a;
}

/* the backdrop of a page's hero: a collage of the shop's photos under a
   navy veil, like the one behind the home page's menu. As the hero scrolls
   away the columns drift up, every other one further, for a little depth.
   Sits behind the hero's own content (the hero needs position: relative). */
export default function HeroCollage({ images }) {
  const frameRef = useRef(null);
  const columns = useMemo(() => layout(images), [images]);

  useEffect(() => {
    const frame = frameRef.current;
    const hero = frame?.parentElement;
    if (!frame || !hero || window.__viewTransitioning) return;

    const cols = gsap.utils.toArray(frame.querySelectorAll(".hero-collage-col"));
    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "bottom top",
        scrub: true,
        invalidateOnRefresh: true,
      },
    });
    cols.forEach((column, index) => {
      const isFast = index % 2 === 1;
      /* how far a column can rise before its bottom edge shows */
      const room = () => Math.max(0, column.offsetHeight - frame.offsetHeight);
      timeline.fromTo(
        column,
        { y: () => (isFast ? -room() * 0.35 : -room() * 0.1) },
        { y: () => -room() * (isFast ? 1 : 0.6), ease: "none" },
        0,
      );
    });

    return () => {
      timeline.scrollTrigger?.kill();
      timeline.kill();
      gsap.set(cols, { clearProps: "transform" });
    };
  }, [columns]);

  if (!columns.length) return null;

  return (
    <div className="hero-collage" ref={frameRef} aria-hidden="true">
      <div className="hero-collage-grid">
        {columns.map((column, columnIndex) => (
          <div className="hero-collage-col" key={columnIndex}>
            {column.map((src, rowIndex) => (
              <div className="hero-collage-tile" key={rowIndex}>
                <Photo
                  src={src}
                  sizes="(max-width: 600px) 36vw, (max-width: 1000px) 28vw, 19vw"
                  width={800}
                  height={1000}
                  loading={rowIndex < 2 ? "eager" : "lazy"}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
