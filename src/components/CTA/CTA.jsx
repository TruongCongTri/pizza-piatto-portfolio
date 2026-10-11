"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import Copy from "@/components/Copy/Copy";
import Photo from "@/components/Photo/Photo";
import { useReserveTrigger } from "@/components/Reserve/ReserveProvider";
import { useLocale } from "@/i18n/LocaleProvider";

import "./CTA.css";

gsap.registerPlugin(ScrollTrigger);

const CTA = () => {
  const openReserve = useReserveTrigger();
  const { dict } = useLocale();
  const t = dict.cta;
  const sectionRef = useRef(null);
  const circleButtonRef = useRef(null);
  const circlePathRef = useRef(null);

  /* svg circle stroke reveal + image entrance on scroll */
  useEffect(() => {
    const section = sectionRef.current;
    const circlePath = circlePathRef.current;
    if (!section || !circlePath) return;

    const pathLength = circlePath.getTotalLength();
    const image = section.querySelector(".cta-image");

    gsap.set(circlePath, {
      strokeDasharray: pathLength,
      strokeDashoffset: pathLength,
      rotation: -90,
      transformOrigin: "center center",
    });

    gsap.set(image, { autoAlpha: 0, scale: 0.75 });

    const scrollTrigger = ScrollTrigger.create({
      trigger: section,
      start: "top 75%",
      once: true,
      onEnter: () => {
        gsap.to(circlePath, {
          strokeDashoffset: 0,
          duration: 1.2,
          delay: 0.6,
          ease: "power2.inOut",
        });

        gsap.to(image, {
          autoAlpha: 1,
          scale: 1,
          duration: 1,
          ease: "power3.out",
        });
      },
    });

    return () => scrollTrigger.kill();
  }, []);

  /* svg circle stroke hover animation */
  useEffect(() => {
    const button = circleButtonRef.current;
    const circlePath = circlePathRef.current;
    if (!button || !circlePath) return;

    const pathLength = circlePath.getTotalLength();
    let hoverTimeline = null;

    const handleMouseEnter = () => {
      if (hoverTimeline) hoverTimeline.kill();

      hoverTimeline = gsap.timeline();
      hoverTimeline
        .set(circlePath, {
          strokeDashoffset: 0,
          strokeDasharray: pathLength,
          scale: 1,
        })
        .to(circlePath, {
          strokeDashoffset: -pathLength,
          duration: 0.75,
          ease: "power2.inOut",
        })
        .set(circlePath, {
          strokeDashoffset: pathLength,
        })
        .to(circlePath, {
          strokeDashoffset: 0,
          duration: 0.75,
          ease: "power2.inOut",
        });
    };

    button.addEventListener("mouseenter", handleMouseEnter);

    return () => {
      button.removeEventListener("mouseenter", handleMouseEnter);
      if (hoverTimeline) hoverTimeline.kill();
    };
  }, []);

  return (
    <section className="cta" ref={sectionRef}>
      <div className="container">
        <div className="cta-content">
          <Copy type="lines" animateOnScroll trigger=".cta" start="top 80%">
            <h6>{t.eyebrow}</h6>
          </Copy>

          <Copy type="lines" animateOnScroll trigger=".cta" start="top 80%">
            <h5>{t.heading}</h5>
          </Copy>

          <div className="cta-details">
            <div className="cta-address">
              <Copy
                type="lines"
                animateOnScroll
                trigger=".cta"
                start="top 80%"
                delay={0.3}
              >
                {t.address.map((line) => (
                  <p className="mono" key={line}>
                    {line}
                  </p>
                ))}
              </Copy>
            </div>
            <div className="cta-hours">
              <Copy
                type="lines"
                animateOnScroll
                trigger=".cta"
                start="top 80%"
                delay={0.3}
              >
                {t.hours.map((line) => (
                  <p className="mono" key={line}>
                    {line}
                  </p>
                ))}
              </Copy>
            </div>
          </div>

          <div className="cta-circle-button" ref={circleButtonRef}>
            {/* a button, not a link: it can only ever open the booking form */}
            <button type="button" className="cta-button" onClick={openReserve}>
              <svg
                className="cta-button-svg"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 100 100"
              >
                <path
                  ref={circlePathRef}
                  d="M50,10 A40,40 0 1,1 49.9999,10"
                  stroke="currentColor"
                  strokeWidth="0.75"
                  fill="none"
                />
              </svg>
              <Copy
                type="lines"
                animateOnScroll
                trigger=".cta"
                start="top 80%"
                delay={0.5}
              >
                <span>{t.button}</span>
              </Copy>
            </button>
          </div>
        </div>

        <div className="cta-image">
          <Photo src="/cta/cta-img.jpg" alt={t.imageAlt} sizes="(max-width: 1000px) 100vw, 45vw" width={900} height={1200} />
        </div>
      </div>
    </section>
  );
};

export default CTA;
