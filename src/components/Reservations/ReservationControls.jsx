"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLenis } from "lenis/react";

import Dropdown from "@/components/Filters/Dropdown";
import FilterDrawer from "@/components/Filters/FilterDrawer";
import FilterPanel, {
  activeFilterCount,
  FilterButton,
  resetFilters,
} from "@/components/Filters/FilterPanel";
import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate } from "@/i18n/format";

import "../Reserve/Reserve.css";
import "./Reservations.css";

/* the count keeps room for up to three digits */
const WIDEST_COUNT = 999;

/* text that always takes the width of its widest variant, so switching
   between them never nudges its neighbours */
function Steady({ variants, align = "start", children }) {
  return (
    <span className={`rs-steady align-${align}`}>
      {variants.map((variant) => (
        <span key={variant} className="rs-steady-sizer" aria-hidden="true">
          {variant}
        </span>
      ))}
      <span>{children}</span>
    </span>
  );
}

/* the reservation lists' filters: show (view), status and type (kind),
   each defaulting to its first option */
export function listGroups(t, { views, statuses, kinds }) {
  return [
    views && { key: "view", label: t.show, options: views, labels: t.filters },
    statuses && { key: "status", label: t.status, options: statuses, labels: t.statuses },
    kinds && { key: "kind", label: t.kind, options: kinds, labels: t.kinds },
  ]
    .filter(Boolean)
    .map((group) => ({ ...group, defaultValue: group.options[0] }));
}

/* the list's search, filters and sort. On a desktop or tablet they share
   one line, each filter a dropdown; on a phone the search stays and the
   filters move into a drawer behind a filter button. `filters` is
   { query, sort, ...one value per filter }; the filters come from
   `groups` ([{ key, label, options, labels }], the first option being the
   default) or, for the reservation lists, from `views` / `statuses` /
   `kinds` (kinds also counts "bookings" rather than "reservations").
   `search` names the search box ({ label, placeholder }), or is false for
   none. `sticky` keeps the bar under the nav once scrolled past. */
export default function ReservationControls({
  filters,
  onChange,
  views,
  statuses,
  kinds,
  groups: customGroups,
  search,
  countLabels,
  count,
  sticky = true,
}) {
  const { dict } = useLocale();
  const base = dict.reservations;
  const t = countLabels
    ? { ...base, countOne: countLabels.one, countOther: countLabels.other }
    : kinds
      ? { ...base, countOne: base.bookingOne, countOther: base.bookingOther }
      : base;
  const groups = customGroups ?? listGroups(base, { views, statuses, kinds });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const lenis = useLenis();
  const barRef = useRef(null);
  const stuckRef = useRef(false);
  const realignRef = useRef(false);
  const [isStuck, setIsStuck] = useState(false);

  const stickTop = () => parseFloat(getComputedStyle(barRef.current).top) || 0;

  /* where the bar sits in the page when not stuck: measured with sticking
     switched off for a moment, inside one frame so nothing flickers */
  const naturalTop = () => {
    const bar = barRef.current;
    bar.style.position = "static";
    const top = bar.getBoundingClientRect().top + window.scrollY;
    bar.style.position = "";
    return top;
  };

  useEffect(() => {
    if (!sticky) return;
    const update = () => {
      if (!barRef.current) return;
      /* stuck = held at its offset (or pushed past it at the list's end) */
      const stuck = barRef.current.getBoundingClientRect().top <= stickTop() + 0.5;
      stuckRef.current = stuck;
      setIsStuck(stuck);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [sticky]);

  /* while the bar is stuck, new results start right under it instead of
     wherever the old list had been scrolled to */
  useLayoutEffect(() => {
    if (!realignRef.current) return;
    realignRef.current = false;
    const target = naturalTop() - stickTop();
    if (lenis) lenis.scrollTo(target, { immediate: true, force: true });
    else window.scrollTo(0, target);
  }, [filters]);

  const change = (next) => {
    realignRef.current = stuckRef.current;
    onChange(next);
  };
  const set = (key) => (value) => change({ ...filters, [key]: value });
  const countLabel =
    count === 1 ? t.countOne : fillTemplate(t.countOther, { count });

  return (
    <div
      className={`rs-bar ${sticky ? "is-sticky" : ""} ${isStuck ? "is-stuck" : ""}`}
      ref={barRef}
    >
      <div className={`rs-controls ${search === false ? "is-searchless" : ""}`}>
        {search !== false && (
          <label className="rs-search">
            <span className="rs-label rs-search-label">{search?.label ?? t.search}</span>
            <span className="reserve-input">
              <svg className="rs-search-icon" viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="m13 13 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                type="search"
                value={filters.query}
                placeholder={search?.placeholder ?? t.searchPlaceholder}
                aria-label={search?.label ?? t.search}
                onChange={(e) => set("query")(e.target.value)}
              />
              <span className="reserve-input-line" />
            </span>
          </label>
        )}

        <div className="rs-inline-filters">
          {groups.map((group) => (
            <Dropdown
              key={group.key}
              label={group.label}
              options={group.options}
              labels={group.labels}
              value={filters[group.key]}
              isDefault={filters[group.key] === group.defaultValue}
              onChange={set(group.key)}
            />
          ))}
          <button
            type="button"
            className="rs-chip rs-sort"
            aria-label={`${t.sort}: ${t.sorts[filters.sort]}`}
            onClick={() => set("sort")(filters.sort === "asc" ? "desc" : "asc")}
          >
            <Steady variants={[t.sorts.asc, t.sorts.desc]}>
              {t.sorts[filters.sort]}
            </Steady>
            <span aria-hidden="true">{filters.sort === "asc" ? "↑" : "↓"}</span>
          </button>
        </div>

        <FilterButton
          className="rs-drawer-toggle"
          count={activeFilterCount(filters, groups)}
          onClick={() => setDrawerOpen(true)}
        />

        <p className="rs-count" aria-live="polite">
          <Steady
            align="end"
            variants={[
              fillTemplate(t.countOther, { count: WIDEST_COUNT }),
              t.countOne,
            ]}
          >
            {countLabel}
          </Steady>
        </p>
      </div>

      <FilterDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onReset={() => change(resetFilters(filters, groups))}
        summary={countLabel}
      >
        <FilterPanel filters={filters} onChange={change} groups={groups} />
      </FilterDrawer>
    </div>
  );
}
