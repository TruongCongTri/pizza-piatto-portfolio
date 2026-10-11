/* phone numbers are stored in E.164 ("+84346627237"), the form SMS providers
   expect; numbers written the local way ("034 662 7237") are Vietnamese */
const HOME_COUNTRY_CODE = "84";

/* "+84 34 662 7237", "0346627237", "0084 34..." -> "+84346627237";
   null when it cannot be a phone number */
export function normalizePhone(input) {
  const raw = String(input ?? "").trim();
  if (!/^\+?[\d\s().-]+$/.test(raw)) return null;

  let digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    /* already international */
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = HOME_COUNTRY_CODE + digits.slice(1);
  } else if (!(digits.startsWith(HOME_COUNTRY_CODE) && digits.length >= 11)) {
    digits = HOME_COUNTRY_CODE + digits;
  }

  /* Vietnamese mobiles have 9 digits after +84, landlines 10 */
  if (digits.startsWith(HOME_COUNTRY_CODE)) {
    if (!/^84\d{9,10}$/.test(digits)) return null;
  } else if (digits.length < 8 || digits.length > 15) {
    return null;
  }

  return `+${digits}`;
}

/* Vietnamese numbers the way they are written locally, like the shop's
   own "034 662 7237"; anything else stays international */
export function formatPhone(phone) {
  const value = phone ?? "";
  const mobile = /^\+84(\d{2})(\d{3})(\d{4})$/.exec(value);
  if (mobile) return `0${mobile[1]} ${mobile[2]} ${mobile[3]}`;
  const landline = /^\+84(\d{3})(\d{3})(\d{4})$/.exec(value);
  if (landline) return `0${landline[1]} ${landline[2]} ${landline[3]}`;
  return value;
}

/* "034 ••• 7237": enough to recognise, not enough to read off a screen */
export function maskPhone(phone) {
  const formatted = formatPhone(phone);
  const groups = formatted.split(" ");
  if (groups.length < 3) return `•••${formatted.slice(-4)}`;
  return groups
    .map((group, index) =>
      index === 0 || index === groups.length - 1 ? group : "•••",
    )
    .join(" ");
}
