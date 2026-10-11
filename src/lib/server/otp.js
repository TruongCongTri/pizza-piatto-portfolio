import "server-only";

import { randomInt } from "node:crypto";

import { buildCodeEmail } from "./emails";
import { sendMail } from "./mailer";
import { safeEqual, signValue } from "./session";
import { tempDelete, tempGet, tempSet } from "./store";

/* One-time codes that prove a guest owns the phone number they booked with.
   With Twilio Verify configured the code goes out by SMS (Twilio generates
   and checks it). Without it, the code is generated here and emailed to the
   address on the guest's bookings; in demo mode (on by default in
   development) it is also returned so the page can show it. */

const CODE_TTL_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;

const TWILIO = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken: process.env.TWILIO_AUTH_TOKEN,
  serviceSid: process.env.TWILIO_VERIFY_SERVICE_SID,
};

const isSmsConfigured = Boolean(
  TWILIO.accountSid && TWILIO.authToken && TWILIO.serviceSid,
);

/* demo mode shows codes on screen: never turn it on for real guests */
const isDemoMode =
  process.env.OTP_DEMO_MODE === "true" ||
  (process.env.NODE_ENV !== "production" &&
    process.env.OTP_DEMO_MODE !== "false");

const codeKey = (phone) => `otp:${phone}`;
const hashCode = (phone, code) => signValue(`otp:${phone}:${code}`);

/* "lan.nguyen@gmail.com" -> "l•••n@gmail.com" */
function maskEmail(email) {
  const [user, domain] = email.split("@");
  const visible = user.length > 2 ? `${user[0]}•••${user.at(-1)}` : `${user[0]}•••`;
  return `${visible}@${domain}`;
}

async function twilioVerify(resource, params) {
  const auth = Buffer.from(`${TWILIO.accountSid}:${TWILIO.authToken}`);
  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${TWILIO.serviceSid}/${resource}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth.toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      cache: "no-store",
    },
  );
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, data };
}

/* sends a code and says where it went:
   { channel: "sms" } | { channel: "email", destination } | { channel: "demo" },
   plus `demoCode` in demo mode; null when there is no way to deliver one */
export async function sendCode(phone, { email, locale }) {
  if (isSmsConfigured) {
    const result = await twilioVerify("Verifications", {
      To: phone,
      Channel: "sms",
      Locale: locale,
    });
    if (!result.ok) {
      throw new Error(
        `Twilio Verify failed with ${result.status}: ${result.data.message ?? ""}`,
      );
    }
    return { channel: "sms" };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await tempSet(
    codeKey(phone),
    {
      hash: hashCode(phone, code),
      attempts: 0,
      expiresAt: Date.now() + CODE_TTL_SECONDS * 1000,
    },
    CODE_TTL_SECONDS,
  );

  let delivery = null;
  if (email) {
    const status = await sendMail(buildCodeEmail({ email, code, locale }));
    if (status !== "skipped") {
      delivery = { channel: "email", destination: maskEmail(email) };
    }
  }
  if (isDemoMode) delivery = { channel: "demo", ...delivery, demoCode: code };

  if (!delivery) await tempDelete(codeKey(phone));
  return delivery;
}

/* "approved" | "invalid" (wrong code, try again) | "expired" (ask for a
   new one: timed out, used up, or too many wrong tries) */
export async function checkCode(phone, code) {
  const cleanCode = String(code ?? "").replace(/\D/g, "");
  if (cleanCode.length !== 6) return "invalid";

  if (isSmsConfigured) {
    const result = await twilioVerify("VerificationCheck", {
      To: phone,
      Code: cleanCode,
    });
    /* Twilio answers 404 once a verification is approved, expired or out of tries */
    if (result.status === 404) return "expired";
    if (!result.ok) {
      throw new Error(`Twilio Verify check failed with ${result.status}`);
    }
    return result.data.status === "approved" ? "approved" : "invalid";
  }

  const entry = await tempGet(codeKey(phone));
  if (!entry || entry.expiresAt <= Date.now()) return "expired";

  if (safeEqual(entry.hash, hashCode(phone, cleanCode))) {
    await tempDelete(codeKey(phone));
    return "approved";
  }

  const attempts = entry.attempts + 1;
  if (attempts >= MAX_ATTEMPTS) {
    await tempDelete(codeKey(phone));
    return "expired";
  }
  await tempSet(
    codeKey(phone),
    { ...entry, attempts },
    (entry.expiresAt - Date.now()) / 1000,
  );
  return "invalid";
}
