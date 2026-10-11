"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import Copy from "@/components/Copy/Copy";
import ImageBanner from "@/components/ImageBanner/ImageBanner";
import Marquee from "@/components/Marquee/Marquee";
import Photo from "@/components/Photo/Photo";
import StickyCards from "@/components/StickyCards/StickyCards";
import Chefs from "@/components/Chefs/Chefs";
import CTA from "@/components/CTA/CTA";
import { useLocale } from "@/i18n/LocaleProvider";

import "./about.css";

gsap.registerPlugin(ScrollTrigger);

const MOBILE_BREAKPOINT = 1000;

export default function About() {
  const { dict } = useLocale();
  const t = dict.about;
  const heroSectionRef = useRef(null);

  /* fade in the hero image on mount */
  useEffect(() => {
    const heroImage = heroSectionRef.current?.querySelector(".hero-image");
    if (!heroImage) return;

    gsap.fromTo(
      heroImage,
      { autoAlpha: 0, scale: 0.75, y: 50 },
      {
        autoAlpha: 1,
        scale: 1,
        y: 0,
        duration: 1,
        delay: 1.25,
        ease: "power3.out",
      },
    );
  }, []);

  /* scroll-driven parallax for hero header and image */
  useEffect(() => {
    let ctx;

    const buildScrollAnimation = () => {
      if (ctx) ctx.revert();

      const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
      const headerOffsetY = isMobile ? "200vh" : "175vh";
      const headerOffsetX = isMobile ? -100 : -150;

      ctx = gsap.context(() => {
        const heroParallaxTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: ".about-hero",
            start: "top top",
            end: "bottom +=1200%",
            scrub: true,
          },
        });

        heroParallaxTimeline
          .to(
            [".hero-heading .heading-line-1", ".hero-heading .heading-line-3"],
            {
              scale: 2,
              y: headerOffsetY,
              xPercent: headerOffsetX,
            },
            "scroll",
          )
          .to(
            ".hero-heading .heading-line-2",
            {
              scale: 2,
              y: headerOffsetY,
              xPercent: -headerOffsetX,
            },
            "scroll",
          )
          .to(
            ".hero-image",
            {
              scaleY: 2.5,
              yPercent: 300,
            },
            "scroll",
          )
          .to(
            ".hero-image img",
            {
              scaleX: 2.5,
            },
            "scroll",
          );
      }, heroSectionRef);
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
    <>
      <section className="about-hero" ref={heroSectionRef}>
        <div className="about-hero-pin">
          <div className="hero-heading">
            {/* word order differs per language ("Pizza Piatto Story" /
                "Câu Chuyện Pizza Piatto") */}
            <Copy animateOnScroll={false} delay={0.85}>
              {t.heroLines.map((line, index) => (
                <h1 key={line} className={`heading-line-${index + 1}`}>
                  {line}
                </h1>
              ))}
            </Copy>
          </div>

          <div className="hero-image">
            <Photo src="/about/about-hero.jpg" alt={t.heroAlt} sizes="100vw" width={1156} height={650} preload />
          </div>
        </div>
      </section>

      <section className="about-info">
        <div className="container">
          <Copy>
            <p className="mono">{t.eyebrow}</p>
            {t.paragraphs.map((paragraph) => (
              <h3 key={paragraph}>{paragraph}</h3>
            ))}
          </Copy>
        </div>
      </section>

      <ImageBanner image="/about/about-image-banner.jpg" />
      <Marquee />
      <StickyCards />
      <Chefs />
      <CTA />
    </>
  );
}
