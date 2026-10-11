"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import Photo from "@/components/Photo/Photo";
import Preloader, { isInitialLoad } from "@/components/Preloader/Preloader";
import Copy from "@/components/Copy/Copy";
import DiningMenu from "@/components/DiningMenu/DiningMenu";
import Testimonials from "@/components/Testimonials/Testimonials";
import CTA from "@/components/CTA/CTA";
import ImageBanner from "@/components/ImageBanner/ImageBanner";
import { useLocale } from "@/i18n/LocaleProvider";

import "./home.css";

gsap.registerPlugin(ScrollTrigger);

const ABOUT_IMAGE_COUNT = 6;

export default function Home() {
  const { dict } = useLocale();
  const t = dict.home;
  const aboutSectionRef = useRef(null);
  const isInitialPageLoad = useRef(isInitialLoad).current;
  const [preloaderDelay, setPreloaderDelay] = useState(
    isInitialPageLoad ? 9999 : 0,
  );

  const handlePreloaderEnter = () => {
    if (isInitialPageLoad) setPreloaderDelay(0.2);
  };

  useEffect(() => {
    const ctx = gsap.context(() => {
      const aboutImages = gsap.utils.toArray(".about-img");

      /* scale each about image in and out as it scrolls through the viewport */
      aboutImages.forEach((image) => {
        const imageScaleTimeline = gsap.timeline({
          scrollTrigger: {
            trigger: image,
            start: "top bottom",
            end: "bottom top",
            scrub: true,
          },
        });

        imageScaleTimeline
          .fromTo(image, { scale: 0.5 }, { scale: 1.25, ease: "none" })
          .to(image, { scale: 0.5, ease: "none" });
      });

      /* fade out the about header as the image gallery scrolls away */
      gsap.to(".about-header h3", {
        opacity: 0,
        ease: "power1.out",
        scrollTrigger: {
          trigger: ".about-imgs",
          start: "bottom bottom",
          end: "bottom 30%",
          scrub: true,
        },
      });
    }, aboutSectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <>
      <Preloader onEnter={handlePreloaderEnter} />

      <section className="hero">
        <div className="hero-img">
          <Photo src="/home/hero.jpg" sizes="100vw" width={2048} height={1152} preload fetchPriority="high" />
        </div>

        <div className="container">
          <Copy
            type="words"
            animateOnScroll={false}
            delay={isInitialPageLoad ? preloaderDelay : 0.85}
          >
            <h1>
              Pizza  <br /> Piatto
            </h1>
          </Copy>

          <div className="section-footer">
            <Copy
              type="lines"
              animateOnScroll={false}
              delay={isInitialPageLoad ? preloaderDelay + 0.15 : 1.1}
            >
              <p className="sm">{t.since}</p>
            </Copy>
            <Copy
              type="lines"
              animateOnScroll={false}
              delay={isInitialPageLoad ? preloaderDelay + 0.25 : 1.2}
            >
              <p className="sm">{t.location}</p>
            </Copy>
          </div>
        </div>
      </section>

      <section className="about" ref={aboutSectionRef}>
        <div className="about-header">
          <div className="container">
            <Copy type="lines">
              <h3>{t.about}</h3>
            </Copy>

            <div className="section-footer">
              <Copy type="lines" trigger=".about" start="top 50%" delay={0.5}>
                <p className="sm">{t.aboutLeft}</p>
              </Copy>
              <Copy type="lines" trigger=".about" start="top 50%" delay={0.6}>
                <p className="sm">{t.aboutRight}</p>
              </Copy>
            </div>
          </div>
        </div>

        <div className="about-imgs">
          <div className="container">
            {Array.from({ length: ABOUT_IMAGE_COUNT }, (_, index) => (
              <div
                key={index + 1}
                className="about-img"
                id={`about-img-${index + 1}`}
              >
                <Photo src={`/home/about-${index + 1}.jpg`} sizes="(max-width: 700px) 52vw, 20vw" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <DiningMenu />
      <Testimonials />
      <CTA />
      <ImageBanner />
    </>
  );
}
