"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import gsap from "gsap";

import Button from "@/components/Button/Button";
import Copy from "@/components/Copy/Copy";
import Photo from "@/components/Photo/Photo";
import { useReserveTrigger } from "@/components/Reserve/ReserveProvider";
import { useLocale } from "@/i18n/LocaleProvider";

import "./Footer.css";

const MOBILE_BREAKPOINT = 1000;

/* calls `onSeen` once `element` is well into view. Watches the element
   itself rather than scroll positions, so a page whose height changes
   after loading can't leave the footer waiting for a spot it never
   reaches. */
function whenSeen(element, onSeen, threshold = 0.35) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        onSeen();
      }
    },
    { threshold },
  );
  observer.observe(element);
  return () => observer.disconnect();
}

const POSTCARDS = [
  { image: "/footer/footer-img-1.jpg", rotation: -8, x: "-25%" },
  { image: "/footer/footer-img-2.jpg", rotation: 6, x: "20%" },
  { image: "/footer/footer-img-3.jpg", rotation: -4, x: "-15%" },
  { image: "/footer/footer-img-4.jpg", rotation: 10, x: "25%" },
  { image: "/footer/footer-img-5.jpg", rotation: -12, x: "-10%" },
];

const Footer = () => {
  const pathname = usePathname();
  const { dict } = useLocale();
  const t = dict.footer;
  const openReserve = useReserveTrigger();
  const sectionRef = useRef(null);
  const visitButtonRef = useRef(null);
  const visitButtonContainerRef = useRef(null);

  /* button scroll-triggered entrance, re-runs on route change */
  useEffect(() => {
    const heading = sectionRef.current?.querySelector(".footer-heading");
    const buttonContainer = visitButtonContainerRef.current;
    if (!heading || !buttonContainer) return;

    gsap.set(buttonContainer, { autoAlpha: 0, y: 40 });

    return whenSeen(heading, () =>
      gsap.to(buttonContainer, {
        autoAlpha: 1,
        y: 0,
        duration: 0.9,
        ease: "power3.out",
      }),
    );
  }, [pathname]);

  /* the postcards: on a desktop they fan out while the button is hovered;
     on a phone, with no hover, they fan up from the bottom once the footer
     is in view and stay */
  useEffect(() => {
    const section = sectionRef.current;
    const button = visitButtonRef.current;
    if (!section || !button) return;

    const cards = gsap.utils.toArray(".footer-postcard");
    const postcardsContainer = section.querySelector(".footer-postcards");
    if (!cards.length || !postcardsContainer) return;

    /* on a phone the cards sit at the footer's foot and show more of
       themselves; on a desktop they rise over the middle */
    const buildTimeline = (isPhone) => {
      const timeline = gsap.timeline({ paused: true });
      cards.forEach((card, index) => {
        const cardData = POSTCARDS[index];
        timeline.fromTo(
          card,
          { yPercent: 250, xPercent: 0, rotation: 0 },
          {
            yPercent: isPhone ? 12 : 55,
            xPercent: parseFloat(cardData.x) * (isPhone ? 1.4 : 1),
            rotation: cardData.rotation,
            duration: isPhone ? 1 : 0.8,
            ease: "power3.out",
          },
          index * (isPhone ? 0.1 : 0.07),
        );
      });
      return timeline;
    };

    let mode = null;
    let timeline = null;
    let stopWatching = null;
    const handleMouseEnter = () => timeline?.play();
    const handleMouseLeave = () => timeline?.reverse();

    const teardown = () => {
      button.removeEventListener("mouseenter", handleMouseEnter);
      button.removeEventListener("mouseleave", handleMouseLeave);
      stopWatching?.();
      stopWatching = null;
      timeline?.kill();
      gsap.set(cards, { clearProps: "transform" });
    };

    const setMode = (next) => {
      if (next === mode) return;
      teardown();
      mode = next;
      timeline = buildTimeline(next === "phone");
      if (next === "phone") {
        stopWatching = whenSeen(section, () => timeline.play(), 0.25);
      } else {
        button.addEventListener("mouseenter", handleMouseEnter);
        button.addEventListener("mouseleave", handleMouseLeave);
      }
    };

    const handleResize = () => setMode(window.innerWidth < MOBILE_BREAKPOINT ? "phone" : "desktop");

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      teardown();
      window.removeEventListener("resize", handleResize);
    };
  }, [pathname]);

  return (
    <footer className="footer" ref={sectionRef}>
      <div className="footer-content">
        <div className="footer-heading">
          <Copy key={`heading-${pathname}`} type="lines" animateOnScroll>
            <h2>{t.heading}</h2>
          </Copy>
        </div>

        <div className="footer-button-container" ref={visitButtonContainerRef}>
          {/* a button, not a link: it can only ever open the booking form */}
          <Button type="button" ref={visitButtonRef} onClick={openReserve}>
            {t.cta}
          </Button>
        </div>
      </div>

      <div className="footer-postcards">
        {POSTCARDS.map((card, index) => (
          <div className="footer-postcard" key={index}>
            <Photo src={card.image} alt="Pizza Piatto" sizes="(max-width: 999px) 60vw, 40vw" width={1000} height={1400} />
          </div>
        ))}
      </div>

      <div className="footer-bar">
        <div className="footer-bar-left">
          <Copy
            key={`left-${pathname}`}
            type="lines"
            trigger=".footer-heading"
            animateOnScroll
          >
            <p className="sm">{t.rights}</p>
          </Copy>
        </div>
        <div className="footer-bar-right">
          <Copy
            key={`right-${pathname}`}
            type="lines"
            trigger=".footer-heading"
            animateOnScroll
          >
            <p className="sm">
              <a
                className="hover-line"
                href="https://truong-cong-tri-portfolio.vercel.app/"
                target="_blank"
                rel="noopener noreferrer"
              >
                {t.credit}
              </a>
            </p>
          </Copy>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
