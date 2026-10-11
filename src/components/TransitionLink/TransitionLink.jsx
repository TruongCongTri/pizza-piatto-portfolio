"use client";

import { useViewTransition } from "@/hooks/useViewTransition";
import { useLocale } from "@/i18n/LocaleProvider";

/* an internal link that changes page with the site's page transition,
   like the menu's links. A click with a modifier key (or the middle
   button) still opens the plain link, in a new tab or window. */
export default function TransitionLink({ href, onClick, children, ...rest }) {
  const { localize } = useLocale();
  const { navigateWithTransition } = useViewTransition();

  const handleClick = (event) => {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    navigateWithTransition(href);
  };

  return (
    <a href={localize(href)} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
