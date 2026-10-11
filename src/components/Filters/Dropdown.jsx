"use client";

import { useEffect, useId, useRef, useState } from "react";

import "./Filters.css";

/* a select in the desks' own style: a chip naming the filter and its
   choice, opening a short list. Arrow keys move through the list, Enter
   or a click picks, Escape or a click outside closes. */
export default function Dropdown({ label, options, labels, value, onChange, isDefault }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    /* start on the chosen option */
    const current = listRef.current?.querySelector('[aria-selected="true"]');
    current?.focus();
    return () => document.removeEventListener("pointerdown", handlePointer);
  }, [open]);

  const pick = (option) => {
    onChange(option);
    setOpen(false);
    rootRef.current?.querySelector(".rs-select")?.focus();
  };

  const handleListKey = (event) => {
    const items = [...(listRef.current?.querySelectorAll("button") ?? [])];
    const index = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[Math.min(items.length - 1, index + 1)]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[Math.max(0, index - 1)]?.focus();
    } else if (event.key === "Escape" || event.key === "Tab") {
      setOpen(false);
      if (event.key === "Escape") rootRef.current?.querySelector(".rs-select")?.focus();
    }
  };

  return (
    <div className={`rs-dropdown ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className={`rs-select ${isDefault ? "" : "is-set"}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="rs-select-label">{label}</span>
        <span className="rs-select-value">{labels[value]}</span>
        <svg className="rs-select-chevron" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </button>
      {open && (
        <div className="rs-options" role="listbox" id={listId} aria-label={label} ref={listRef} onKeyDown={handleListKey}>
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              key={option}
              className={`rs-option ${option === value ? "is-selected" : ""}`}
              onClick={() => pick(option)}
            >
              {labels[option]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
