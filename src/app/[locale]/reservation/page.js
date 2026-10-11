"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { HiClock, HiPhone } from "react-icons/hi2";
import { PiPizzaFill } from "react-icons/pi";

import Copy from "@/components/Copy/Copy";
import Button from "@/components/Button/Button";
import CTA from "@/components/CTA/CTA";
import Photo from "@/components/Photo/Photo";
import { useReserveTrigger } from "@/components/Reserve/ReserveProvider";
import { useViewTransition } from "@/hooks/useViewTransition";
import { useLocale } from "@/i18n/LocaleProvider";
import { RESTAURANT } from "@/lib/restaurant";

import "./reservation.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const MOBILE_BREAKPOINT = 1000;
const TRACK_PATH = "/reservation/track";

/* text for each card lives in dict.reservationPage.cards[id] */
const INFO_CARDS = [
  { id: "menu", icon: PiPizzaFill },
  { id: "hours", icon: HiClock },
  { id: "contact", icon: HiPhone },
];

export default function Reservation() {
  const { dict, localize } = useLocale();
  const t = dict.reservationPage;
  const openReserve = useReserveTrigger();
  const { navigateWithTransition } = useViewTransition();
  const heroSectionRef = useRef(null);
  const infoSectionRef = useRef(null);
  const heroButtonRef = useRef(null);
  const [isDesktop, setIsDesktop] = useState(true);
  const [rebuildKey, setRebuildKey] = useState(0);

  /* track breakpoint changes */
  useEffect(() => {
    const handleResize = () =>
      setIsDesktop(window.innerWidth >= MOBILE_BREAKPOINT);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  /* rebuild after view transition settles */
  useEffect(() => {
    const handleTransitionComplete = () => setRebuildKey((prev) => prev + 1);
    window.addEventListener("viewTransitionComplete", handleTransitionComplete);
    return () =>
      window.removeEventListener(
        "viewTransitionComplete",
        handleTransitionComplete,
      );
  }, []);

  /* the dining-room photo settles and sinks a little as the hero scrolls
     away */
  useEffect(() => {
    const hero = heroSectionRef.current;
    const image = hero?.querySelector(".reservation-hero-img img");
    if (!image) return;
    const tween = gsap.fromTo(
      image,
      { scale: 1.15, yPercent: 0 },
      {
        scale: 1,
        yPercent: 12,
        ease: "none",
        scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
      },
    );
    return () => {
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);

  /* hero button entrance animation */
  useEffect(() => {
    const buttonWrapper = heroButtonRef.current;
    if (!buttonWrapper) return;

    gsap.fromTo(
      buttonWrapper,
      { autoAlpha: 0, y: 40 },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.9,
        delay: 1.55,
        ease: "power3.out",
      },
    );
  }, []);

  useGSAP(
    () => {
      const infoSection = infoSectionRef.current;
      if (!infoSection) return;

      infoSection.classList.remove("reservation-info-mobile");

      if (window.__viewTransitioning) return;

      if (!isDesktop) {
        infoSection.classList.add("reservation-info-mobile");
        /* the page is far shorter without the pinned cards: re-measure,
           or the footer's and the CTA's reveals wait for a scroll position
           the page no longer reaches */
        requestAnimationFrame(() => ScrollTrigger.refresh());
        return;
      }

      const panels = gsap.utils.toArray(
        infoSection.querySelectorAll(".info-panel"),
      );
      const cards = gsap.utils.toArray(
        infoSection.querySelectorAll(".info-card"),
      );

      /* panels slide up with icon scale-in */
      ScrollTrigger.create({
        trigger: infoSection,
        start: "top bottom",
        end: "top top",
        scrub: 1,
        onUpdate: (self) => {
          const progress = self.progress;

          panels.forEach((panel, index) => {
            const staggerDelay = 0.15;
            const duration = 0.7;
            const start = index * staggerDelay;
            const end = start + duration;

            if (progress >= start && progress <= end) {
              const normalised = (progress - start) / duration;
              gsap.set(panel, { y: `${125 - normalised * 125}%` });

              const icon = panel.querySelector(".info-panel-icon");
              const iconThreshold = 0.4;
              const iconProgress = Math.max(
                0,
                (normalised - iconThreshold) / (1 - iconThreshold),
              );
              gsap.set(icon, { scale: iconProgress });
            } else if (progress > end) {
              gsap.set(panel, { y: "0%" });
              gsap.set(panel.querySelector(".info-panel-icon"), { scale: 1 });
            }
          });
        },
      });

      /* cards fan in from right, then scale up */
      ScrollTrigger.create({
        trigger: infoSection,
        start: "top top",
        end: `+=${window.innerHeight * 3}`,
        pin: true,
        scrub: 1,
        onUpdate: (self) => {
          const progress = self.progress;

          cards.forEach((card, index) => {
            const slideStagger = 0.075;
            const slideDuration = 0.4;
            const slideStart = index * slideStagger;
            const slideEnd = slideStart + slideDuration;

            if (progress >= slideStart && progress <= slideEnd) {
              const normalised = (progress - slideStart) / slideDuration;
              const initialX = 350 - index * 100;
              const targetX = -50;
              const currentX = initialX + normalised * (targetX - initialX);
              const currentRotation = 20 - normalised * 20;
              gsap.set(card, { x: `${currentX}%`, rotation: currentRotation });
            } else if (progress > slideEnd) {
              gsap.set(card, { x: "-50%", rotation: 0 });
            }

            const scaleStagger = 0.12;
            const scaleStart = 0.4 + index * scaleStagger;
            const scaleEnd = 1;

            if (progress >= scaleStart && progress <= scaleEnd) {
              const normalised =
                (progress - scaleStart) / (scaleEnd - scaleStart);
              gsap.set(card, { scale: 0.75 + normalised * 0.25 });
            } else if (progress > scaleEnd) {
              gsap.set(card, { scale: 1 });
            }
          });
        },
      });
    },
    {
      scope: infoSectionRef,
      dependencies: [isDesktop, rebuildKey],
      revertOnUpdate: true,
    },
  );

  return (
    <>
      <section className="reservation-hero" ref={heroSectionRef}>
        {/* the dining room: the four tables a booking holds one of */}
        <div className="hero-img reservation-hero-img" aria-hidden="true">
          <Photo src="/home/about-1.jpg" sizes="100vw" width={1200} height={1200} preload fetchPriority="high" />
        </div>
        <div className="container">
          <Copy type="words" animateOnScroll={false} delay={0.85}>
            <h2>{t.title}</h2>
          </Copy>

          <Copy type="lines" animateOnScroll={false} delay={1.35}>
            <p className="lg">{t.intro}</p>
          </Copy>

          <div className="reservation-hero-button" ref={heroButtonRef}>
            <Button type="button" onClick={openReserve}>
              {t.button}
            </Button>
            <a
              href={localize(TRACK_PATH)}
              className="reservation-track-link hover-line"
              onClick={(e) => {
                e.preventDefault();
                navigateWithTransition(TRACK_PATH);
              }}
            >
              {t.track}
            </a>
          </div>

          <Copy type="lines" animateOnScroll={false} delay={1.65}>
            <p className="mono">
              <a href={`tel:${RESTAURANT.phoneIntl.replace(/\s/g, "")}`}>
                ( {RESTAURANT.phone} )
              </a>
            </p>
          </Copy>
        </div>
      </section>

      <section className="reservation-info" ref={infoSectionRef}>
        <div className="container">
          {INFO_CARDS.map(({ id, icon: Icon }) => {
            const { title, description, items } = t.cards[id];
            return (
              <div className="info-panel" key={id}>
                <div className="info-panel-icon">
                  <Icon />
                </div>
                <div className="info-card">
                  <Icon className="info-card-icon" />
                  <h5>{title}</h5>
                  <p>{description}</p>
                  <div className="info-card-items">
                    {items.map((item) => (
                      <p className="mono" key={item}>
                        {item}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <CTA />
    </>
  );
}
