"use client";

import { forwardRef, useRef, useEffect, useCallback } from "react";
import gsap from "gsap";

import { useViewTransition } from "@/hooks/useViewTransition";
import { useLocale } from "@/i18n/LocaleProvider";

import "./Button.css";

const MOBILE_BREAKPOINT = 1000;

const Button = forwardRef(
  (
    { href = "#", type, children, className = "", onClick, disabled = false },
    ref,
  ) => {
    const buttonRef = useRef(null);
    const hoverTimelineRef = useRef(null);
    const { navigateWithTransition } = useViewTransition();
    const { localize } = useLocale();

    const buttonText = typeof children === "string" ? children : "";
    const characters = buttonText.split("");

    /* merge forwarded ref with internal ref */
    const mergeRefs = useCallback(
      (node) => {
        buttonRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) ref.current = node;
      },
      [ref],
    );

    /* character hover animation on desktop; on a touch screen the same
       roll plays on a tap */
    useEffect(() => {
      const button = buttonRef.current;
      if (!button) return;

      const defaultChars = button.querySelectorAll(".char-default");
      const hoverChars = button.querySelectorAll(".char-hover");

      gsap.set(defaultChars, { yPercent: 0 });
      gsap.set(hoverChars, { yPercent: -100 });

      const handleMouseEnter = () => {
        if (hoverTimelineRef.current) hoverTimelineRef.current.kill();

        const tl = gsap.timeline();
        tl.to(
          defaultChars,
          {
            yPercent: 100,
            duration: 0.3,
            ease: "power3.out",
            stagger: 0.01,
          },
          0,
        );
        tl.to(
          hoverChars,
          {
            yPercent: 0,
            duration: 0.3,
            ease: "power3.out",
            stagger: 0.01,
          },
          0.1,
        );

        hoverTimelineRef.current = tl;
      };

      const handleMouseLeave = () => {
        if (hoverTimelineRef.current) hoverTimelineRef.current.kill();

        const tl = gsap.timeline();
        tl.to(
          hoverChars,
          {
            yPercent: -100,
            duration: 0.4,
            ease: "power3.inOut",
            stagger: 0.01,
          },
          0,
        );
        tl.to(
          defaultChars,
          {
            yPercent: 0,
            duration: 0.4,
            ease: "power3.inOut",
            stagger: 0.01,
          },
          0.15,
        );

        hoverTimelineRef.current = tl;
      };

      let isHoverActive = false;

      const enableHover = () => {
        if (isHoverActive) return;
        button.addEventListener("mouseenter", handleMouseEnter);
        button.addEventListener("mouseleave", handleMouseLeave);
        isHoverActive = true;
      };

      const disableHover = () => {
        if (!isHoverActive) return;
        button.removeEventListener("mouseenter", handleMouseEnter);
        button.removeEventListener("mouseleave", handleMouseLeave);
        gsap.set(defaultChars, { yPercent: 0 });
        gsap.set(hoverChars, { yPercent: -100 });
        if (hoverTimelineRef.current) hoverTimelineRef.current.kill();
        isHoverActive = false;
      };

      const handleResize = () => {
        if (window.innerWidth < MOBILE_BREAKPOINT) {
          disableHover();
        } else {
          enableHover();
        }
      };

      /* a tap: the letters roll and the button presses in, then both come
         back once the finger lifts */
      let releaseTimer;
      const handlePress = (event) => {
        if (event.pointerType === "mouse") return;
        clearTimeout(releaseTimer);
        button.classList.add("is-pressed");
        handleMouseEnter();
      };
      const handleRelease = (event) => {
        if (event.pointerType === "mouse") return;
        clearTimeout(releaseTimer);
        releaseTimer = setTimeout(() => {
          button.classList.remove("is-pressed");
          handleMouseLeave();
        }, 220);
      };

      handleResize();
      window.addEventListener("resize", handleResize);
      button.addEventListener("pointerdown", handlePress);
      button.addEventListener("pointerup", handleRelease);
      button.addEventListener("pointercancel", handleRelease);

      return () => {
        disableHover();
        clearTimeout(releaseTimer);
        window.removeEventListener("resize", handleResize);
        button.removeEventListener("pointerdown", handlePress);
        button.removeEventListener("pointerup", handleRelease);
        button.removeEventListener("pointercancel", handleRelease);
        if (hoverTimelineRef.current) hoverTimelineRef.current.kill();
      };
    }, []);

    const handleClick = (e) => {
      if (onClick) onClick(e);
      if (type || e.defaultPrevented) return;
      if (href && href !== "#" && href.startsWith("/")) {
        e.preventDefault();
        navigateWithTransition(href);
      }
    };

    /* `type` renders a native <button> (e.g. form submit) instead of a link */
    const Tag = type ? "button" : "a";
    const tagProps = type ? { type, disabled } : { href: localize(href) };

    return (
      <Tag
        {...tagProps}
        className={`slide-button ${className}`}
        ref={mergeRefs}
        onClick={handleClick}
      >
        <div className="slide-button-bg" />
        <span className="slide-button-text">
          {characters.map((char, index) => (
            <span key={index} className="slide-char">
              <span className="char-default">
                {char === " " ? "\u00A0" : char}
              </span>
              <span className="char-hover">
                {char === " " ? "\u00A0" : char}
              </span>
            </span>
          ))}
        </span>
      </Tag>
    );
  },
);

Button.displayName = "Button";

export default Button;
