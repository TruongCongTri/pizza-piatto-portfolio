"use client";

import { useEffect, useRef, useState } from "react";

import Button from "@/components/Button/Button";
import Copy from "@/components/Copy/Copy";
import DeskTabs from "@/components/DeskTabs/DeskTabs";
import FilterDrawer from "@/components/Filters/FilterDrawer";
import FilterPanel, {
  activeFilterCount,
  FilterButton,
  resetFilters,
} from "@/components/Filters/FilterPanel";
import { useLocale } from "@/i18n/LocaleProvider";

import "./DeskHeader.css";

/* the top of a staff desk: the desk tabs, the title with the live status,
   sign-out and the main button, then `children` (sample-data tools and
   the like), the counts and the list's filters.

   Scrolling down, the title and counts shrink as they leave, and once the
   whole block is gone a slim copy of it pins under the nav: the tabs, the
   title, the live time, the counts and the button, small, with the
   filters behind a filter button (`panel`: { filters, onChange, groups,
   search, summary }). Back at the top it all returns to full size. */
export default function DeskHeader({
  current,
  eyebrow,
  title,
  liveText,
  offline,
  onSignOut,
  action,
  stats,
  filters,
  panel,
  children,
}) {
  const { dict } = useLocale();
  const blockRef = useRef(null);
  const [pinned, setPinned] = useState(false);
  /* the pinned bar's filters: a panel dropping from the button on a tablet
     or desktop, the bottom drawer on a phone */
  const [filtersOpen, setFiltersOpen] = useState(null);
  const actionsRef = useRef(null);
  const pinnedRef = useRef(null);

  /* the pinned bar's height, for what sticks under it (the class list,
     a class's or guest's heading) */
  useEffect(() => {
    const bar = pinnedRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const publish = () => root.style.setProperty("--desk-pinned-h", `${bar.offsetHeight}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--desk-pinned-h");
    };
  }, []);

  useEffect(() => {
    const block = blockRef.current;
    if (!block) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = block.getBoundingClientRect();
      const navBottom = window.innerWidth <= 900 ? 76 : 88;
      /* 0 at the top of the page, 1 once the block has scrolled away */
      const progress = Math.min(1, Math.max(0, (navBottom - rect.top) / Math.max(1, rect.height)));
      block.style.setProperty("--desk-shrink", progress.toFixed(3));
      setPinned(rect.bottom < navBottom);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  /* the dropdown closes on a click outside it, on Escape, and when the
     pinned bar goes away */
  useEffect(() => {
    if (filtersOpen !== "dropdown") return;
    const handlePointer = (event) => {
      if (!actionsRef.current?.contains(event.target)) setFiltersOpen(null);
    };
    const handleKey = (event) => {
      if (event.key === "Escape") setFiltersOpen(null);
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [filtersOpen]);

  useEffect(() => {
    if (!pinned) setFiltersOpen((open) => (open === "dropdown" ? null : open));
  }, [pinned]);

  const toggleFilters = () =>
    setFiltersOpen((open) => (open ? null : window.innerWidth > 900 ? "dropdown" : "drawer"));
  const resetPanel = () =>
    panel.onChange(resetFilters(panel.filters, panel.groups, { query: true }));

  const live = liveText ? (
    <p className={`mono desk-live ${offline ? "is-offline" : ""}`}>
      <span className="desk-live-dot" aria-hidden="true" />
      {liveText}
    </p>
  ) : null;
  const filterCount = panel ? activeFilterCount(panel.filters, panel.groups, { withQuery: true }) : 0;

  return (
    <>
      <div className="desk-top-block" ref={blockRef}>
        <DeskTabs current={current} />
        <header className="desk-head">
          {/* revealed on arrival like the other pages' titles */}
          <div className="desk-title">
            <Copy type="lines" animateOnScroll={false} delay={0.6}>
              <p className="mono">{eyebrow}</p>
            </Copy>
            <Copy type="words" animateOnScroll={false} delay={0.75}>
              <h3>{title}</h3>
            </Copy>
          </div>
          <div className="desk-status">
            {live}
            {onSignOut && (
              <button type="button" className="hover-line desk-signout" onClick={onSignOut}>
                {dict.admin.signOut}
              </button>
            )}
            {action && (
              <Button type="button" onClick={action.onClick}>
                {action.label}
              </Button>
            )}
          </div>
        </header>

        {children}

        {stats && (
          <div className="desk-stats">
            {stats.map(({ key, label, value }) => (
              <div className="desk-stat" key={key}>
                <span className="desk-stat-value">{value}</span>
                <p className="mono">{label}</p>
              </div>
            ))}
          </div>
        )}

        {filters}
      </div>

      <div
        className={`desk-pinned ${pinned ? "is-shown" : ""}`}
        aria-hidden={!pinned}
        inert={!pinned}
        ref={pinnedRef}
      >
        <div className="desk-pinned-inner">
          <div className="desk-pinned-head">
            <p className="desk-pinned-title">{title}</p>
            {live}
          </div>
          <DeskTabs current={current} className="is-small" />
          {stats && (
            <div className="desk-pinned-stats">
              {stats.map(({ key, label, value }) => (
                <p key={key}>
                  <span className="desk-pinned-value">{value}</span>
                  <span className="mono">{label}</span>
                </p>
              ))}
            </div>
          )}
          <div className="desk-pinned-actions" ref={actionsRef}>
            {panel && <FilterButton count={filterCount} onClick={toggleFilters} />}
            {action && (
              <button type="button" className="rs-chip active desk-pinned-action" onClick={action.onClick}>
                {action.label}
              </button>
            )}
            {panel && filtersOpen === "dropdown" && (
              <div className="desk-filter-drop" role="dialog" aria-label={dict.reservations.filterTitle} data-lenis-prevent>
                <div className="desk-filter-drop-body">
                  <FilterPanel
                    filters={panel.filters}
                    onChange={panel.onChange}
                    groups={panel.groups}
                    search={panel.search ?? {}}
                    sortable={panel.sortable ?? true}
                  />
                </div>
                <div className="rs-drawer-foot">
                  {panel.summary && <p className="mono rs-drawer-summary">{panel.summary}</p>}
                  <button type="button" className="hover-line rs-drawer-reset" onClick={resetPanel}>
                    {dict.reservations.reset}
                  </button>
                  <button type="button" className="rs-chip active rs-drawer-done" onClick={() => setFiltersOpen(null)}>
                    {dict.reservations.done}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {panel && (
        <FilterDrawer
          open={filtersOpen === "drawer"}
          onClose={() => setFiltersOpen(null)}
          onReset={resetPanel}
          summary={panel.summary}
        >
          <FilterPanel
            filters={panel.filters}
            onChange={panel.onChange}
            groups={panel.groups}
            search={panel.search ?? {}}
            sortable={panel.sortable ?? true}
          />
        </FilterDrawer>
      )}
    </>
  );
}
