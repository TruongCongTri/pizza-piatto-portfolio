/* real-world details of the shop, shared by metadata, nav, reservation and
   reviews; sources: the Pizza Piatto Facebook page and Google Maps listing */
export const RESTAURANT = {
  name: "Pizza Piatto",
  phone: "034 662 7237",
  phoneIntl: "+84 34 662 7237",
  email: "pizzapiattovn@gmail.com",
  instagramHandle: "@pizzapiattosg",
  address: {
    street: "91K Cư Xá Lý Thường Kiệt, Nguyễn Kim",
    ward: "Diên Hồng",
    city: "Hồ Chí Minh",
    postalCode: "700000",
    country: "VN",
  },
  geo: { latitude: 10.7609123, longitude: 106.6617272 },
  links: {
    instagram: "https://www.instagram.com/pizzapiattosg/",
    facebook: "https://www.facebook.com/profile.php?id=100078662955818",
    facebookReviews:
      "https://www.facebook.com/profile.php?id=100078662955818&sk=reviews",
    googleMaps: "https://maps.google.com/?cid=8418144040944946322",
  },
  /* resolves to the Google Maps listing; GOOGLE_PLACE_ID overrides it */
  googlePlaceId: "ChIJaRaBSGkvdTERkkyYbGdB03Q",
  /* bookings, "today" and opening hours are all in shop time */
  timeZone: "Asia/Ho_Chi_Minh",
  /* where new-booking receipts are emailed: a demo inbox for now, switch it
     to `email` (the shop's own address) when bookings go live;
     RESERVATION_INBOX overrides it */
  bookingInbox: "tri.tcong@gmail.com",
  /* opening hours per weekday (0 = Sunday), null = closed */
  hours: [
    null,
    ["17:30", "19:45"],
    ["17:30", "19:45"],
    ["17:30", "19:45"],
    ["17:30", "19:45"],
    ["17:30", "19:45"],
    ["11:00", "19:45"],
  ],
  /* extra days off on top of Sundays (holidays, Tết, private events), as
     "YYYY-MM-DD"; nothing can be booked on them */
  closedDates: [],
  /* the dining room: two tables for two, and two tables for four that can
     each be split into two tables for two */
  tables: [
    { id: "1", seats: 2 },
    { id: "2", seats: 2 },
    { id: "3", seats: 4, split: [2, 2] },
    { id: "4", seats: 4, split: [2, 2] },
  ],
};

const SLOT_STEP_MINUTES = 30;
/* last table is booked this long before closing */
const LAST_BOOKING_BEFORE_CLOSE = 45;

export const toMinutes = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export const toTime = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/* bookable times for a weekday, e.g. ["17:30", "18:00", "18:30", "19:00"];
   `notBefore` (minutes after midnight) drops times that have already passed */
export function getTimeSlots(weekday, notBefore = 0) {
  const hours = RESTAURANT.hours[weekday];
  if (!hours) return [];

  const open = toMinutes(hours[0]);
  const last = toMinutes(hours[1]) - LAST_BOOKING_BEFORE_CLOSE;
  const slots = [];
  for (let time = open; time <= last; time += SLOT_STEP_MINUTES) {
    if (time >= notBefore) slots.push(toTime(time));
  }
  return slots;
}
