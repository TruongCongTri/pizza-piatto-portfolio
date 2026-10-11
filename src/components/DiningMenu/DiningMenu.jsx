"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useLenis } from "lenis/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { HiOutlineArrowUp, HiOutlineArrowDown } from "react-icons/hi";

import { diningMenu as menuData, localizeDiningMenu } from "./diningMenu-data";
import MenuItemTags from "./MenuItemTags";
import Copy from "@/components/Copy/Copy";
import Photo from "@/components/Photo/Photo";
import { useLocale } from "@/i18n/LocaleProvider";

import "./DiningMenu.css";

gsap.registerPlugin(ScrollTrigger);

const MOBILE_BREAKPOINT = 1000;
/* scroll distance (in viewport heights) spent on each category while pinned */
const SCROLL_PER_CATEGORY = 0.8;
const CATEGORY_COUNT = menuData.length;
/* categories longer than this get a tighter card so they fit */
const DENSE_ITEM_COUNT = 5;

/* background collage of the shop's dishes (/public/dining-menu/collage) */
const COLLAGE_IMAGE_COUNT = 30;
const COLLAGE_COLUMNS = 6;
const COLLAGE_ROWS = 6;
/* stepping by 7 (coprime with 30) keeps neighbouring tiles different */
const COLLAGE = Array.from({ length: COLLAGE_COLUMNS }, (_, column) =>
  Array.from({ length: COLLAGE_ROWS }, (_, row) => {
    const tile = column * COLLAGE_ROWS + row;
    const number = ((tile * 7) % COLLAGE_IMAGE_COUNT) + 1;
    return `/dining-menu/collage/dish-${String(number).padStart(2, "0")}.jpg`;
  }),
);

const DiningMenu = () => {
  const sectionRef = useRef(null);
  const collageFrameRef = useRef(null);
  const contentRef = useRef(null);
  const cardRef = useRef(null);
  const pinTriggerRef = useRef(null);
  const previousIndexRef = useRef(0);
  const lenis = useLenis();
  const { dict } = useLocale();
  const t = dict.diningMenu;
  const diningMenu = useMemo(() => localizeDiningMenu(t), [t]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [isDesktop, setIsDesktop] = useState(true);
  const [rebuildKey, setRebuildKey] = useState(0);

  const isFirstCategory = activeIndex === 0;
  const isLastCategory = activeIndex === CATEGORY_COUNT - 1;
  const activeMenu = diningMenu[activeIndex];
  /* "30 cm" heads the price column, as on the printed menu, when every item
     in the category shares it */
  const sharedSize = activeMenu.items.every(
    (item) => item.size && item.size === activeMenu.items[0].size,
  )
    ? activeMenu.items[0].size
    : null;

  /* while pinned, buttons/minimap scroll to the category's segment so the
     scroll position and the visible menu never disagree */
  const goToCategory = (index) => {
    const clamped = Math.max(0, Math.min(CATEGORY_COUNT - 1, index));
    const trigger = pinTriggerRef.current;

    if (!trigger) {
      setActiveIndex(clamped);
      return;
    }

    const segment = (trigger.end - trigger.start) / CATEGORY_COUNT;
    const target = trigger.start + segment * (clamped + 0.5);

    if (lenis) lenis.scrollTo(target, { duration: 1.2 });
    else window.scrollTo({ top: target, behavior: "smooth" });
  };

  const handlePrev = () => {
    if (!isFirstCategory) goToCategory(activeIndex - 1);
  };

  const handleNext = () => {
    if (!isLastCategory) goToCategory(activeIndex + 1);
  };

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

  /* pin the menu and step through categories on scroll, on phones as on
     desktops (the arrow buttons scroll to a category's stretch too) */
  useEffect(() => {
    const content = contentRef.current;
    if (!content || window.__viewTransitioning) return;

    const trigger = ScrollTrigger.create({
      trigger: content,
      start: "center center",
      end: () =>
        `+=${window.innerHeight * SCROLL_PER_CATEGORY * CATEGORY_COUNT}`,
      pin: true,
      /* parent .container is flex, where ScrollTrigger defaults this to false */
      pinSpacing: true,
      anticipatePin: 1,
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        const index = Math.min(
          CATEGORY_COUNT - 1,
          Math.floor(self.progress * CATEGORY_COUNT),
        );
        setActiveIndex(index);
      },
    });

    pinTriggerRef.current = trigger;

    /* the pin adds scroll space, so triggers further down must re-measure */
    ScrollTrigger.sort();
    ScrollTrigger.refresh();

    return () => {
      trigger.kill();
      pinTriggerRef.current = null;
      ScrollTrigger.refresh();
    };
  }, [isDesktop, rebuildKey]);

  /* the dish collage drifts up bit by bit while the menu steps through its
     categories; every other column travels further, for a little depth.
     The frame holding it is sticky, so the drift happens while it fills
     the screen */
  useEffect(() => {
    const section = sectionRef.current;
    const frame = collageFrameRef.current;
    if (!section || !frame || window.__viewTransitioning) return;

    const columns = gsap.utils.toArray(
      frame.querySelectorAll(".dining-collage-col"),
    );
    /* how far a column can rise before its bottom edge shows */
    const room = (column) =>
      Math.max(0, column.offsetHeight - frame.offsetHeight);

    const timeline = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
        invalidateOnRefresh: true,
      },
    });

    columns.forEach((column, index) => {
      const isFast = index % 2 === 1;
      timeline.fromTo(
        column,
        { y: () => (isFast ? -room(column) * 0.15 : 0) },
        { y: () => -room(column) * (isFast ? 1 : 0.7), ease: "none" },
        0,
      );
    });

    return () => {
      timeline.scrollTrigger?.kill();
      timeline.kill();
      gsap.set(columns, { clearProps: "transform" });
    };
  }, [isDesktop, rebuildKey]);

  /* card content slides in from the scroll direction on category change */
  useEffect(() => {
    const card = cardRef.current;
    const previousIndex = previousIndexRef.current;
    previousIndexRef.current = activeIndex;
    if (!card || previousIndex === activeIndex) return;

    const direction = activeIndex > previousIndex ? 1 : -1;
    const rows = card.querySelectorAll(
      ".dining-preview-head, .dining-preview-item",
    );

    gsap.killTweensOf(rows);
    gsap.fromTo(
      rows,
      { y: 40 * direction, autoAlpha: 0 },
      {
        y: 0,
        autoAlpha: 1,
        duration: 0.6,
        ease: "power3.out",
        stagger: 0.05,
      },
    );
  }, [activeIndex]);

  /* entrance animations on scroll */
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;

    const navButtons = section.querySelectorAll(".dining-nav-button-wrapper");
    const previewCard = section.querySelector(".dining-preview-card");
    const minimapItems = section.querySelectorAll(".dining-minimap-item");

    gsap.set(navButtons, { scale: 0 });
    gsap.set(previewCard, { autoAlpha: 0, y: 50 });
    gsap.set(minimapItems, { autoAlpha: 0, y: 30 });

    const scrollTrigger = ScrollTrigger.create({
      trigger: section,
      start: "top 30%",
      once: true,
      onEnter: () => {
        gsap.to(navButtons, {
          scale: 1,
          duration: 1,
          ease: "power3.out",
          stagger: 0.1,
        });

        gsap.to(previewCard, {
          autoAlpha: 1,
          scale: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
        });

        gsap.to(minimapItems, {
          autoAlpha: 1,
          y: 0,
          duration: 1,
          ease: "power3.out",
          stagger: 0.1,
        });
      },
    });

    return () => scrollTrigger.kill();
  }, []);

  return (
    <section className="dining-menu" ref={sectionRef}>
      <div className="dining-menu-bg" aria-hidden="true">
        <div className="dining-menu-bg-frame" ref={collageFrameRef}>
          <div className="dining-collage">
            {COLLAGE.map((column, columnIndex) => (
              <div className="dining-collage-col" key={columnIndex}>
                {column.map((src, rowIndex) => (
                  <div className="dining-collage-tile" key={rowIndex}>
                    <Photo src={src} sizes="(max-width: 600px) 36vw, (max-width: 1000px) 28vw, 19vw" width={800} height={1000} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="container">
        <div className="dining-menu-header">
          {/* a printed label, framed like "MENU" on the shop's menu */}
          <div className="menu-ticket-plate">
            <div className="menu-ticket">
              {["tl", "tr", "bl", "br"].map((corner) => (
                <span
                  key={corner}
                  className={`menu-ticket-corner ${corner}`}
                  aria-hidden="true"
                />
              ))}
              <Copy type="words" animateOnScroll>
                <h3>{t.title}</h3>
              </Copy>
            </div>
          </div>
        </div>

        <div className="dining-menu-content" ref={contentRef}>
          <div className="dining-nav">
            <div className="dining-nav-button-wrapper">
              <button
                className={`dining-nav-button ${isFirstCategory ? "disabled" : ""}`}
                aria-label={t.previous}
                disabled={isFirstCategory}
                onClick={handlePrev}
              >
                <HiOutlineArrowUp />
              </button>
            </div>

            <div className="dining-nav-button-wrapper">
              <button
                className={`dining-nav-button ${isLastCategory ? "disabled" : ""}`}
                aria-label={t.next}
                disabled={isLastCategory}
                onClick={handleNext}
              >
                <HiOutlineArrowDown />
              </button>
            </div>
          </div>

          <div className="dining-preview">
            <div
              className={`dining-preview-card ${activeMenu.items.length > DENSE_ITEM_COUNT ? "is-dense" : ""}`}
              ref={cardRef}
            >
              <div className="dining-preview-head">
                <h6>{activeMenu.category}</h6>
                {sharedSize && (
                  <p className="dining-preview-size">{sharedSize}</p>
                )}
              </div>

              {activeMenu.items.map((item) => (
                <div key={item.id} className="dining-preview-item">
                  <div className="dining-preview-item-row">
                    <p className="dining-preview-item-name">
                      {item.name}
                      <MenuItemTags
                        tags={item.tags}
                        labels={t.tags}
                        variant="outline"
                      />
                    </p>
                    <p className="dining-preview-item-price">{item.price}</p>
                  </div>
                  {item.description && (
                    <p className="dining-preview-item-description">
                      {item.description}
                    </p>
                  )}
                </div>
              ))}

              <div className="dining-preview-footer">
                <p>Pizza Piatto</p>
              </div>
            </div>
          </div>

          <div className="dining-minimap">
            {diningMenu.map((menu, index) => (
              <div
                key={menu.id}
                className={`dining-minimap-item ${index === activeIndex ? "active" : ""}`}
                onClick={() => goToCategory(index)}
              >
                <div className="dining-minimap-img">
                  <Photo src={menu.image} alt={menu.category} sizes="96px" />
                </div>
                <p>{menu.category}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default DiningMenu;
