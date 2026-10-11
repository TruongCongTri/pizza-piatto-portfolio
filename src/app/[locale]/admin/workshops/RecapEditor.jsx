"use client";

import { useEffect, useRef, useState } from "react";

import Button from "@/components/Button/Button";
import ConfirmDialog from "@/components/ConfirmDialog/ConfirmDialog";
import { TextField } from "@/components/Reserve/Fields";
import { useToast } from "@/components/Toast/ToastProvider";
import { useLocale } from "@/i18n/LocaleProvider";
import { fillTemplate } from "@/i18n/format";

import { toInput } from "./ClassForm";

const JSON_HEADERS = { "Content-Type": "application/json" };
/* photos are scaled down in the browser before upload: phone pictures are
   often 5-10 MB, more than a serverless request may carry (4.5 MB on
   Vercel); the server re-encodes them anyway */
const UPLOAD_MAX_SIZE = 2000;
const UPLOAD_QUALITY = 0.86;

async function shrink(file) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, UPLOAD_MAX_SIZE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", UPLOAD_QUALITY));
    return blob ? new File([blob], "photo.jpg", { type: "image/jpeg" }) : file;
  } catch {
    /* a format this browser can't open: let the server decide */
    return file;
  }
}

/* the recap shown on a class's page once it has happened: notes in both
   languages and photos with captions */
export default function RecapEditor({ workshop, onChanged, onSignedOut }) {
  const { dict } = useLocale();
  const t = dict.classDesk;
  const r = t.recap;
  const { toast } = useToast();
  const [text, setText] = useState(() => ({ ...toInput(workshop).recap.text }));
  const [captions, setCaptions] = useState({});
  const [saving, setSaving] = useState(false);
  /* { done, count } while uploading */
  const [progress, setProgress] = useState(null);
  const [removing, setRemoving] = useState(null);
  const fileRef = useRef(null);
  const images = workshop.recap?.images ?? [];

  /* captions being typed are kept; the rest follow the saved class */
  useEffect(() => {
    setCaptions((prev) =>
      Object.fromEntries(
        images.map((image) => [
          image.id,
          prev[image.id]?.dirty ? prev[image.id] : { vi: image.caption?.vi ?? "", en: image.caption?.en ?? "" },
        ]),
      ),
    );
  }, [workshop]);

  const failToast = (title = t.toasts.errorTitle, message = t.toasts.errorMessage) =>
    toast({ tone: "error", eyebrow: t.toasts.errorEyebrow, title, message });

  /* every request here: signs out on 401, throws on other failures */
  async function call(url, init) {
    const response = await fetch(url, init);
    if (response.status === 401) {
      onSignedOut();
      return null;
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error ?? `Request failed with ${response.status}`);
      error.code = data.error;
      throw error;
    }
    return data;
  }

  async function saveText() {
    if (saving) return;
    setSaving(true);
    try {
      const data = await call(`/api/admin/workshops/${encodeURIComponent(workshop.id)}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ ...toInput(workshop), recap: { text } }),
      });
      if (!data) return;
      toast({ eyebrow: t.toasts.savedEyebrow, title: t.sections.recap });
      onChanged();
    } catch {
      failToast();
    } finally {
      setSaving(false);
    }
  }

  async function upload(files) {
    const list = [...files].filter((file) => file.type.startsWith("image/") || !file.type);
    if (!list.length || progress) return;
    let added = 0;
    try {
      for (const [index, file] of list.entries()) {
        setProgress({ done: index + 1, count: list.length });
        const form = new FormData();
        form.append("file", await shrink(file));
        const data = await call(`/api/admin/workshops/${encodeURIComponent(workshop.id)}/images`, {
          method: "POST",
          body: form,
        });
        if (!data) return;
        added += 1;
      }
    } catch (error) {
      failToast(r.errors[error.code] ?? r.errors.failed, null);
    } finally {
      setProgress(null);
      if (fileRef.current) fileRef.current.value = "";
      if (added) {
        toast({ eyebrow: t.toasts.photoEyebrow, title: fillTemplate(t.toasts.photosAdded, { count: added }) });
        onChanged();
      }
    }
  }

  async function changeImage(image, body, done) {
    try {
      const data = await call(
        `/api/admin/workshops/${encodeURIComponent(workshop.id)}/images/${encodeURIComponent(image.id)}`,
        { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) },
      );
      if (!data) return;
      done?.();
      onChanged();
    } catch {
      failToast();
    }
  }

  async function removeImage() {
    const image = removing;
    if (!image || saving) return;
    setSaving(true);
    try {
      const data = await call(
        `/api/admin/workshops/${encodeURIComponent(workshop.id)}/images/${encodeURIComponent(image.id)}`,
        { method: "DELETE" },
      );
      if (!data) return;
      setRemoving(null);
      toast({ eyebrow: t.toasts.photoEyebrow, title: t.toasts.photoRemoved });
      onChanged();
    } catch {
      failToast();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cd-recap">
      <p className="sm cd-recap-intro">{r.intro}</p>

      <div className="cd-pair">
        {["vi", "en"].map((lang) => (
          <TextField
            key={lang}
            field={`recap-${lang}`}
            label={`${t.form.recap} · ${t.form.langs[lang]}`}
            value={text[lang]}
            multiline
            rows={5}
            onChange={(_, value) => setText((prev) => ({ ...prev, [lang]: value }))}
          />
        ))}
      </div>
      <div>
        <Button type="button" disabled={saving} onClick={saveText}>
          {saving ? t.form.saving : r.save}
        </Button>
      </div>

      <div className="cd-upload">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="visually-hidden"
          id={`recap-upload-${workshop.id}`}
          onChange={(e) => upload(e.target.files)}
        />
        <label htmlFor={`recap-upload-${workshop.id}`} className={`rs-chip cd-add ${progress ? "is-busy" : ""}`}>
          + {r.upload}
        </label>
        {progress && (
          <p className="mono" aria-live="polite">
            {fillTemplate(r.uploading, progress)}
          </p>
        )}
      </div>

      {images.length === 0 ? (
        <p className="sm">{r.empty}</p>
      ) : (
        <ul className="cd-photos">
          {images.map((image, index) => {
            const caption = captions[image.id] ?? { vi: "", en: "" };
            const edit = (lang, value) =>
              setCaptions((prev) => ({ ...prev, [image.id]: { ...caption, [lang]: value, dirty: true } }));
            return (
              <li className="cd-photo" key={image.id}>
                <div className="cd-photo-image">
                  <img src={image.url} alt="" loading="lazy" />
                </div>
                <label className="cd-caption">
                  <span className="mono">{r.captionVi}</span>
                  <input className="cd-input" value={caption.vi} maxLength={300} onChange={(e) => edit("vi", e.target.value)} />
                </label>
                <label className="cd-caption">
                  <span className="mono">{r.captionEn}</span>
                  <input className="cd-input" value={caption.en} maxLength={300} onChange={(e) => edit("en", e.target.value)} />
                </label>
                <div className="cd-photo-actions">
                  {caption.dirty && (
                    <button
                      type="button"
                      className="rs-chip"
                      onClick={() =>
                        changeImage(image, { caption: { vi: caption.vi, en: caption.en } }, () =>
                          setCaptions((prev) => ({ ...prev, [image.id]: { vi: caption.vi, en: caption.en } })),
                        )
                      }
                    >
                      {r.saveCaption}
                    </button>
                  )}
                  <button
                    type="button"
                    className="hover-line desk-link"
                    disabled={index === 0}
                    onClick={() => changeImage(image, { move: -1 })}
                  >
                    {r.moveUp}
                  </button>
                  <button
                    type="button"
                    className="hover-line desk-link"
                    disabled={index === images.length - 1}
                    onClick={() => changeImage(image, { move: 1 })}
                  >
                    {r.moveDown}
                  </button>
                  <button type="button" className="hover-line desk-link cd-danger" onClick={() => setRemoving(image)}>
                    {r.remove}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        busy={saving}
        eyebrow={t.dialogs.removePhoto.eyebrow}
        title={t.dialogs.removePhoto.title}
        confirmLabel={t.dialogs.removePhoto.confirm}
        cancelLabel={t.dialogs.back}
        onConfirm={removeImage}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
