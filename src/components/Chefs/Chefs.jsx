"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";

import Photo from "@/components/Photo/Photo";
import { useLocale } from "@/i18n/LocaleProvider";

import "./Chefs.css";

const MOBILE_BREAKPOINT = 1000;

/* moments of the chef-owner, Phuong Huynh; the hover caption and alt text
   for each live in dict.chefs.moments[id] (captions stay under ~11
   characters so they fit the heading on one line) */
const CHEFS = [
  { id: "portrait", image: "/chefs/avatar1.jpg" },
  { id: "owner", image: "/chefs/avatar2.jpg" },
  { id: "class", image: "/chefs/avatar3.jpg" },
  { id: "teacher", image: "/chefs/avatar4.jpg" },
  { id: "sigep2025", image: "/chefs/avatar5.jpg" },
  { id: "sigep2026", image: "/chefs/avatar6.jpg" },
  { id: "dough", image: "/chefs/avatar7.jpg" },
  { id: "since", image: "/chefs/avatar8.jpg" },
];

const SplitChars = ({ text, headingRef }) => (
  <h1 ref={headingRef}>
    {text.split("").map((char, index) => (
      <span className="letter" key={index}>
        {char === " " ? "\u00A0" : char}
      </span>
    ))}
  </h1>
);

const Chefs = () => {
  const sectionRef = useRef(null);
  const avatarContainerRef = useRef(null);
  const avatarRefs = useRef([]);
  const chefNameRefs = useRef([]);
  const defaultHeadingRef = useRef(null);
  const { dict } = useLocale();
  const t = dict.chefs;

  useEffect(() => {
    const avatarContainer = avatarContainerRef.current;
    const avatars = avatarRefs.current.filter(Boolean);
    const chefNames = chefNameRefs.current.filter(Boolean);
    const defaultHeading = defaultHeadingRef.current;

    if (!defaultHeading || !avatars.length) return;

    const defaultLetters = defaultHeading.querySelectorAll(".letter");
    gsap.set(defaultLetters, { y: "0%" });

    let avatarHandlers = [];
    let handleContainerEnter = null;
    let handleContainerLeave = null;

    const enableHoverInteractions = () => {
      avatars.forEach((avatar, index) => {
        const nameElement = chefNames[index];
        if (!nameElement) return;

        const nameLetters = nameElement.querySelectorAll(".letter");

        const handleAvatarEnter = () => {
          gsap.to(avatar, {
            width: 120,
            height: 120,
            duration: 0.5,
            ease: "power4.out",
          });

          gsap.to(defaultLetters, {
            y: "-110%",
            duration: 0.75,
            ease: "power4.out",
            stagger: { each: 0.025, from: "center" },
          });

          gsap.to(nameLetters, {
            y: "0%",
            duration: 0.75,
            ease: "power4.out",
            stagger: { each: 0.025, from: "center" },
          });
        };

        const handleAvatarLeave = () => {
          gsap.to(avatar, {
            width: 70,
            height: 70,
            duration: 0.5,
            ease: "power4.out",
          });

          gsap.to(nameLetters, {
            y: "110%",
            duration: 0.75,
            ease: "power4.out",
            stagger: { each: 0.025, from: "center" },
          });
        };

        avatar.addEventListener("mouseenter", handleAvatarEnter);
        avatar.addEventListener("mouseleave", handleAvatarLeave);
        avatarHandlers.push({
          element: avatar,
          onEnter: handleAvatarEnter,
          onLeave: handleAvatarLeave,
        });
      });

      handleContainerEnter = () => {
        gsap.to(defaultLetters, {
          y: "-110%",
          duration: 0.75,
          ease: "power4.out",
          stagger: { each: 0.025, from: "center" },
        });
      };

      handleContainerLeave = () => {
        chefNames.forEach((name) => {
          const letters = name.querySelectorAll(".letter");
          gsap.to(letters, {
            y: "110%",
            duration: 0.75,
            ease: "power4.out",
            stagger: { each: 0.025, from: "center" },
          });
        });

        gsap.to(defaultLetters, {
          y: "0%",
          duration: 0.75,
          ease: "power4.out",
          stagger: { each: 0.025, from: "center" },
        });
      };

      avatarContainer.addEventListener("mouseenter", handleContainerEnter);
      avatarContainer.addEventListener("mouseleave", handleContainerLeave);
    };

    /* phones have no hover: a tap shows that moment's caption (and a tap
       on the same photo again goes back to the title) */
    let activeIndex = null;
    let tapHandlers = [];
    const lettersOf = (element) => element.querySelectorAll(".letter");
    const showCaption = (index) => {
      const ease = { duration: 0.75, ease: "power4.out", stagger: { each: 0.025, from: "center" } };
      chefNames.forEach((name, nameIndex) => {
        if (nameIndex !== index) gsap.to(lettersOf(name), { y: "110%", ...ease });
      });
      gsap.to(defaultLetters, { y: index === null ? "0%" : "-110%", ...ease });
      if (index !== null) gsap.to(lettersOf(chefNames[index]), { y: "0%", ...ease });
      avatars.forEach((avatar, avatarIndex) => {
        avatar.classList.toggle("is-active", avatarIndex === index);
        avatar.setAttribute("aria-pressed", String(avatarIndex === index));
      });
    };

    const enableTapInteractions = () => {
      avatars.forEach((avatar, index) => {
        const handleTap = () => {
          activeIndex = activeIndex === index ? null : index;
          showCaption(activeIndex);
        };
        avatar.addEventListener("click", handleTap);
        tapHandlers.push({ element: avatar, handleTap });
      });
    };

    const disableTapInteractions = () => {
      tapHandlers.forEach(({ element, handleTap }) => element.removeEventListener("click", handleTap));
      tapHandlers = [];
      activeIndex = null;
      avatars.forEach((avatar) => {
        avatar.classList.remove("is-active");
        avatar.removeAttribute("aria-pressed");
      });
      gsap.set(defaultLetters, { y: "0%" });
      chefNames.forEach((name) => gsap.set(lettersOf(name), { y: "110%" }));
    };

    const disableHoverInteractions = () => {
      avatarHandlers.forEach(({ element, onEnter, onLeave }) => {
        element.removeEventListener("mouseenter", onEnter);
        element.removeEventListener("mouseleave", onLeave);
      });
      avatarHandlers = [];

      if (handleContainerEnter) {
        avatarContainer.removeEventListener("mouseenter", handleContainerEnter);
        handleContainerEnter = null;
      }
      if (handleContainerLeave) {
        avatarContainer.removeEventListener("mouseleave", handleContainerLeave);
        handleContainerLeave = null;
      }

      // Reset all letters and avatar sizes to default state
      gsap.set(defaultLetters, { y: "0%" });
      chefNames.forEach((name) => {
        const letters = name.querySelectorAll(".letter");
        gsap.set(letters, { y: "110%" });
      });
      avatars.forEach((avatar) => {
        gsap.set(avatar, { clearProps: "width,height" });
      });
    };

    let wasDesktop = window.innerWidth >= MOBILE_BREAKPOINT;

    const handleResize = () => {
      const isDesktop = window.innerWidth >= MOBILE_BREAKPOINT;
      if (isDesktop !== wasDesktop) {
        wasDesktop = isDesktop;
        if (isDesktop) {
          disableTapInteractions();
          enableHoverInteractions();
        } else {
          disableHoverInteractions();
          enableTapInteractions();
        }
      }
    };

    if (wasDesktop) {
      enableHoverInteractions();
    } else {
      enableTapInteractions();
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      disableHoverInteractions();
      disableTapInteractions();
    };
  }, []);

  return (
    <section className="chefs" ref={sectionRef}>
      <div className="chefs-avatars" ref={avatarContainerRef}>
        {CHEFS.map((chef, index) => (
          <button
            type="button"
            className="chefs-avatar"
            key={chef.id}
            aria-label={t.moments[chef.id].label}
            ref={(el) => (avatarRefs.current[index] = el)}
          >
            <Photo src={chef.image} alt={t.moments[chef.id].alt} sizes="(max-width: 999px) 25vw, 120px" width={400} height={400} />
          </button>
        ))}
      </div>

      <div className="chefs-names">
        <div className="chefs-name chefs-name--default" ref={defaultHeadingRef}>
          <SplitChars text={t.title} />
        </div>
        {CHEFS.map((chef, index) => (
          <div
            className="chefs-name"
            key={chef.id}
            aria-hidden="true"
            ref={(el) => (chefNameRefs.current[index] = el)}
          >
            <SplitChars text={t.moments[chef.id].label} />
          </div>
        ))}
      </div>

      <div className="section-footer">
        <p className="sm">{t.left}</p>
        <p className="sm">{t.right}</p>
      </div>
    </section>
  );
};

export default Chefs;
