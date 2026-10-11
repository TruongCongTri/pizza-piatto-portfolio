"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import Photo from "@/components/Photo/Photo";
import { useLocale } from "@/i18n/LocaleProvider";

import "./StickyCards.css";

gsap.registerPlugin(ScrollTrigger);

const MOBILE_BREAKPOINT = 1000;

/* title/description for each card live in dict.stickyCards[id] */
const CARDS = [
  { id: "dough", image: "/about/sticky-card-1.jpg" },
  { id: "beginning", image: "/about/sticky-card-2.jpg" },
  { id: "kitchen", image: "/about/sticky-card-3.jpg" },
  { id: "toppings", image: "/about/sticky-card-4.jpg" },
  { id: "classes", image: "/about/sticky-card-5.jpg" },
  { id: "takeaway", image: "/about/sticky-card-6.jpg" },
];

const StickyCards = () => {
  const sectionRef = useRef(null);
  const { dict } = useLocale();

  useEffect(() => {
    let ctx;
    const section = sectionRef.current;

    const buildScrollAnimation = () => {
      if (ctx) ctx.revert();

      const cardElements = section.querySelectorAll(".sticky-card");
      cardElements.forEach((card) => gsap.set(card, { clearProps: "all" }));

      if (window.innerWidth < MOBILE_BREAKPOINT) {
        section.classList.add("sticky-cards-mobile");
        return;
      }

      section.classList.remove("sticky-cards-mobile");

      requestAnimationFrame(() => {
        ctx = gsap.context(() => {
          const cards = gsap.utils.toArray(".sticky-card");
          const totalCards = cards.length;

          const lastLeftColumnIndex =
            totalCards % 2 === 0 ? totalCards - 2 : totalCards - 1;
          const lastRightColumnIndex =
            totalCards % 2 === 0 ? totalCards - 1 : totalCards - 2;

          cards.forEach((card, index) => {
            const isLastInColumn =
              index === lastLeftColumnIndex || index === lastRightColumnIndex;
            if (isLastInColumn) return;

            gsap
              .timeline({
                scrollTrigger: {
                  trigger: card,
                  start: "bottom top",
                  end: "+=100%",
                  scrub: true,
                },
              })
              .to(card, {
                yPercent: -100,
                ease: "none",
              });
          });

          ScrollTrigger.refresh();
        }, sectionRef);
      });
    };

    let wasMobile = window.innerWidth < MOBILE_BREAKPOINT;
    buildScrollAnimation();

    const handleResize = () => {
      const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
      if (isMobile !== wasMobile) {
        wasMobile = isMobile;
        buildScrollAnimation();
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (ctx) ctx.revert();
    };
  }, []);

  return (
    <div className="sticky-cards" ref={sectionRef}>
      {CARDS.map((card) => {
        const { title, description } = dict.stickyCards[card.id];
        return (
          <div className="sticky-card" key={card.id}>
            <div className="sticky-card-img">
              <Photo src={card.image} alt={title} sizes="(max-width: 999px) 78vw, 15vw" width={800} height={1000} />
            </div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        );
      })}
    </div>
  );
};

export default StickyCards;
