import "server-only";

import {
  formatDateKey,
  formatShopTime,
  HOLD_MINUTES,
  intlLocale,
} from "@/lib/booking";
import { formatPhone } from "@/lib/phone";
import { RESTAURANT } from "@/lib/restaurant";
import { getDictionary } from "@/i18n/dictionaries";
import { fillTemplate, formatGuests } from "@/i18n/format";
import { getSiteUrl } from "@/i18n/metadata";

/* HTML emails in the site's palette: table layout and inline styles so they
   hold up in Gmail and Outlook. The web fonts load where clients allow it
   (Apple Mail, iOS); everywhere else the fallbacks keep the same feel. */

export const COLORS = {
  navy: "#1c2541",
  navyInk: "#242f50",
  muted: "#5a668e",
  cream: "#f2e6cc",
  creamDim: "#cfc3a5",
  gold: "#e8bb5a",
  paper: "#f3c246",
  ink: "#1c2640",
  /* the ink at ~55% on the golden paper, for the perforation */
  perforation: "#7d6c43",
  /* the site's warning tone, deepened to read on cream paper */
  stamp: "#b85c3e",
};

export const FONTS = {
  display: "'Fraunces', Georgia, 'Times New Roman', serif",
  type: "'IBM Plex Mono', 'Courier New', Courier, monospace",
  body: "'Be Vietnam Pro', Arial, Helvetica, sans-serif",
};

const FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;600&family=Fraunces:opsz,wght@9..144,900&family=IBM+Plex+Mono:wght@500;600&display=swap";

export const ADDRESS = [
  RESTAURANT.address.street,
  RESTAURANT.address.ward,
  RESTAURANT.address.city,
].join(", ");
export const PHONE_HREF = `tel:${RESTAURANT.phoneIntl.replace(/\s/g, "")}`;

export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );

export const multiline = (value) => escapeHtml(value).replace(/\r?\n/g, "<br>");

export function getBookingInbox() {
  return process.env.RESERVATION_INBOX || RESTAURANT.bookingInbox;
}

/* the strings each email fills in: dates in the booking's language */
function describe(reservation) {
  const { locale } = reservation;
  const dict = getDictionary(locale);
  return {
    dict,
    values: {
      name: reservation.name,
      code: reservation.id,
      time: reservation.time,
      guests: formatGuests(reservation.guests, dict.reserve),
      date: formatDateKey(reservation.date, locale, {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
      dateLong: formatDateKey(reservation.date, locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    },
  };
}

export function layout({ locale, title, preheader, body }) {
  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<link href="${FONTS_URL}" rel="stylesheet">
<style>
  body { margin: 0; padding: 0; -webkit-text-size-adjust: 100%; }
  a { color: inherit; }
  @media (max-width: 520px) {
    .pad { padding-left: 20px !important; padding-right: 20px !important; }
    .stack, .stack tbody, .stack tr, .stack td { display: block !important; width: 100% !important; }
    .stack td { padding: 0 0 14px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.navy};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.navy};">
<tr><td align="center" style="padding:40px 16px 48px;">
${body}
</td></tr>
</table>
</body>
</html>`;
}

export function brandHeader(eyebrow) {
  return `<tr><td align="center" style="padding-bottom:8px;font-family:${FONTS.display};font-size:34px;font-weight:900;line-height:1;letter-spacing:1px;text-transform:uppercase;color:${COLORS.gold};">Pizza Piatto</td></tr>
<tr><td align="center" style="padding-bottom:28px;font-family:${FONTS.type};font-size:12px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:${COLORS.creamDim};">${escapeHtml(eyebrow)}</td></tr>`;
}

export function button(href, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
<td align="center" bgcolor="${COLORS.cream}" style="border-radius:6px;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:16px 34px;font-family:${FONTS.body};font-size:15px;font-weight:600;color:${COLORS.navyInk};text-decoration:none;border-radius:6px;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

export const ticketLabel = (text) =>
  `<div style="padding-bottom:6px;font-family:${FONTS.type};font-size:11px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${COLORS.ink};">${escapeHtml(text)}</div>`;

export const ticketValue = (html, size = 22) =>
  `<div style="font-family:${FONTS.type};font-size:${size}px;font-weight:600;line-height:1.2;color:${COLORS.ink};">${html}</div>`;

/* ---------- guest: reservation ticket ---------- */

export function buildTicketEmail(reservation) {
  const { dict, values } = describe(reservation);
  const t = dict.emails.ticket;
  const trackUrl = `${getSiteUrl()}/${reservation.locale}/reservation/track`;
  const title = fillTemplate(t.subject, values);
  const hold = fillTemplate(t.hold, { minutes: HOLD_MINUTES });

  const notes = reservation.notes
    ? `<tr><td class="pad" style="padding:0 30px 4px;">${ticketLabel(t.notes)}${ticketValue(multiline(reservation.notes), 14)}</td></tr>`
    : "";

  const ticket = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.paper};border-radius:12px;">
<tr><td class="pad" style="padding:26px 30px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-family:${FONTS.type};font-size:12px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${COLORS.ink};">${escapeHtml(fillTemplate(t.tableFor, values))}</td>
    <td align="right" style="font-family:${FONTS.type};font-size:12px;font-weight:600;letter-spacing:2px;color:${COLORS.ink};">${escapeHtml(fillTemplate(t.number, values))}</td>
  </tr></table>
</td></tr>
<tr><td class="pad" style="padding:20px 30px 8px;font-family:${FONTS.type};font-size:28px;font-weight:600;line-height:1.15;letter-spacing:2px;text-transform:uppercase;color:${COLORS.ink};">${escapeHtml(reservation.name)}</td></tr>
<tr><td class="pad" style="padding:16px 30px 24px;">
  <table role="presentation" class="stack" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="top" width="52%" style="padding-right:12px;">${ticketLabel(t.date)}${ticketValue(escapeHtml(values.dateLong), 17)}</td>
    <td valign="top" width="24%" style="padding-right:12px;">${ticketLabel(t.time)}${ticketValue(escapeHtml(reservation.time))}</td>
    <td valign="top" width="24%">${ticketLabel(t.guests)}${ticketValue(String(reservation.guests).padStart(2, "0"))}</td>
  </tr></table>
</td></tr>
${notes}
<tr><td style="padding:14px 0 0;font-size:0;line-height:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="14" height="28" style="width:14px;height:28px;background-color:${COLORS.navy};border-radius:0 14px 14px 0;font-size:0;line-height:0;">&nbsp;</td>
    <td valign="middle" style="padding:0 10px;"><div style="height:0;border-top:2px dashed ${COLORS.perforation};font-size:0;line-height:0;">&nbsp;</div></td>
    <td width="14" height="28" style="width:14px;height:28px;background-color:${COLORS.navy};border-radius:14px 0 0 14px;font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>
</td></tr>
<tr><td class="pad" style="padding:18px 30px 28px;">
  <table role="presentation" class="stack" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td valign="top" width="62%" style="padding-right:16px;">${ticketLabel(t.where)}${ticketValue(escapeHtml(ADDRESS), 13)}</td>
    <td valign="top" width="38%">${ticketLabel(t.call)}${ticketValue(`<a href="${PHONE_HREF}" style="color:${COLORS.ink};text-decoration:none;">${escapeHtml(RESTAURANT.phone)}</a>`, 13)}</td>
  </tr></table>
  <div style="padding-top:18px;font-family:${FONTS.body};font-size:14px;line-height:1.5;color:${COLORS.ink};">${escapeHtml(t.showAtDoor)} ${escapeHtml(hold)}</div>
</td></tr>
</table>`;

  const html = layout({
    locale: reservation.locale,
    title,
    preheader: fillTemplate(t.preheader, values),
    body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
${brandHeader(t.eyebrow)}
<tr><td style="padding-bottom:18px;font-family:${FONTS.body};font-size:17px;line-height:1.45;color:${COLORS.cream};">${escapeHtml(fillTemplate(t.greeting, values))}</td></tr>
<tr><td>${ticket}</td></tr>
<tr><td align="center" style="padding-top:30px;">${button(trackUrl, t.track)}</td></tr>
<tr><td align="center" style="padding-top:30px;font-family:${FONTS.body};font-size:12px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(t.footer)}</td></tr>
</table>`,
  });

  const text = [
    "PIZZA PIATTO",
    t.eyebrow,
    "",
    fillTemplate(t.greeting, values),
    "",
    fillTemplate(t.number, values),
    `${t.date}: ${values.dateLong}`,
    `${t.time}: ${reservation.time}`,
    `${t.guests}: ${reservation.guests}`,
    reservation.notes ? `${t.notes}: ${reservation.notes}` : null,
    "",
    `${t.where}: ${ADDRESS}`,
    `${t.call}: ${RESTAURANT.phone}`,
    "",
    t.showAtDoor,
    hold,
    `${t.track}: ${trackUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    to: reservation.email,
    replyTo: getBookingInbox(),
    subject: title,
    html,
    text,
  };
}

/* ---------- restaurant: receipt ---------- */

export const RECEIPT_TEXT = `font-family:${FONTS.type};color:${COLORS.navy};`;

export const receiptRule = (style = "dashed") =>
  `<div style="margin:14px 0;height:0;border-top:${style === "double" ? `3px double ${COLORS.navy}` : `1px dashed ${COLORS.muted}`};font-size:0;line-height:0;">&nbsp;</div>`;

export const receiptRow = (label, valueHtml, size = 13) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" style="padding:3px 0;${RECEIPT_TEXT}font-size:12px;letter-spacing:1px;text-transform:uppercase;white-space:nowrap;color:${COLORS.muted};">${escapeHtml(label)}</td>
<td valign="top" align="right" style="padding:3px 0 3px 12px;${RECEIPT_TEXT}font-size:${size}px;font-weight:600;">${valueHtml}</td>
</tr></table>`;

/* decorative bars spelled from the booking code, as printed on a till receipt */
export function barcode(code) {
  const cells = [];
  [...`*${code}*`].forEach((char) => {
    const bits = char.charCodeAt(0);
    for (let index = 0; index < 3; index += 1) {
      cells.push([2 + 2 * ((bits >> index) & 1), true]);
      cells.push([2 + 2 * ((bits >> (index + 3)) & 1), false]);
    }
  });
  const bars = cells
    .map(
      ([width, dark]) =>
        `<td width="${width}" height="46" style="width:${width}px;height:46px;${dark ? `background-color:${COLORS.navy};` : ""}font-size:0;line-height:0;"></td>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>${bars}</tr></table>`;
}

/* the shop's copy of a booking; `cancelled` prints the same slip marked
   void, for a guest who cancelled online */
export function buildReceiptEmail(reservation, { cancelled = false } = {}) {
  const { dict, values } = describe(reservation);
  const t = dict.emails.receipt;
  const deskUrl = `${getSiteUrl()}/${reservation.locale}/admin`;
  const issued = new Intl.DateTimeFormat(intlLocale(reservation.locale), {
    timeZone: RESTAURANT.timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(reservation.createdAt));
  const phone = formatPhone(reservation.phone);
  const title = fillTemplate(cancelled ? t.cancelledSubject : t.subject, values);
  const heading = cancelled ? t.cancelledTitle : t.title;
  const cancelledAt = cancelled
    ? formatShopTime(reservation.cancelledAt, reservation.locale)
    : null;
  const link = (href, label) =>
    `<a href="${escapeHtml(href)}" style="color:${COLORS.navy};text-decoration:none;">${escapeHtml(label)}</a>`;

  const notes = reservation.notes
    ? `${receiptRule()}
<div style="padding-bottom:4px;${RECEIPT_TEXT}font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${COLORS.muted};">${escapeHtml(t.notes)}</div>
<div style="${RECEIPT_TEXT}font-size:13px;font-weight:600;line-height:1.45;">${multiline(reservation.notes)}</div>`
    : "";

  const receipt = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.cream};border-radius:4px;">
<tr><td class="pad" style="padding:30px 26px 28px;">
  <div style="text-align:center;${RECEIPT_TEXT}font-size:22px;font-weight:600;letter-spacing:4px;text-transform:uppercase;">Pizza Piatto</div>
  <div style="padding-top:6px;text-align:center;${RECEIPT_TEXT}font-size:11px;line-height:1.5;letter-spacing:1px;text-transform:uppercase;color:${COLORS.muted};">${escapeHtml(ADDRESS)}<br>Tel ${escapeHtml(RESTAURANT.phone)}</div>
  ${receiptRule("double")}
  <div style="text-align:center;${RECEIPT_TEXT}font-size:15px;font-weight:600;letter-spacing:3px;text-transform:uppercase;">${escapeHtml(heading)}</div>
  <div style="padding-top:4px;text-align:center;${RECEIPT_TEXT}font-size:13px;letter-spacing:2px;">${escapeHtml(fillTemplate(t.number, values))}</div>
  ${cancelled ? `<div style="padding-top:14px;text-align:center;"><span style="display:inline-block;padding:6px 14px;border:3px solid ${COLORS.stamp};border-radius:4px;${RECEIPT_TEXT}font-size:20px;font-weight:600;letter-spacing:6px;text-transform:uppercase;color:${COLORS.stamp};">${escapeHtml(t.void)}</span></div>` : ""}
  ${receiptRule()}
  ${receiptRow(t.issued, escapeHtml(issued))}
  ${cancelled ? receiptRow(t.cancelledAt, escapeHtml(cancelledAt)) : ""}
  ${receiptRow(t.language, escapeHtml(t.languages[reservation.locale] ?? reservation.locale))}
  ${receiptRule()}
  ${receiptRow(t.guest, escapeHtml(reservation.name))}
  ${receiptRow(t.phone, link(`tel:${reservation.phone}`, phone))}
  ${receiptRow(t.email, reservation.email ? link(`mailto:${reservation.email}`, reservation.email) : escapeHtml(t.none))}
  ${receiptRule()}
  ${receiptRow(t.date, escapeHtml(values.dateLong))}
  ${receiptRow(t.time, escapeHtml(reservation.time))}
  ${receiptRow(t.party, escapeHtml(values.guests))}
  ${notes}
  ${receiptRule("double")}
  ${receiptRow(t.total, String(reservation.guests).padStart(2, "0"), 20)}
  ${receiptRule("double")}
  <div style="padding-top:8px;">${barcode(reservation.id)}</div>
  <div style="padding-top:8px;text-align:center;${RECEIPT_TEXT}font-size:12px;letter-spacing:4px;">${escapeHtml(reservation.id)}</div>
  <div style="padding-top:16px;text-align:center;${RECEIPT_TEXT}font-size:12px;letter-spacing:2px;text-transform:uppercase;">${escapeHtml(t.thanks)}</div>
</td></tr>
</table>`;

  const html = layout({
    locale: reservation.locale,
    title,
    preheader: fillTemplate(cancelled ? t.cancelledPreheader : t.preheader, values),
    body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:420px;">
<tr><td>${receipt}</td></tr>
<tr><td align="center" style="padding-top:28px;">${button(deskUrl, t.dashboard)}</td></tr>
</table>`,
  });

  const text = [
    "PIZZA PIATTO",
    `${heading.toUpperCase()} · ${fillTemplate(t.number, values)}`,
    `${t.issued}: ${issued}`,
    cancelled ? `${t.cancelledAt}: ${cancelledAt}` : null,
    `${t.language}: ${t.languages[reservation.locale] ?? reservation.locale}`,
    "",
    `${t.guest}: ${reservation.name}`,
    `${t.phone}: ${phone}`,
    `${t.email}: ${reservation.email || t.none}`,
    "",
    `${t.date}: ${values.dateLong}`,
    `${t.time}: ${reservation.time}`,
    `${t.party}: ${values.guests}`,
    reservation.notes ? `${t.notes}: ${reservation.notes}` : null,
    "",
    `${t.dashboard}: ${deskUrl}`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return {
    to: getBookingInbox(),
    replyTo: reservation.email || undefined,
    subject: title,
    html,
    text,
  };
}

/* ---------- guest: cancellation ---------- */

/* tells the guest a booking is off; `by` is "guest" (they cancelled
   online) or "staff" (the shop cancelled it) */
export function buildCancellationEmail(reservation, { by }) {
  const { dict, values } = describe(reservation);
  const t = dict.emails.cancelled;
  const bookUrl = `${getSiteUrl()}/${reservation.locale}/reservation`;
  const title = fillTemplate(t.subject, values);
  const message = fillTemplate(by === "staff" ? t.byStaff : t.byGuest, {
    ...values,
    phone: RESTAURANT.phone,
  });
  const struck = (html) =>
    `<span style="text-decoration:line-through;">${html}</span>`;
  const summary = `${values.dateLong} · ${reservation.time} · ${values.guests}`;

  const card = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLORS.cream};border-radius:12px;">
<tr><td class="pad" style="padding:24px 30px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-family:${FONTS.type};font-size:12px;font-weight:600;letter-spacing:2px;color:${COLORS.ink};">${escapeHtml(fillTemplate(dict.emails.ticket.number, values))}</td>
    <td align="right"><span style="display:inline-block;padding:4px 10px;border:2px solid ${COLORS.stamp};border-radius:4px;font-family:${FONTS.type};font-size:12px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:${COLORS.stamp};">${escapeHtml(t.stamp)}</span></td>
  </tr></table>
  <div style="padding-top:16px;font-family:${FONTS.type};font-size:22px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:${COLORS.ink};">${struck(escapeHtml(reservation.name))}</div>
  <div style="padding-top:10px;font-family:${FONTS.type};font-size:15px;font-weight:600;line-height:1.5;color:${COLORS.ink};">${struck(escapeHtml(summary))}</div>
</td></tr>
</table>`;

  const html = layout({
    locale: reservation.locale,
    title,
    preheader: message,
    body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
${brandHeader(t.eyebrow)}
<tr><td style="padding-bottom:20px;font-family:${FONTS.body};font-size:17px;line-height:1.45;color:${COLORS.cream};">${escapeHtml(message)}</td></tr>
<tr><td>${card}</td></tr>
<tr><td align="center" style="padding-top:30px;">${button(bookUrl, t.rebook)}</td></tr>
<tr><td align="center" style="padding-top:30px;font-family:${FONTS.body};font-size:12px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(dict.emails.ticket.footer)}</td></tr>
</table>`,
  });

  const text = [
    "PIZZA PIATTO",
    t.eyebrow,
    "",
    message,
    "",
    fillTemplate(dict.emails.ticket.number, values),
    summary,
    "",
    `${t.rebook}: ${bookUrl}`,
  ].join("\n");

  return {
    to: reservation.email,
    replyTo: getBookingInbox(),
    subject: title,
    html,
    text,
  };
}

/* ---------- guest: sign-in code ---------- */

export function buildCodeEmail({ email, code, locale }) {
  const t = getDictionary(locale).emails.code;
  const title = fillTemplate(t.subject, { code });

  const html = layout({
    locale,
    title,
    preheader: t.preheader,
    body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
${brandHeader(t.eyebrow)}
<tr><td align="center" style="padding:28px 20px;background-color:${COLORS.paper};border-radius:12px;font-family:${FONTS.type};font-size:40px;font-weight:600;letter-spacing:12px;color:${COLORS.ink};">${escapeHtml(code)}</td></tr>
<tr><td align="center" style="padding-top:24px;font-family:${FONTS.body};font-size:16px;line-height:1.5;color:${COLORS.cream};">${escapeHtml(t.message)}</td></tr>
<tr><td align="center" style="padding-top:16px;font-family:${FONTS.body};font-size:12px;line-height:1.5;color:${COLORS.muted};">${escapeHtml(t.ignore)}</td></tr>
</table>`,
  });

  return {
    to: email,
    subject: title,
    html,
    text: `PIZZA PIATTO\n\n${code}\n\n${t.message}\n\n${t.ignore}`,
  };
}
