"use client";

import { useLocale } from "@/i18n/LocaleProvider";

import "./Filters.css";

/* a filter is { key, label, options, labels, defaultValue }; `filters`
   holds the chosen value for each key, plus `query` and `sort` */

/* how many filters are off their default (the search too, when it is
   tucked away with them) */
export function activeFilterCount(filters, groups, { withQuery = false } = {}) {
  const set = groups.filter((group) => filters[group.key] !== group.defaultValue).length;
  return set + (withQuery && filters.query?.trim() ? 1 : 0);
}

/* every filter at its default (the search is kept unless asked) */
export function resetFilters(filters, groups, { query = false } = {}) {
  const next = { ...filters };
  groups.forEach((group) => {
    next[group.key] = group.defaultValue;
  });
  if (query) next.query = "";
  return next;
}

/* the funnel button that opens the filters, with how many are set */
export function FilterButton({ count, onClick, className = "" }) {
  const { dict } = useLocale();
  return (
    <button
      type="button"
      className={`rs-filter-button ${count ? "is-set" : ""} ${className}`}
      aria-label={dict.reservations.filterOpen}
      onClick={onClick}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 5h14M6 10h8M8.5 15h3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      {count > 0 && <span className="rs-filter-badge">{count}</span>}
    </button>
  );
}

/* the drawer's contents: the search (when `search` is given), each filter
   as a row of chips, and the sort */
export default function FilterPanel({ filters, onChange, groups, search, sortable = true }) {
  const { dict } = useLocale();
  const t = dict.reservations;
  const set = (key) => (value) => onChange({ ...filters, [key]: value });

  return (
    <div className="rs-panel">
      {search && (
        <label className="rs-group rs-panel-search">
          <span className="rs-label">{search.label ?? t.search}</span>
          <span className="reserve-input">
            <input
              type="search"
              value={filters.query}
              placeholder={search.placeholder ?? t.searchPlaceholder}
              onChange={(event) => set("query")(event.target.value)}
            />
            <span className="reserve-input-line" />
          </span>
        </label>
      )}
      {groups.map((group) => (
        <div className="rs-group" key={group.key}>
          <span className="rs-label">{group.label}</span>
          <div className="rs-chips" role="radiogroup" aria-label={group.label}>
            {group.options.map((option) => (
              <button
                type="button"
                role="radio"
                aria-checked={filters[group.key] === option}
                key={option}
                className={`rs-chip ${filters[group.key] === option ? "active" : ""}`}
                onClick={() => set(group.key)(option)}
              >
                {group.labels[option]}
              </button>
            ))}
          </div>
        </div>
      ))}
      {sortable && (
        <div className="rs-group">
          <span className="rs-label">{t.sort}</span>
          <div className="rs-chips" role="radiogroup" aria-label={t.sort}>
            {["asc", "desc"].map((option) => (
              <button
                type="button"
                role="radio"
                aria-checked={filters.sort === option}
                key={option}
                className={`rs-chip ${filters.sort === option ? "active" : ""}`}
                onClick={() => set("sort")(option)}
              >
                {t.sorts[option]} <span aria-hidden="true">{option === "asc" ? "↑" : "↓"}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
