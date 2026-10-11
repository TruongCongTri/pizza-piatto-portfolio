import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";

import { DATA_DIR } from "./store";

const { SMTP_URL, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM } =
  process.env;

export const isMailConfigured = Boolean(
  SMTP_URL || (SMTP_HOST && SMTP_USER && SMTP_PASS),
);

const OUTBOX_DIR = path.join(DATA_DIR, "outbox");

let transport;

function getTransport() {
  if (!transport) {
    const port = Number(SMTP_PORT) || 465;
    transport = SMTP_URL
      ? nodemailer.createTransport(SMTP_URL)
      : nodemailer.createTransport({
          host: SMTP_HOST,
          port,
          secure: port === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASS },
        });
  }
  return transport;
}

/* in development without SMTP, emails are written to .data/outbox so their
   design can still be opened in a browser */
async function saveToOutbox({ to, subject, html }) {
  await fs.mkdir(OUTBOX_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const recipient = to.replace(/[^\w.@-]/g, "_");
  const file = path.join(OUTBOX_DIR, `${stamp}_${recipient}.html`);
  await fs.writeFile(file, html);
  console.info(`[mail] SMTP not configured; "${subject}" saved to ${file}`);
}

/* "sent" | "previewed" (saved to the dev outbox) | "skipped" (no SMTP in
   production); throws when the SMTP server rejects the message */
export async function sendMail({ to, subject, html, text, replyTo }) {
  if (isMailConfigured) {
    await getTransport().sendMail({
      from: MAIL_FROM || `"Pizza Piatto" <${SMTP_USER}>`,
      to,
      subject,
      html,
      text,
      replyTo,
    });
    return "sent";
  }
  if (process.env.NODE_ENV !== "production") {
    await saveToOutbox({ to, subject, html });
    return "previewed";
  }
  console.warn(`[mail] SMTP not configured; "${subject}" was not sent`);
  return "skipped";
}
