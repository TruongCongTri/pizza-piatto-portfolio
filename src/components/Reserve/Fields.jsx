"use client";

import "./Reserve.css";

/* labelled field with the masked reveal wrapper used by the reserve popup;
   the right side of the label shows `hint` ("( Optional )") until there is
   an `error` to slide in */
export function FieldShell({ field, label, hint, error, children }) {
  return (
    <div
      className={`reserve-field reserve-mask ${error ? "has-error" : ""}`}
      data-field={field}
    >
      <div className="reserve-reveal">
        <div className="reserve-label">
          <span className="mono">{label}</span>
          <span className="mono reserve-label-side">
            {hint && <span className="reserve-hint">{hint}</span>}
            <span className="reserve-warning" aria-live="polite">
              {error || " "}
            </span>
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

/* bare text input (or textarea) on an animated underline */
export function TextField({
  field,
  label,
  hint,
  error,
  value,
  onChange,
  multiline = false,
  ...inputProps
}) {
  const Input = multiline ? "textarea" : "input";
  return (
    <FieldShell field={field} label={label} hint={hint} error={error}>
      <label className="reserve-input">
        <span className="visually-hidden">{label}</span>
        <Input
          name={field}
          value={value}
          rows={multiline ? 2 : undefined}
          aria-invalid={Boolean(error)}
          onChange={(e) => onChange(field, e.target.value)}
          {...inputProps}
        />
        <span className="reserve-input-line" />
      </label>
    </FieldShell>
  );
}
