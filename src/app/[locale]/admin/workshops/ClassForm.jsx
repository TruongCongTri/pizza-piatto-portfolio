"use client";

import { useState } from "react";

import Button from "@/components/Button/Button";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import { FieldShell, TextField } from "@/components/Reserve/Fields";
import { useToast } from "@/components/Toast/ToastProvider";
import { useLocale } from "@/i18n/LocaleProvider";
import {
  DEFAULT_BOOKING_CLOSES_HOURS,
  DEFAULT_REFUND_UNTIL_HOURS,
  localized,
} from "@/lib/workshops";

const JSON_HEADERS = { "Content-Type": "application/json" };
const LANGS = ["vi", "en"];
const STATUSES = ["draft", "published", "cancelled"];
/* bilingual fields: [key, rows] (0 rows: a single line) */
const TEXTS = [
  ["title", 0],
  ["summary", 2],
  ["description", 6],
  ["learn", 4],
  ["location", 0],
];
const pair = (field) => ({ vi: field?.vi ?? "", en: field?.en ?? "" });

/* a stored class as editable fields (lists as one line per item); also
   what a save sends, since a save replaces the whole class */
export function toInput(workshop) {
  return {
    title: pair(workshop.title),
    summary: pair(workshop.summary),
    description: pair(workshop.description),
    learn: {
      vi: (workshop.learn?.vi ?? []).join("\n"),
      en: (workshop.learn?.en ?? []).join("\n"),
    },
    location: pair(workshop.location),
    recap: { text: pair(workshop.recap?.text) },
    sessions: (workshop.sessions ?? []).map((session) => ({ ...session })),
    capacity: String(workshop.capacity ?? ""),
    price: String(workshop.price ?? ""),
    instructor: workshop.instructor ?? "",
    cover: workshop.cover ?? "",
    bookingClosesHours: String(workshop.bookingClosesHours ?? DEFAULT_BOOKING_CLOSES_HOURS),
    refundUntilHours: String(workshop.refundUntilHours ?? DEFAULT_REFUND_UNTIL_HOURS),
    status: workshop.status ?? "draft",
    source: workshop.source ?? "",
  };
}

const EMPTY = toInput({ sessions: [{ date: "", start: "", end: "" }] });

/* creates or edits a class. Cancelling a class (and deleting one nobody
   booked) asks first. */
/* `bare` drops the form's own heading, for a popup that has one; its
   close link then sits beside the save button */
export default function ClassForm({ workshop, hasBookings, bare = false, onSaved, onDeleted, onClose, onSignedOut }) {
  const { locale, dict } = useLocale();
  const t = dict.classDesk;
  const f = t.form;
  const { toast } = useToast();
  const [draft, setDraft] = useState(() => (workshop ? toInput(workshop) : EMPTY));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  /* null | "cancelClass" | "deleteClass" */
  const [confirm, setConfirm] = useState(null);

  const set = (field, value) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };
  const setText = (field, lang, value) => set(field, { ...draft[field], [lang]: value });
  const setSession = (index, key, value) =>
    set(
      "sessions",
      draft.sessions.map((session, i) => (i === index ? { ...session, [key]: value } : session)),
    );
  const errorText = (field) => (errors[field] ? f.errors[errors[field]] ?? f.errors.invalid : undefined);

  const failToast = () =>
    toast({ tone: "error", eyebrow: t.toasts.errorEyebrow, title: t.toasts.errorTitle, message: t.toasts.errorMessage });

  async function save(status = draft.status) {
    if (saving) return;
    /* turning a live class off refunds everyone: that needs a yes first */
    if (workshop && status === "cancelled" && workshop.status !== "cancelled" && confirm !== "cancelClass") {
      setConfirm("cancelClass");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        workshop ? `/api/admin/workshops/${encodeURIComponent(workshop.id)}` : "/api/admin/workshops",
        {
          method: workshop ? "PATCH" : "POST",
          headers: JSON_HEADERS,
          body: JSON.stringify({ ...draft, status }),
        },
      );
      if (response.status === 401) return onSignedOut();
      const data = await response.json().catch(() => ({}));
      setConfirm(null);
      if (response.status === 422 && data.fields) {
        setErrors(data.fields);
        return;
      }
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      setDraft(toInput(data.workshop));
      toast({
        eyebrow: workshop ? t.toasts.savedEyebrow : t.toasts.createdEyebrow,
        title: localized(data.workshop.title, locale),
      });
      onSaved(data.workshop);
    } catch {
      failToast();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/workshops/${encodeURIComponent(workshop.id)}`, {
        method: "DELETE",
      });
      if (response.status === 401) return onSignedOut();
      const data = await response.json().catch(() => ({}));
      setConfirm(null);
      if (data.error === "hasBookings") {
        toast({ tone: "error", eyebrow: t.toasts.errorEyebrow, title: t.toasts.hasBookings });
        return;
      }
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      toast({ eyebrow: t.toasts.deletedEyebrow, title: localized(workshop.title, locale) });
      onDeleted();
    } catch {
      failToast();
    } finally {
      setSaving(false);
    }
  }

  const dialog = confirm && t.dialogs[confirm];

  return (
    <form
      className="cd-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!bare && (
        <header className="cd-form-head">
          <h6>{workshop ? f.editTitle : f.createTitle}</h6>
          {onClose && (
            <button type="button" className="hover-line desk-link" onClick={onClose}>
              {f.cancel}
            </button>
          )}
        </header>
      )}

      {TEXTS.map(([field, rows]) => (
        <div className="cd-pair" key={field}>
          {LANGS.map((lang) => (
            <TextField
              key={lang}
              field={`${field}-${lang}`}
              label={`${f[field]} · ${f.langs[lang]}`}
              value={draft[field][lang]}
              error={lang === "vi" ? errorText(field) : undefined}
              multiline={rows > 0}
              rows={rows || undefined}
              onChange={(_, value) => setText(field, lang, value)}
            />
          ))}
        </div>
      ))}

      <FieldShell field="sessions" label={f.sessions} error={errorText("sessions")}>
        <div className="cd-sessions">
          {draft.sessions.map((session, index) => (
            <div className="cd-session" key={index}>
              <label>
                <span className="mono">{f.date}</span>
                <input
                  type="date"
                  className="cd-input"
                  value={session.date}
                  onChange={(e) => setSession(index, "date", e.target.value)}
                />
              </label>
              <label>
                <span className="mono">{f.start}</span>
                <input
                  type="time"
                  className="cd-input"
                  step={900}
                  value={session.start}
                  onChange={(e) => setSession(index, "start", e.target.value)}
                />
              </label>
              <label>
                <span className="mono">{f.end}</span>
                <input
                  type="time"
                  className="cd-input"
                  step={900}
                  value={session.end}
                  onChange={(e) => setSession(index, "end", e.target.value)}
                />
              </label>
              <button
                type="button"
                className="hover-line desk-link cd-session-remove"
                onClick={() => set("sessions", draft.sessions.filter((_, i) => i !== index))}
              >
                {f.removeSession}
              </button>
            </div>
          ))}
          <button
            type="button"
            className="rs-chip cd-add"
            onClick={() => set("sessions", [...draft.sessions, { date: "", start: "", end: "" }])}
          >
            + {f.addSession}
          </button>
        </div>
      </FieldShell>

      <div className="cd-grid">
        <TextField
          field="capacity"
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          label={f.capacity}
          value={draft.capacity}
          error={errorText("capacity")}
          onChange={set}
        />
        <TextField
          field="price"
          type="number"
          inputMode="numeric"
          min={0}
          step={1000}
          label={f.price}
          value={draft.price}
          error={errorText("price")}
          onChange={set}
        />
        <TextField
          field="bookingClosesHours"
          type="number"
          inputMode="numeric"
          min={0}
          label={f.bookingCloses}
          value={draft.bookingClosesHours}
          onChange={set}
        />
        <TextField
          field="refundUntilHours"
          type="number"
          inputMode="numeric"
          min={0}
          label={f.refundUntil}
          value={draft.refundUntilHours}
          onChange={set}
        />
        <TextField field="instructor" label={f.instructor} value={draft.instructor} onChange={set} />
        <TextField
          field="cover"
          label={f.cover}
          value={draft.cover}
          error={errorText("cover")}
          onChange={set}
        />
      </div>

      <TextField field="source" label={f.source} value={draft.source} onChange={set} />

      <div className="rs-group">
        <span className="rs-label">{f.status}</span>
        <div className="rs-chips" role="radiogroup" aria-label={f.status}>
          {STATUSES.map((status) => (
            <button
              type="button"
              role="radio"
              aria-checked={draft.status === status}
              key={status}
              className={`rs-chip ${draft.status === status ? "active" : ""}`}
              onClick={() => set("status", status)}
            >
              {t.statuses[status]}
            </button>
          ))}
        </div>
      </div>

      <div className="cd-form-notes">
        <p className="sm">{f.publishNeeds}</p>
        <p className="sm">{f.policyNote}</p>
      </div>

      <div className="cd-form-foot">
        <Button type="submit" disabled={saving}>
          {saving ? f.saving : workshop ? f.save : f.create}
        </Button>
        {bare && onClose && (
          <button type="button" className="confirm-cancel hover-line" onClick={onClose} disabled={saving}>
            {f.cancel}
          </button>
        )}
        {workshop && workshop.status !== "cancelled" && hasBookings && (
          <button type="button" className="hover-line desk-link cd-danger" onClick={() => setConfirm("cancelClass")}>
            {f.cancelClass}
          </button>
        )}
        {workshop && !hasBookings && (
          <button type="button" className="hover-line desk-link cd-danger" onClick={() => setConfirm("deleteClass")}>
            {f.delete}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        busy={saving}
        eyebrow={dialog?.eyebrow}
        title={dialog?.title}
        message={dialog?.note}
        confirmLabel={dialog?.confirm}
        cancelLabel={t.dialogs.back}
        onConfirm={() => (confirm === "deleteClass" ? remove() : save("cancelled"))}
        onCancel={() => setConfirm(null)}
      />
    </form>
  );
}
