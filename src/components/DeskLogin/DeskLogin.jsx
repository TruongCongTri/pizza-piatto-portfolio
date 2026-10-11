"use client";

import { useState } from "react";

import Button from "@/components/Button/Button";
import { TextField } from "@/components/Reserve/Fields";
import { useLocale } from "@/i18n/LocaleProvider";

const JSON_HEADERS = { "Content-Type": "application/json" };
const FIELD_ERRORS = ["required", "invalid"];

/* the staff sign-in shared by the reservation and class desks (one
   session opens both); `title` and `intro` name the desk being opened */
export default function DeskLogin({ title, intro, onSignedIn }) {
  const { dict } = useLocale();
  const t = dict.admin.login;
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [signingIn, setSigningIn] = useState(false);

  async function signIn(e) {
    e.preventDefault();
    if (signingIn) return;
    if (!password) return setError("required");

    setSigningIn(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setPassword("");
        onSignedIn();
        return;
      }
      setError(data.error ?? "server");
    } catch {
      setError("server");
    } finally {
      setSigningIn(false);
    }
  }

  const fieldError = FIELD_ERRORS.includes(error) ? t.errors[error] : undefined;
  const notice = error && !fieldError ? t.errors[error] ?? t.errors.server : null;

  return (
    <section className="desk desk-signin">
      <div className="container">
        <form className="desk-login" onSubmit={signIn} noValidate>
          <p className="mono">{t.eyebrow}</p>
          <h3>{title ?? t.title}</h3>
          <p className="desk-login-intro">{intro ?? t.intro}</p>
          <TextField
            field="password"
            type="password"
            label={t.password}
            autoComplete="current-password"
            value={password}
            error={fieldError}
            onChange={(_, value) => {
              setError(null);
              setPassword(value);
            }}
          />
          {notice && (
            <p className="desk-notice" role="alert">
              {notice}
            </p>
          )}
          <div>
            <Button type="submit" disabled={signingIn}>
              {signingIn ? t.submitting : t.submit}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
