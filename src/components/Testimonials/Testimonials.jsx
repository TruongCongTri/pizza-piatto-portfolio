"use client";

import { useRef, useEffect, useCallback } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HiOutlineArrowLeft, HiOutlineArrowRight } from "react-icons/hi";

import { fallbackReviews, getInitials } from "./testimonials-data";
import { useGoogleReviews } from "./ReviewsProvider";
import Copy from "@/components/Copy/Copy";
import { useLocale } from "@/i18n/LocaleProvider";
import { RESTAURANT } from "@/lib/restaurant";

import "./Testimonials.css";

gsap.registerPlugin(ScrollTrigger);

const MOBILE_BREAKPOINT = 1000;
const CARD_GAP = 20;
const LERP_FACTOR = 0.075;
const VELOCITY_DAMPING = 0.95;
const VELOCITY_THRESHOLD = 0.05;
/* Google returns at most 5 reviews; repeat them so the loop never shows a gap */
const MIN_CARDS = 8;

function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

function repeatToLength(items, minLength) {
  if (!items.length) return items;
  const repeated = [...items];
  while (repeated.length < minLength) repeated.push(...items);
  return repeated;
}

const StarRating = ({ count }) => (
  <div className="testimonial-stars">
    {Array.from({ length: 5 }, (_, index) => (
      <span key={index} className={index < count ? "star filled" : "star"}>
        ★
      </span>
    ))}
  </div>
);

const Testimonials = () => {
  const sectionRef = useRef(null);
  const { locale, dict } = useLocale();
  const t = dict.testimonials;
  const trackRef = useRef(null);
  const slideByRef = useRef(null);
  const google = useGoogleReviews();

  const isGoogle = Boolean(google?.reviews?.length);
  const reviews = isGoogle
    ? google.reviews
    : fallbackReviews.map((review) => ({
        ...review,
        text: t.reviews[review.id],
        translated: review.lang !== locale,
      }));
  const cardReviews = repeatToLength(reviews, MIN_CARDS);

  const sourceUrl = isGoogle ? google.url : RESTAURANT.links.facebookReviews;
  let sourceSummary = t.facebookSummary;
  if (isGoogle) {
    sourceSummary = google.rating
      ? fillTemplate(t.googleSummary, {
          rating: google.rating.toFixed(1),
          count: google.count ?? reviews.length,
        })
      : "Google";
  }

  /* entrance animations on scroll */
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const navButtons = section.querySelectorAll(
      ".testimonials-nav-button-wrapper",
    );
    const cards = section.querySelectorAll(".testimonial-card");

    gsap.set(navButtons, { scale: 0 });
    gsap.set(cards, { scale: 0.85, autoAlpha: 0 });

    const scrollTrigger = ScrollTrigger.create({
      trigger: section,
      start: "top 75%",
      once: true,
      onEnter: () => {
        gsap.to(navButtons, {
          scale: 1,
          duration: 0.6,
          ease: "back.out(1.7)",
          stagger: 0.1,
          delay: 0.4,
        });

        gsap.to(cards, {
          scale: 1,
          autoAlpha: 1,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.1,
          delay: 0.3,
        });
      },
    });

    return () => scrollTrigger.kill();
  }, []);

  /* infinite carousel with drag and momentum */
  useEffect(() => {
    const track = trackRef.current;
    const cards = gsap.utils.toArray(
      track.querySelectorAll(".testimonial-card"),
    );
    const cardCount = cards.length;
    if (!cardCount) return;

    const cardWidth = cards[0].offsetWidth;
    const itemWidth = cardWidth + CARD_GAP;
    const totalWidth = cardCount * itemWidth;

    gsap.set(cards, {
      position: "absolute",
      left: 0,
      top: 0,
      x: (index) => index * itemWidth,
    });

    /* review lengths vary; give every card the tallest card's height */
    const cardHeight = Math.max(...cards.map((card) => card.offsetHeight));
    gsap.set(cards, { height: cardHeight });
    gsap.set(track, { height: cardHeight });

    const wrapPosition = gsap.utils.wrap(-itemWidth, totalWidth - itemWidth);

    let targetX = 0;
    let currentX = 0;

    let isDragging = false;
    let dragStartPointerX = 0;
    let dragStartTargetX = 0;

    let velocityX = 0;
    let lastPointerX = 0;
    let lastPointerTime = 0;

    slideByRef.current = (direction) => {
      velocityX = 0;
      targetX += direction * itemWidth;
    };

    const updateCardPositions = () => {
      if (!isDragging) {
        targetX += velocityX;
        velocityX *= VELOCITY_DAMPING;
        if (Math.abs(velocityX) < VELOCITY_THRESHOLD) velocityX = 0;
      }

      currentX += (targetX - currentX) * LERP_FACTOR;

      cards.forEach((card, index) => {
        gsap.set(card, { x: wrapPosition(index * itemWidth + currentX) });
      });
    };

    gsap.ticker.add(updateCardPositions);

    const handlePointerDown = (e) => {
      isDragging = true;
      dragStartPointerX = e.clientX;
      dragStartTargetX = targetX;
      velocityX = 0;
      lastPointerX = e.clientX;
      lastPointerTime = Date.now();
      track.setPointerCapture(e.pointerId);
      track.style.cursor = "grabbing";
    };

    const handlePointerMove = (e) => {
      if (!isDragging) return;
      const dragDelta = e.clientX - dragStartPointerX;
      targetX = dragStartTargetX + dragDelta;

      const now = Date.now();
      const timeDelta = now - lastPointerTime;
      if (timeDelta > 0) {
        velocityX = ((e.clientX - lastPointerX) / timeDelta) * 16;
        lastPointerX = e.clientX;
        lastPointerTime = now;
      }
    };

    const handlePointerUp = () => {
      isDragging = false;
      track.style.cursor = "grab";
    };

    let isDragEnabled = false;

    const enableDrag = () => {
      if (isDragEnabled) return;
      track.addEventListener("pointerdown", handlePointerDown);
      track.addEventListener("pointermove", handlePointerMove);
      track.addEventListener("pointerup", handlePointerUp);
      track.addEventListener("pointercancel", handlePointerUp);
      track.style.cursor = "grab";
      track.style.touchAction = "none";
      isDragEnabled = true;
    };

    const disableDrag = () => {
      if (!isDragEnabled) return;
      track.removeEventListener("pointerdown", handlePointerDown);
      track.removeEventListener("pointermove", handlePointerMove);
      track.removeEventListener("pointerup", handlePointerUp);
      track.removeEventListener("pointercancel", handlePointerUp);
      track.style.cursor = "default";
      track.style.touchAction = "auto";
      isDragging = false;
      isDragEnabled = false;
    };

    const handleResize = () => {
      window.innerWidth < MOBILE_BREAKPOINT ? disableDrag() : enableDrag();
    };

    handleResize();
    window.addEventListener("resize", handleResize);

    return () => {
      gsap.ticker.remove(updateCardPositions);
      disableDrag();
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handlePrev = useCallback(() => {
    slideByRef.current?.(1);
  }, []);

  const handleNext = useCallback(() => {
    slideByRef.current?.(-1);
  }, []);

  return (
    <section className="testimonials" ref={sectionRef}>
      <div className="container">
        <div className="testimonials-header">
          <div className="testimonials-heading">
            <Copy type="lines" animateOnScroll>
              <h3>{t.title}</h3>
            </Copy>
            <Copy type="lines" animateOnScroll delay={0.2}>
              <p className="mono">
                <a
                  className="hover-line"
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  ( {sourceSummary} )
                </a>
              </p>
            </Copy>
          </div>

          <div className="testimonials-nav">
            <div className="testimonials-nav-button-wrapper">
              <button
                className="testimonials-nav-button"
                aria-label={t.previous}
                onClick={handlePrev}
              >
                <HiOutlineArrowLeft />
              </button>
            </div>
            <div className="testimonials-nav-button-wrapper">
              <button
                className="testimonials-nav-button"
                aria-label={t.next}
                onClick={handleNext}
              >
                <HiOutlineArrowRight />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="testimonials-carousel">
        <div className="testimonials-track" ref={trackRef}>
          {cardReviews.map((review, index) => (
            <div className="testimonial-card" key={`${review.id}-${index}`}>
              <div className="testimonial-content">
                <span className="testimonial-quote-mark">"</span>
                <p>{review.text}</p>
              </div>

              <div className="testimonial-author">
                <div className="testimonial-author-img">
                  {review.photo ? (
                    <img
                      src={review.photo}
                      alt={review.name}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <span className="testimonial-initials" aria-hidden="true">
                      {getInitials(review.name)}
                    </span>
                  )}
                </div>
                <div className="testimonial-author-info">
                  <h6 className="testimonial-author-name">
                    {review.authorUrl ? (
                      <a
                        href={review.authorUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        /* keep the carousel drag from swallowing the click */
                        onPointerDown={(e) => e.stopPropagation()}
                      >
                        {review.name}
                      </a>
                    ) : (
                      review.name
                    )}
                  </h6>
                  {review.rating ? (
                    <StarRating count={review.rating} />
                  ) : (
                    <p className="mono testimonial-recommends">
                      {t.recommends}
                    </p>
                  )}
                </div>
                <p className="mono testimonial-source">
                  {review.translated && <span>{t.translated} · </span>}
                  {isGoogle ? "Google" : "Facebook"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Testimonials;
