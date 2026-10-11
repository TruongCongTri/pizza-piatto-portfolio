"use client";

import { memo, useEffect, useMemo, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { localizeDiningMenu } from "@/components/DiningMenu/diningMenu-data";
import DishPreview from "@/components/DiningMenu/DishPreview";
import MenuItemTags from "@/components/DiningMenu/MenuItemTags";
import Copy from "@/components/Copy/Copy";
import HeroCollage from "@/components/HeroCollage/HeroCollage";
import Photo from "@/components/Photo/Photo";
import Testimonials from "@/components/Testimonials/Testimonials";
import { LIST_STEP, useIncremental } from "@/hooks/useIncremental";
import { useLocale } from "@/i18n/LocaleProvider";

import "./menu.css";

gsap.registerPlugin(ScrollTrigger);

/* the shop's dishes, the same photos as behind the home page's menu */
const HERO_PHOTOS = Array.from(
  { length: 30 },
  (_, index) => `/dining-menu/collage/dish-${String(index + 1).padStart(2, "0")}.jpg`,
);

export default function Menu() {
  const { dict } = useLocale();
  const t = dict.menuPage;
  const diningMenu = useMemo(
    () => localizeDiningMenu(dict.diningMenu),
    [dict],
  );
  const menuListRef = useRef(null);

  /* stagger-reveal menu cards as each grid enters the viewport */
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray(".menu-grid").forEach((grid) => {
        const cards = grid.querySelectorAll(".menu-grid-card");

        gsap.set(cards, { opacity: 0, y: 30, scale: 0.75 });

        ScrollTrigger.create({
          trigger: grid,
          start: "top 70%",
          once: true,
          onEnter: () => {
            gsap.to(cards, {
              opacity: 1,
              y: 0,
              scale: 1,
              duration: 0.6,
              ease: "power2.out",
              stagger: 0.08,
            });
          },
        });
      });
    }, menuListRef);

    return () => ctx.revert();
  }, []);

  return (
    <>
      <section className="menu-hero">
        <HeroCollage images={HERO_PHOTOS} />
        <div className="container">
          <Copy type="words" animateOnScroll={false} delay={0.85}>
            <h2>{t.title}</h2>
          </Copy>
        </div>

        <div className="section-footer">
          <Copy type="lines" animateOnScroll={false} delay={1.1}>
            <p className="sm">{t.left}</p>
          </Copy>
          <Copy type="lines" animateOnScroll={false} delay={1.2}>
            <p className="sm">{t.right}</p>
          </Copy>
        </div>
      </section>

      <section className="menu-list" ref={menuListRef}>
        <div className="container">
          {diningMenu.map((category) => {
            const tagline = category.tagline;

            return (
              <div className="menu-category" key={category.id}>
                <div className="menu-category-header">
                  <Copy type="words" animateOnScroll>
                    <h3>{category.category}</h3>
                  </Copy>
                  {tagline && (
                    <Copy type="lines" animateOnScroll>
                      <p className="md">{tagline}</p>
                    </Copy>
                  )}
                </div>

                <MenuGrid items={category.items} tags={dict.diningMenu.tags} />
              </div>
            );
          })}
        </div>

        <DishPreview containerRef={menuListRef} />
      </section>

      <Testimonials />
    </>
  );
}

/* one category's dishes, a few at a time: the first five, then five more
   as the end comes near */
function MenuGrid({ items, tags }) {
  const { count, hasMore, sentinelRef } = useIncremental(items.length);
  return (
    <>
      <div className="menu-grid">
        {items.slice(0, count).map((item, index) => (
          <MenuCard
            key={item.id}
            item={item}
            tags={tags}
            className={`${index % 2 !== 0 ? "alt" : ""} ${index >= LIST_STEP ? "list-item-in" : ""}`}
          />
        ))}
      </div>
      {hasMore && <span className="list-sentinel" ref={sentinelRef} aria-hidden="true" />}
    </>
  );
}

const MenuCard = memo(function MenuCard({ item, tags, className }) {
  return (
    <div className={`menu-grid-card ${className}`} data-dish-image={item.image}>
      {/* phones and touch screens can't hover for the photo, so the card
          carries it */}
      {item.image && (
        <div className="menu-grid-card-img" aria-hidden="true">
          <Photo src={item.image} sizes="(max-width: 999px) 92vw, 30vw" />
        </div>
      )}
      <div className="menu-grid-card-top">
        <h6>
          {item.name}
          <MenuItemTags tags={item.tags} labels={tags} />
        </h6>
        {item.size && <p className="mono">{item.size}</p>}
      </div>

      {item.description && <p>{item.description}</p>}

      <p className="menu-grid-card-price">{item.price}</p>
    </div>
  );
});
