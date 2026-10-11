import "server-only";

import { getDictionary } from "@/i18n/dictionaries";
import { fillTemplate } from "@/i18n/format";
import { getSiteUrl } from "@/i18n/metadata";
import { formatDateKey } from "@/lib/booking";
import { formatMoney } from "@/lib/payments";
import { formatPhone } from "@/lib/phone";
import { RESTAURANT } from "@/lib/restaurant";
import { hasTimes, localized } from "@/lib/workshops";

import {
  ADDRESS,
  barcode,
  brandHeader,
  button,
  COLORS,
  escapeHtml,
  FONTS,
  getBookingInbox,
  layout,
  PHONE_HREF,
  RECEIPT_TEXT,
  receiptRow,
  receiptRule,
  ticketLabel,
  ticketValue,
} from "./emails";
import { sendMail } from "./mailer";

/* emails for paid pizza classes, in the language the student booked in:
   the student's ticket once paid, the shop's receipt, refund notices, and
   an alert when the shop has to send money back by hand */

function describe(enrollment, workshop) {
  const locale = enrollment.locale;
  const dict = getDictionary(locale);
  const t = dict.emails.class;
  return {
    dict,
    t,
    locale,
    title: localized(workshop.title, locale),
    seats: `${enrollment.seats} ${enrollment.seats === 1 ? t.seatOne : t.seatOther}`,
    amount: formatMoney(enrollment.amount, locale),
    sessions: workshop.sessions.map(
      (session) =>
        `${formatDateKey(session.date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${hasTimes(session) ? `, ${session.start}–${session.end}` : ""}`,
    ),
    ticketUrl: `${getSiteUrl()}/${locale}/workshops/ticket/${enrollment.id}?t=${enrollment.accessToken}`,
  };
}

const PROVIDER_NAMES = { payos: "PayOS", mock: "Test checkout" };

const stamp = (label) =>
  `<span style="display:inline-block;padding:4px 10px;border:2px solid ${COLORS.navy};border-radius:4px;font-family:${FONTS.type};font-size:12px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:${COLORS.ink};">${escapeHtml(label)}</span>`;

/* ---------- once paid: the student's ticket and the shop's receipt ---------- */

function studentTicket(enrollment, workshop) {
  const info = describe(enrollment, workshop);
  const { t } = info;
  const values = { name: enrollment.name, title: info.title, seats: info.seats, code: enrollment.id, date: info.sessions[0] };
  const subject = fillTemplate(t.ticketSubject, values);

  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.paper};border-radius:12px;">
<tr><td class="pad" style="padding:26px 30px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-family:${FONTS.type};font-size:12px;font-weight:600;letter-spacing:2px;color:${COLORS.ink};">${escapeHtml(fillTemplate(t.codeLabel, values))}</td>
    <td align="right">${stamp(t.paid)}</td>
  </tr></table>
</td></tr>
<tr><td class="pad" style="padding:18px 30px 6px;font-family:${FONTS.type};font-size:24px;font-weight:600;line-height:1.2;letter-spacing:1px;text-transform:uppercase;color:${COLORS.ink};">${escapeHtml(info.title)}</td></tr>
<tr><td class="pad" style="padding:14px 30px 24px;">
  ${ticketLabel(t.whenLabel)}${info.sessions.map((line) => ticketValue(escapeHtml(line), 15)).join("")}
  <table role="presentation" class="stack" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;"><tr>
    <td valign="top" width="50%" style="padding-right:12px;">${ticketLabel(t.seatsLabel)}${ticketValue(escapeHtml(info.seats), 18)}</td>
    <td valign="top" width="50%">${ticketLabel(t.amountLabel)}${ticketValue(escapeHtml(info.amount), 18)}</td>
  </tr></table>
</td></tr>
<tr><td class="pad" style="padding:0 30px 26px;">
  <table role="presentation" class="stack" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="top" width="62%" style="padding-right:16px;">${ticketLabel(t.where)}${ticketValue(escapeHtml(localized(workshop.location, info.locale) || ADDRESS), 13)}</td>
    <td valign="top" width="38%">${ticketLabel(t.call)}${ticketValue(`<a href="${PHONE_HREF}" style="color:${COLORS.ink};text-decoration:none;">${escapeHtml(RESTAURANT.phone)}</a>`, 13)}</td>
  </tr></table>
  <div style="padding-top:16px;font-family:${FONTS.body};font-size:14px;line-height:1.5;color:${COLORS.ink};">${escapeHtml(t.bring)}</div>
</td></tr>
</table>`;

  return {
    to: enrollment.email,
    replyTo: getBookingInbox(),
    subject,
    html: layout({
      locale: info.locale,
      title: subject,
      preheader: fillTemplate(t.ticketPreheader, values),
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
${brandHeader(t.ticketEyebrow)}
<tr><td style="padding-bottom:18px;font-family:${FONTS.body};font-size:17px;line-height:1.45;color:${COLORS.cream};">${escapeHtml(fillTemplate(t.ticketGreeting, values))}</td></tr>
<tr><td>${card}</td></tr>
<tr><td align="center" style="padding-top:30px;">${button(info.ticketUrl, t.viewTicket)}</td></tr>
</table>`,
    }),
    text: [
      "PIZZA PIATTO",
      t.ticketEyebrow,
      "",
      fillTemplate(t.ticketGreeting, values),
      "",
      `${info.title} · ${fillTemplate(t.codeLabel, values)}`,
      ...info.sessions,
      `${t.seatsLabel}: ${info.seats}`,
      `${t.amountLabel}: ${info.amount}`,
      "",
      t.bring,
      `${t.viewTicket}: ${info.ticketUrl}`,
    ].join("\n"),
  };
}

function shopReceipt(enrollment, workshop, payment, kind = "paid") {
  const info = describe(enrollment, workshop);
  const { t } = info;
  const rows = t.receiptRows;
  const values = { title: info.title, seats: info.seats, code: enrollment.id, amount: formatMoney(payment.amount, info.locale) };
  const isAlert = kind === "refund";
  const subject = fillTemplate(isAlert ? t.alertSubject : t.receiptSubject, values);
  const deskUrl = `${getSiteUrl()}/${info.locale}/admin/workshops`;
  const link = (href, label) =>
    `<a href="${escapeHtml(href)}" style="color:${COLORS.navy};text-decoration:none;">${escapeHtml(label)}</a>`;

  const receipt = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.cream};border-radius:4px;">
<tr><td class="pad" style="padding:30px 26px 28px;">
  <div style="text-align:center;${RECEIPT_TEXT}font-size:22px;font-weight:600;letter-spacing:4px;text-transform:uppercase;">Pizza Piatto</div>
  ${receiptRule("double")}
  <div style="text-align:center;${RECEIPT_TEXT}font-size:15px;font-weight:600;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(isAlert ? t.alertTitle : t.receiptTitle)}</div>
  <div style="padding-top:4px;text-align:center;${RECEIPT_TEXT}font-size:13px;letter-spacing:2px;">${escapeHtml(fillTemplate(t.codeLabel, values))}</div>
  ${isAlert ? `<div style="padding-top:12px;text-align:center;${RECEIPT_TEXT}font-size:13px;line-height:1.5;">${escapeHtml(t.alertIntro)}</div>` : ""}
  ${receiptRule()}
  ${receiptRow(rows.class, escapeHtml(info.title))}
  ${info.sessions.map((line) => receiptRow(rows.session, escapeHtml(line), 12)).join("")}
  ${receiptRule()}
  ${receiptRow(rows.student, escapeHtml(enrollment.name))}
  ${receiptRow(rows.phone, link(`tel:${enrollment.phone}`, formatPhone(enrollment.phone)))}
  ${receiptRow(rows.email, enrollment.email ? link(`mailto:${enrollment.email}`, enrollment.email) : "—")}
  ${receiptRule()}
  ${receiptRow(rows.seats, escapeHtml(info.seats))}
  ${receiptRow(rows.price, escapeHtml(formatMoney(workshop.price, info.locale)))}
  ${receiptRow(rows.provider, escapeHtml(PROVIDER_NAMES[payment.provider] ?? payment.provider))}
  ${receiptRow(rows.reference, escapeHtml(payment.providerRef ?? payment.id))}
  ${isAlert ? receiptRow(rows.reason, escapeHtml(t.reasons[payment.refundReason] ?? payment.refundReason ?? "")) : ""}
  ${receiptRule("double")}
  ${receiptRow(isAlert ? rows.refund : rows.total, escapeHtml(formatMoney(payment.amount, info.locale)), 18)}
  ${receiptRule("double")}
  <div style="padding-top:8px;">${barcode(enrollment.id)}</div>
</td></tr>
</table>`;

  return {
    to: getBookingInbox(),
    replyTo: enrollment.email || undefined,
    subject,
    html: layout({
      locale: info.locale,
      title: subject,
      preheader: subject,
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:420px;">
<tr><td>${receipt}</td></tr>
<tr><td align="center" style="padding-top:28px;">${button(deskUrl, t.openDesk)}</td></tr>
</table>`,
    }),
    text: [
      "PIZZA PIATTO",
      `${(isAlert ? t.alertTitle : t.receiptTitle).toUpperCase()} · ${fillTemplate(t.codeLabel, values)}`,
      isAlert ? t.alertIntro : null,
      `${rows.class}: ${info.title}`,
      ...info.sessions,
      `${rows.student}: ${enrollment.name} · ${formatPhone(enrollment.phone)} · ${enrollment.email ?? "—"}`,
      `${rows.seats}: ${info.seats}`,
      `${isAlert ? rows.refund : rows.total}: ${formatMoney(payment.amount, info.locale)}`,
      `${rows.reference}: ${payment.providerRef ?? payment.id}`,
      `${t.openDesk}: ${deskUrl}`,
    ]
      .filter((line) => line !== null)
      .join("\n"),
  };
}

export async function sendClassConfirmation(enrollment, workshop, payment) {
  await Promise.all([
    enrollment.email ? sendMail(studentTicket(enrollment, workshop)) : null,
    sendMail(shopReceipt(enrollment, workshop, payment)),
  ]);
}

/* ---------- refunds ---------- */

export async function sendClassRefundNotice(enrollment, workshop, payment, { done, reason }) {
  if (!enrollment?.email) return;
  const info = describe(enrollment, workshop);
  const { t } = info;
  const values = {
    title: info.title,
    amount: formatMoney(payment.amount, info.locale),
    reason: t.reasons[reason] ?? "",
    code: enrollment.id,
  };
  const message = fillTemplate(done ? t.refundDone : t.refundPending, values);
  const subject = fillTemplate(t.refundSubject, values);
  await sendMail({
    to: enrollment.email,
    replyTo: getBookingInbox(),
    subject,
    html: layout({
      locale: info.locale,
      title: subject,
      preheader: message,
      body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
${brandHeader(t.refundEyebrow)}
<tr><td style="padding-bottom:20px;font-family:${FONTS.body};font-size:17px;line-height:1.45;color:${COLORS.cream};">${escapeHtml(message)}</td></tr>
<tr><td style="padding:22px 28px;background-color:${COLORS.cream};border-radius:12px;font-family:${FONTS.type};font-size:14px;font-weight:600;line-height:1.6;color:${COLORS.ink};">${escapeHtml(fillTemplate(t.codeLabel, values))}<br>${escapeHtml(info.title)}<br>${escapeHtml(values.amount)} · ${stamp(done ? t.refunded : t.refunding)}</td></tr>
<tr><td align="center" style="padding-top:30px;">${button(info.ticketUrl, t.viewTicket)}</td></tr>
</table>`,
    }),
    text: `PIZZA PIATTO\n\n${message}\n\n${fillTemplate(t.codeLabel, values)} · ${info.title} · ${values.amount}\n\n${t.viewTicket}: ${info.ticketUrl}`,
  });
}

/* the shop must send money back itself (bank transfer refunds) */
export async function sendClassAlert(type, { enrollment, payment, workshop }) {
  if (type !== "refundNeeded") return;
  await sendMail(shopReceipt(enrollment, workshop, payment, "refund"));
}
