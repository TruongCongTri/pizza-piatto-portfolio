"use client";

import { Fragment, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useLenis } from "lenis/react";
import gsap from "gsap";

import { useViewTransition } from "@/hooks/useViewTransition";
import { useLocale } from "@/i18n/LocaleProvider";
import { LOCALE_COOKIE, locales, switchLocaleInPath } from "@/i18n/config";
import { RESTAURANT } from "@/lib/restaurant";

import "./Nav.css";

const NAV_LINKS = [
  { key: "home", href: "/", img: "/menu/menu-home.jpg" },
  { key: "essence", href: "/about", img: "/menu/menu-essence.jpg" },
  { key: "carte", href: "/menu", img: "/menu/menu-carte.jpg" },
  { key: "classes", href: "/workshops", img: "/about/sticky-card-5.jpg" },
  { key: "book", href: "/reservation", img: "/menu/menu-book.jpg" },
];

const SOCIAL_LINKS = [
  { label: "Instagram", href: RESTAURANT.links.instagram },
  { label: "Facebook", href: RESTAURANT.links.facebook },
  { label: "Google", href: RESTAURANT.links.googleMaps },
];

const LINK_TEXT_SELECTORS = [".nav-link a", ".nav-social a"];
const FOOTER_TEXT_SELECTORS = [".nav-menu-footer p span"];
const ALL_TEXT_SELECTORS = [...LINK_TEXT_SELECTORS, ...FOOTER_TEXT_SELECTORS];

export default function Nav({ pageRef }) {
  const pathname = usePathname();
  const lenis = useLenis();
  const { navigateWithTransition } = useViewTransition();
  const { locale, dict, localize } = useLocale();
  const t = dict.nav;

  const lenisInstanceRef = useRef(null);
  const isMenuOpenRef = useRef(false);
  const isMenuAnimatingRef = useRef(false);
  const previewImageRef = useRef(null);

  useEffect(() => {
    lenisInstanceRef.current = lenis;
  }, [lenis]);

  useEffect(() => {
    if (isMenuOpenRef.current) forceCloseMenu();
  }, [pathname]);

  function lockScroll() {
    if (lenisInstanceRef.current) lenisInstanceRef.current.stop();
    document.body.style.overflow = "hidden";
  }

  function unlockScroll() {
    document.body.style.overflow = "";
    if (lenisInstanceRef.current) lenisInstanceRef.current.start();
  }

  function prunePreviewImages() {
    const container = previewImageRef.current;
    if (!container) return;
    const images = container.querySelectorAll("img");
    if (images.length > 3) {
      for (let i = 0; i < images.length - 3; i++) {
        container.removeChild(images[i]);
      }
    }
  }

  function resetPreviewImage() {
    const container = previewImageRef.current;
    if (!container) return;
    container.innerHTML = "";
    const defaultImg = document.createElement("img");
    defaultImg.src = NAV_LINKS[0].img;
    container.appendChild(defaultImg);
  }

  function killMenuTextTweens() {
    gsap.killTweensOf(ALL_TEXT_SELECTORS);
  }

  function resetMenuTextToHidden() {
    gsap.set(LINK_TEXT_SELECTORS, { y: "140%", opacity: 0.25 });
    gsap.set(FOOTER_TEXT_SELECTORS, { y: "120%", opacity: 0.25 });
  }

  function animateToggleLabel(isOpening) {
    const openLabel = document.querySelector("#nav-toggle-open");
    const closeLabel = document.querySelector("#nav-toggle-close");

    gsap.to(isOpening ? openLabel : closeLabel, {
      x: -5,
      y: isOpening ? -10 : 10,
      rotation: isOpening ? -5 : 5,
      opacity: 0,
      delay: 0.25,
      duration: 0.5,
      ease: "power2.out",
    });

    gsap.to(isOpening ? closeLabel : openLabel, {
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      delay: 0.5,
      duration: 0.5,
      ease: "power2.out",
    });
  }

  function openMenu() {
    if (isMenuAnimatingRef.current || isMenuOpenRef.current) return;
    isMenuAnimatingRef.current = true;

    const page = pageRef?.current;
    const scrollY = window.scrollY;

    lockScroll();

    if (page) {
      page.style.transformOrigin = `right ${scrollY}px`;

      gsap.to(page, {
        rotation: 10,
        x: 300,
        y: 450,
        scale: 1.5,
        duration: 1.25,
        ease: "power4.inOut",
      });
    }

    animateToggleLabel(true);
    killMenuTextTweens();
    resetMenuTextToHidden();

    gsap.to(".nav-menu-content", {
      rotation: 0,
      x: 0,
      y: 0,
      scale: 1,
      opacity: 1,
      duration: 1.25,
      ease: "power4.inOut",
    });

    gsap.to(ALL_TEXT_SELECTORS, {
      y: "0%",
      opacity: 1,
      delay: 0.75,
      duration: 1,
      ease: "power3.out",
      stagger: 0.1,
    });

    gsap.to(".nav-menu-overlay", {
      clipPath: "polygon(0% 0%, 100% 0%, 100% 175%, 0% 100%)",
      duration: 1.25,
      ease: "power4.inOut",
      onComplete: () => {
        isMenuOpenRef.current = true;
        isMenuAnimatingRef.current = false;
      },
    });
  }

  function closeMenu() {
    if (isMenuAnimatingRef.current || !isMenuOpenRef.current) return;
    isMenuAnimatingRef.current = true;

    const page = pageRef?.current;

    if (page) {
      gsap.to(page, {
        rotation: 0,
        x: 0,
        y: 0,
        scale: 1,
        duration: 1.25,
        ease: "power4.inOut",
        onComplete: () => {
          gsap.set(page, { clearProps: "all" });
          page.style.transformOrigin = "";
        },
      });
    }

    animateToggleLabel(false);
    killMenuTextTweens();

    gsap.to(".nav-menu-content", {
      rotation: -15,
      x: -100,
      y: -100,
      scale: 1.5,
      opacity: 0.25,
      duration: 1.25,
      ease: "power4.inOut",
    });

    gsap.to(".nav-menu-overlay", {
      clipPath: "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)",
      duration: 1.25,
      ease: "power4.inOut",
      onComplete: () => {
        isMenuOpenRef.current = false;
        isMenuAnimatingRef.current = false;
        resetMenuTextToHidden();
        resetPreviewImage();
        unlockScroll();
      },
    });
  }

  function forceCloseMenu() {
    const page = pageRef?.current;
    if (page) {
      gsap.set(page, { clearProps: "all" });
      page.style.transformOrigin = "";
    }

    killMenuTextTweens();

    gsap.set(".nav-menu-overlay", {
      clipPath: "polygon(0% 0%, 100% 0%, 100% 0%, 0% 0%)",
    });
    gsap.set(".nav-menu-content", {
      rotation: -15,
      x: -100,
      y: -100,
      scale: 1.5,
      opacity: 0.25,
    });

    resetMenuTextToHidden();

    gsap.set("#nav-toggle-open", { x: 0, y: 0, rotation: 0, opacity: 1 });
    gsap.set("#nav-toggle-close", { x: -5, y: 10, rotation: 5, opacity: 0 });

    isMenuOpenRef.current = false;
    isMenuAnimatingRef.current = false;
    resetPreviewImage();
    unlockScroll();
  }

  function handleLocaleSwitch(nextLocale) {
    if (nextLocale === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000; samesite=lax`;
    /* the query stays: a class ticket's link carries its key there */
    navigateWithTransition(switchLocaleInPath(pathname, nextLocale) + window.location.search);
  }

  function handleToggle() {
    if (!isMenuOpenRef.current) openMenu();
    else closeMenu();
  }

  function handleLinkHover(imageSrc) {
    if (!isMenuOpenRef.current || isMenuAnimatingRef.current) return;
    const container = previewImageRef.current;
    if (!container || !imageSrc) return;

    const currentImages = container.querySelectorAll("img");
    if (
      currentImages.length > 0 &&
      currentImages[currentImages.length - 1].src.endsWith(imageSrc)
    )
      return;

    const newImg = document.createElement("img");
    newImg.src = imageSrc;
    newImg.style.opacity = "0";
    newImg.style.transform = "scale(1.25) rotate(10deg)";
    container.appendChild(newImg);
    prunePreviewImages();

    gsap.to(newImg, {
      opacity: 1,
      scale: 1,
      rotation: 0,
      duration: 0.75,
      ease: "power2.out",
    });
  }

  return (
    <>
      <nav className="nav-bar">
        <div className="nav-logo">
          <a
            href={localize("/")}
            onClick={(e) => {
              e.preventDefault();
              navigateWithTransition("/");
            }}
          >
            <svg
              width="838"
              height="310"
              viewBox="0 0 838 310"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              role="img"
              aria-label="Pizza Piatto"
            >
              <path
                d="M138.8 56.5Q138.8 69.7 131.8 79.4Q124.9 89 111.8 94.3Q98.6 99.6 80.4 99.6Q68.5 99.6 59.3 97Q50.1 94.4 42.7 89.8L44.2 77.6Q48 80.3 51.5 82.1Q55 83.8 58.8 84.6Q62.6 85.4 67.3 85.4Q74.7 85.4 80.8 82.1Q86.8 78.8 90.5 72.1Q94.1 65.4 94.1 55.3Q94.1 43.6 90.0 35.3Q85.9 26.9 78.9 22.3Q71.9 17.8 62.8 17.8L60.4 17.8L60.4 122.1Q60.4 124.6 61.6 126.3Q62.7 128 65.5 128.6L71.5 129.9Q74.6 130.6 76.0 132.3Q77.3 134 77.3 137.3Q77.3 140.3 75.3 142.1Q73.2 143.9 68.9 143.9L8.4 143.9Q4.1 143.9 2.1 142.1Q0 140.3 0 137.3Q0 132 5.1 130L9 128.6Q11.6 127.6 12.9 126.1Q14.1 124.6 14.1 122.1L14.1 25.7Q14.1 23.2 12.9 21.7Q11.6 20.2 9 19.2L5.1 17.8Q0 15.8 0 10.5Q0 7.4 2.1 5.7Q4.1 3.9 8.4 3.9L64.2 3.9Q88.1 3.9 104.8 10.7Q121.4 17.4 130.1 29.3Q138.8 41.1 138.8 56.5ZM213.4 25.7L213.4 122.1Q213.4 124.6 214.7 126.2Q216 127.7 218.5 128.6L222.3 130Q227.4 132 227.4 137.3Q227.4 140.3 225.3 142.1Q223.3 143.9 219 143.9L161.4 143.9Q157.1 143.9 155.0 142.1Q153 140.3 153 137.3Q153 132 158.1 130L162 128.6Q164.6 127.7 165.8 126.2Q167.1 124.6 167.1 122.1L167.1 25.7Q167.1 23.2 165.8 21.7Q164.6 20.1 162 19.2L158.1 17.8Q153 15.8 153 10.5Q153 7.4 155.0 5.7Q157.1 3.9 161.4 3.9L219 3.9Q223.3 3.9 225.3 5.7Q227.4 7.4 227.4 10.5Q227.4 15.8 222.3 17.8L218.5 19.2Q216 20.1 214.7 21.7Q213.4 23.2 213.4 25.7ZM358.8 19.4L286.2 139L263.2 129.9L315.7 129.9Q320.4 129.9 324.4 128.9Q328.5 127.9 332.2 125.3Q335.9 122.7 339.1 118.0Q342.4 113.2 345.5 105.9L348.4 98.9Q349.7 95.4 352.3 94.3Q354.9 93.3 358 94Q361.5 94.6 362.8 97.1Q364.1 99.5 363.3 103.1L356 136.9Q354.8 142.1 352.3 144.6Q349.8 147 345 147Q342.5 147 339.9 146.3Q337.3 145.5 334.1 144.7Q330.9 143.9 326.4 143.9L244.9 143.9Q241.3 143.9 239.5 142.2Q237.7 140.4 237.7 137.4Q237.7 135.6 238.5 133.3Q239.3 131.1 241.1 128.3L314.2 7.9L318.8 17.9L286.9 17.9Q280.7 17.9 276.3 19.6Q271.8 21.3 268.3 25.6Q264.7 29.9 261.1 37.8L258.5 43Q256.7 46.3 254.1 47.3Q251.6 48.2 249 47.8Q245.7 47.3 244.1 45.1Q242.5 42.9 243.1 39L248 10.9Q249 5.6 251.5 3.2Q254.1 0.8 258.9 0.8Q261.4 0.8 264 1.6Q266.6 2.3 269.8 3.1Q273.1 3.9 277.6 3.9L355 3.9Q358.6 3.9 360.5 5.5Q362.4 7.1 362.4 10.2Q362.4 11.9 361.5 14.2Q360.6 16.5 358.8 19.4ZM490.8 19.4L418.2 139L395.2 129.9L447.7 129.9Q452.4 129.9 456.4 128.9Q460.5 127.9 464.2 125.3Q467.9 122.7 471.1 118.0Q474.4 113.2 477.5 105.9L480.4 98.9Q481.7 95.4 484.3 94.3Q486.9 93.3 490 94Q493.5 94.6 494.8 97.1Q496.1 99.5 495.3 103.1L488 136.9Q486.8 142.1 484.3 144.6Q481.8 147 477 147Q474.5 147 471.9 146.3Q469.3 145.5 466.1 144.7Q462.9 143.9 458.4 143.9L376.9 143.9Q373.3 143.9 371.5 142.2Q369.7 140.4 369.7 137.4Q369.7 135.6 370.5 133.3Q371.3 131.1 373.1 128.3L446.2 7.9L450.8 17.9L418.9 17.9Q412.7 17.9 408.3 19.6Q403.8 21.3 400.3 25.6Q396.7 29.9 393.1 37.8L390.5 43Q388.7 46.3 386.1 47.3Q383.6 48.2 381 47.8Q377.7 47.3 376.1 45.1Q374.5 42.9 375.1 39L380 10.9Q381 5.6 383.6 3.2Q386.1 0.8 390.9 0.8Q393.4 0.8 396 1.6Q398.6 2.3 401.8 3.1Q405.1 3.9 409.6 3.9L487 3.9Q490.6 3.9 492.5 5.5Q494.4 7.1 494.4 10.2Q494.4 11.9 493.5 14.2Q492.6 16.5 490.8 19.4ZM535.5 99L535.7 84.5L593.8 84.5L593.9 99L535.5 99ZM551.6 137.3Q551.6 140.3 549.6 142.1Q547.6 143.9 543.3 143.9L511.2 143.9Q507 143.9 504.9 142.1Q502.9 140.3 502.9 137.3Q502.9 135.1 503.9 133.6Q504.9 132.1 507.3 130.6L509.4 129.3Q512.7 127.3 514.6 124.3Q516.5 121.3 518.7 114L544.4 30.9Q546.2 25 545.7 22.3Q545.2 19.6 541.6 17.9Q538.8 16.5 537.6 14.8Q536.5 13 536.5 10.5Q536.5 7.4 538.6 5.7Q540.7 3.9 545 3.9L609 3.9Q613.3 3.9 615.4 5.7Q617.4 7.4 617.4 10.5Q617.4 13.2 616.1 14.9Q614.9 16.6 612.6 17.7Q610.1 18.9 609.6 20.9Q609.2 22.9 610.6 27.3L638.4 115.4Q640.5 122 642.2 125.1Q643.9 128.2 646.6 129.5Q650.1 131.3 651.3 133.0Q652.4 134.6 652.4 137.3Q652.4 140.3 650.4 142.1Q648.3 143.9 644 143.9L591.1 143.9Q586.7 143.9 584.7 142.1Q582.7 140.3 582.7 137.3Q582.7 134.8 584.0 133.3Q585.2 131.8 587.8 130.6L591 129.1Q593.6 127.9 593.3 125.9Q592.9 123.9 591.5 119.3L561.9 21.4L566.1 18.3L537.3 111.5Q535.7 116.6 535.7 119.8Q535.7 122.9 537.6 125.1Q539.6 127.2 543.9 129.4L546.6 130.8Q548.9 132 550.3 133.4Q551.6 134.8 551.6 137.3ZM138.8 218.3Q138.8 231.5 131.8 241.2Q124.9 250.8 111.8 256.1Q98.6 261.4 80.4 261.4Q68.5 261.4 59.3 258.8Q50.1 256.2 42.7 251.6L44.2 239.4Q48 242.1 51.5 243.9Q55 245.6 58.8 246.4Q62.6 247.2 67.3 247.2Q74.7 247.2 80.8 243.9Q86.8 240.6 90.5 233.9Q94.1 227.2 94.1 217.1Q94.1 205.4 90.0 197.1Q85.9 188.7 78.9 184.2Q71.9 179.6 62.8 179.6L60.4 179.6L60.4 283.9Q60.4 286.4 61.6 288.1Q62.7 289.8 65.5 290.4L71.5 291.7Q74.6 292.4 76.0 294.1Q77.3 295.8 77.3 299.1Q77.3 302.1 75.3 303.9Q73.2 305.7 68.9 305.7L8.4 305.7Q4.1 305.7 2.1 303.9Q0 302.1 0 299.1Q0 293.8 5.1 291.8L9 290.4Q11.6 289.4 12.9 287.9Q14.1 286.4 14.1 283.9L14.1 187.5Q14.1 185.0 12.9 183.5Q11.6 182.0 9 181.0L5.1 179.6Q0 177.6 0 172.3Q0 169.2 2.1 167.5Q4.1 165.7 8.4 165.7L64.2 165.7Q88.1 165.7 104.8 172.5Q121.4 179.2 130.1 191.1Q138.8 202.9 138.8 218.3ZM213.4 187.5L213.4 283.9Q213.4 286.4 214.7 288.0Q216 289.5 218.5 290.4L222.3 291.8Q227.4 293.8 227.4 299.1Q227.4 302.1 225.3 303.9Q223.3 305.7 219 305.7L161.4 305.7Q157.1 305.7 155.0 303.9Q153 302.1 153 299.1Q153 293.8 158.1 291.8L162 290.4Q164.6 289.5 165.8 288.0Q167.1 286.4 167.1 283.9L167.1 187.5Q167.1 185.0 165.8 183.5Q164.6 181.9 162 181.0L158.1 179.6Q153 177.6 153 172.3Q153 169.2 155.0 167.5Q157.1 165.7 161.4 165.7L219 165.7Q223.3 165.7 225.3 167.5Q227.4 169.2 227.4 172.3Q227.4 177.6 222.3 179.6L218.5 181.0Q216 181.9 214.7 183.5Q213.4 185.0 213.4 187.5ZM271.5 260.8L271.7 246.3L329.8 246.3L329.9 260.8L271.5 260.8ZM287.6 299.1Q287.6 302.1 285.6 303.9Q283.6 305.7 279.3 305.7L247.2 305.7Q243 305.7 240.9 303.9Q238.9 302.1 238.9 299.1Q238.9 296.9 239.9 295.4Q240.9 293.9 243.3 292.4L245.4 291.1Q248.7 289.1 250.6 286.1Q252.5 283.1 254.7 275.8L280.4 192.7Q282.2 186.8 281.7 184.1Q281.2 181.4 277.6 179.7Q274.8 178.3 273.6 176.6Q272.5 174.8 272.5 172.3Q272.5 169.2 274.6 167.5Q276.7 165.7 281 165.7L345 165.7Q349.3 165.7 351.4 167.5Q353.4 169.2 353.4 172.3Q353.4 175.0 352.1 176.7Q350.9 178.4 348.6 179.5Q346.1 180.7 345.6 182.7Q345.2 184.7 346.6 189.1L374.4 277.2Q376.5 283.8 378.2 286.9Q379.9 290.0 382.6 291.3Q386.1 293.1 387.3 294.8Q388.4 296.4 388.4 299.1Q388.4 302.1 386.4 303.9Q384.3 305.7 380 305.7L327.1 305.7Q322.7 305.7 320.7 303.9Q318.7 302.1 318.7 299.1Q318.7 296.6 319.9 295.1Q321.2 293.6 323.8 292.4L327 290.9Q329.6 289.7 329.3 287.7Q328.9 285.7 327.5 281.1L297.9 183.2L302.1 180.1L273.3 273.3Q271.7 278.4 271.7 281.6Q271.7 284.7 273.6 286.9Q275.6 289.0 279.9 291.2L282.6 292.6Q284.9 293.8 286.3 295.2Q287.6 296.6 287.6 299.1ZM426.2 165.7L494 165.7Q498.5 165.7 501.8 164.9Q505 164.1 507.6 163.4Q510.1 162.6 512.7 162.6Q517.4 162.6 519.8 164.9Q522.1 167.2 523.6 172.7L530 206.3Q530.8 210.2 529.4 212.7Q527.9 215.1 524.5 215.7Q521.4 216.4 519 215.3Q516.6 214.2 515 210.9Q509 198.9 504.7 192.4Q500.4 185.8 496.6 183.2Q492.9 180.5 488.3 180.5L483.3 180.5L483.3 283.9Q483.3 286.4 484.6 288.0Q485.9 289.5 488.4 290.4L492.2 291.8Q497.3 293.8 497.3 299.1Q497.3 305.7 488.9 305.7L431.3 305.7Q427 305.7 424.9 303.9Q422.9 302.1 422.9 299.1Q422.9 293.8 428 291.8L431.9 290.4Q434.5 289.5 435.8 288.0Q437 286.4 437 283.9L437 180.5L431.9 180.5Q427.4 180.5 423.6 183.2Q419.8 185.8 415.6 192.4Q411.3 199.0 405.3 210.9Q403.6 214.2 401.2 215.3Q398.8 216.4 395.7 215.7Q392.4 215.1 390.9 212.7Q389.5 210.2 390.2 206.3L396.6 172.7Q398.1 167.2 400.4 164.9Q402.8 162.6 407.6 162.6Q410.1 162.6 412.6 163.4Q415.2 164.1 418.4 164.9Q421.7 165.7 426.2 165.7ZM575 165.7L642.8 165.7Q647.3 165.7 650.5 164.9Q653.8 164.1 656.4 163.4Q658.9 162.6 661.5 162.6Q666.2 162.6 668.5 164.9Q670.9 167.2 672.4 172.7L678.8 206.3Q679.6 210.2 678.1 212.7Q676.7 215.1 673.3 215.7Q670.2 216.4 667.8 215.3Q665.4 214.2 663.8 210.9Q657.8 198.9 653.5 192.4Q649.2 185.8 645.5 183.2Q641.7 180.5 637.1 180.5L632.1 180.5L632.1 283.9Q632.1 286.4 633.4 288.0Q634.7 289.5 637.2 290.4L641 291.8Q646.1 293.8 646.1 299.1Q646.1 305.7 637.7 305.7L580.1 305.7Q575.8 305.7 573.8 303.9Q571.7 302.1 571.7 299.1Q571.7 293.8 576.8 291.8L580.7 290.4Q583.3 289.5 584.5 288.0Q585.8 286.4 585.8 283.9L585.8 180.5L580.7 180.5Q576.2 180.5 572.4 183.2Q568.6 185.8 564.4 192.4Q560.1 199.0 554.1 210.9Q552.4 214.2 550 215.3Q547.6 216.4 544.5 215.7Q541.2 215.1 539.8 212.7Q538.3 210.2 539 206.3L545.4 172.7Q546.9 167.2 549.3 164.9Q551.6 162.6 556.4 162.6Q558.9 162.6 561.5 163.4Q564 164.1 567.3 164.9Q570.5 165.7 575 165.7ZM763 161.8Q780.5 161.8 794.3 167.1Q808.2 172.4 817.9 182.3Q827.6 192.2 832.7 206.0Q837.8 219.7 837.8 236.6Q837.8 251.9 832.8 265.2Q827.7 278.5 818.1 288.5Q808.5 298.5 794.8 304.1Q781.2 309.6 764.2 309.6Q746.8 309.6 732.9 304.3Q719.1 299.0 709.3 289.1Q699.6 279.2 694.4 265.5Q689.3 251.7 689.3 234.8Q689.3 219.5 694.4 206.2Q699.5 192.9 709.1 182.9Q718.7 172.9 732.3 167.4Q746 161.8 763 161.8ZM790.3 264.1Q790.3 250.7 788.1 237.8Q786 224.9 782.3 213.7Q778.6 202.4 773.9 193.9Q769.2 185.3 764 180.5Q758.8 175.6 753.7 175.6Q748.3 175.6 744.6 179.2Q741 182.8 739.1 189.8Q737.3 196.8 737.3 207.2Q737.3 220.7 739.4 233.6Q741.6 246.5 745.3 257.8Q749 269.0 753.7 277.6Q758.4 286.1 763.5 291.0Q768.7 295.8 773.9 295.8Q779.4 295.8 783 292.2Q786.6 288.6 788.4 281.6Q790.3 274.6 790.3 264.1Z"
                fill="currentColor"
              />
            </svg>
          </a>
        </div>

        <div className="nav-toggle" onClick={handleToggle}>
          <p id="nav-toggle-open">{t.menu}</p>
          <p id="nav-toggle-close">{t.close}</p>
        </div>
      </nav>

      <div className="nav-menu-overlay">
        <div className="nav-menu-content">
          <div className="nav-menu-items">
            <div className="nav-col-lg">
              <div className="nav-preview-img" ref={previewImageRef}>
                <img src={NAV_LINKS[0].img} alt="" />
              </div>
            </div>

            <div className="nav-col-sm">
              <div className="nav-menu-links">
                {NAV_LINKS.map((link) => {
                  const target = localize(link.href);
                  /* a section's own pages count too (a class under Classes) */
                  const isActive =
                    target === pathname ||
                    (link.href !== "/" && pathname?.startsWith(`${target}/`));
                  return (
                    <div className="nav-link" key={link.key}>
                      <a
                        href={localize(link.href)}
                        className={`hover-line ${isActive ? "is-active" : ""}`}
                        aria-current={isActive ? "page" : undefined}
                        data-img={link.img}
                        onMouseOver={() => handleLinkHover(link.img)}
                        onClick={(e) => {
                          e.preventDefault();
                          navigateWithTransition(link.href);
                        }}
                      >
                        {t[link.key]}
                      </a>
                    </div>
                  );
                })}
              </div>

              <div className="nav-menu-socials">
                {SOCIAL_LINKS.map((social) => (
                  <div className="nav-social" key={social.label}>
                    <a
                      href={social.href}
                      className="hover-line"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {social.label}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="nav-menu-footer">
            <p className="sm">
              <span>{t.since}</span>
            </p>
            <p className="sm">
              <span>{t.location}</span>
            </p>
            <p className="sm nav-locale-switch">
              <span>
                {locales.map((l, index) => (
                  <Fragment key={l}>
                    {index > 0 && (
                      <span className="nav-locale-divider" aria-hidden="true">
                        /
                      </span>
                    )}
                    <a
                      href={switchLocaleInPath(pathname, l)}
                      hrefLang={l}
                      className={`hover-line ${l === locale ? "is-active" : ""}`}
                      aria-current={l === locale ? "true" : undefined}
                      onClick={(e) => {
                        e.preventDefault();
                        handleLocaleSwitch(l);
                      }}
                    >
                      {l.toUpperCase()}
                    </a>
                  </Fragment>
                ))}
              </span>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
