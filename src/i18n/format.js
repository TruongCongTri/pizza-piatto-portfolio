/* "Thank you, {name}" + { name: "Lan" } -> "Thank you, Lan" */
export function fillTemplate(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}

/* "1 guest" / "4 guests", with the labels from dict.reserve */
export function formatGuests(count, { guestOne, guestOther }) {
  return `${count} ${count === 1 ? guestOne : guestOther}`;
}
