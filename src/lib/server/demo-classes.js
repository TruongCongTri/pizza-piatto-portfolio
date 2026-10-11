import "server-only";

import { randomBytes, randomInt } from "node:crypto";

import { addDays, shopInstant } from "@/lib/booking";
import { toTime } from "@/lib/restaurant";
import { HOLD_MINUTES } from "@/lib/workshops";

/* sample pizza classes for demos and testing, built around today:

   - one running today, with check-in open and a bit of everything: paid,
     checked in, waiting for payment and waiting for a refund;
   - one next week, open for booking through the test checkout;
   - one that has happened, with a recap.

   Titles say "sample", every record carries `demo: true` (so clearing never
   touches real classes), students are made up with phones in a fake
   090 000 02xx range and example.com emails. The recap photos are the
   shop's own pictures from its classes. */

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PRICE = 100_000;

const code = (prefix, length = 6) =>
  prefix + Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");

const STUDENTS = [
  ["Nguyễn Minh Anh", "vi"],
  ["Trần Gia Bảo", "vi"],
  ["Emma Laurent", "en"],
  ["Lê Thu Hà", "vi"],
  ["Phạm Quốc Huy", "vi"],
  ["James Carter", "en"],
  ["Võ Ngọc Trâm", "vi"],
  ["Đặng Hải Long", "vi"],
  ["Hoàng Mai Linh", "vi"],
  ["Lucas Moreau", "en"],
  ["Bùi Thanh Tùng", "vi"],
];

const COMMON = {
  summary: {
    vi: "Lớp mẫu để thử đăng ký, thanh toán và điểm danh. Không phải lịch học thật.",
    en: "A sample class for trying out booking, payment and check-in. Not a real class date.",
  },
  description: {
    vi: "Dữ liệu mẫu, chỉ có trên trang chạy thử.\n\nLớp dạy chủ yếu về dough: bột, men, muối, nước, và sự khác biệt giữa ủ ngắn với ủ dài. Học xong, bạn luyện tập ở nhà và gửi bài để được góp ý.",
    en: "Sample data, only on test sites.\n\nThe class is mostly about dough: flour, yeast, salt and water, and how a short rise differs from a long one. Afterwards you practise at home and send in your bakes for feedback.",
  },
  learn: {
    vi: [
      "Bột, men, muối và nước: mỗi thứ làm gì",
      "Ủ ngắn và ủ dài khác nhau thế nào",
      "Luyện tập ở nhà và gửi bài để được góp ý",
    ],
    en: [
      "Flour, yeast, salt and water: what each one does",
      "How a short rise differs from a long one",
      "Practising at home, with feedback on your bakes",
    ],
  },
  capacity: 8,
  price: PRICE,
  currency: "VND",
  instructor: "Phuong Huynh",
  location: { vi: "", en: "" },
  cover: "",
  bookingClosesHours: 24,
  refundUntilHours: 72,
  status: "published",
  source: "",
  demo: true,
};

const RECAP_IMAGES = [
  {
    url: "/chefs/avatar3.jpg",
    width: 600,
    height: 600,
    caption: { vi: "Lớp học làm pizza của Pizza Piatto", en: "A Pizza Piatto pizza class" },
  },
  {
    url: "/chefs/avatar8.jpg",
    width: 600,
    height: 600,
    caption: { vi: "Phuong Huynh trong giờ học", en: "Phuong Huynh during a pizza class" },
  },
  {
    url: "/chefs/avatar4.jpg",
    width: 600,
    height: 600,
    caption: { vi: "Phuong Huynh đứng lớp", en: "Phuong Huynh teaching" },
  },
  { url: "/about/sticky-card-5.jpg", width: 1120, height: 1400, caption: { vi: "", en: "" } },
];

function workshop({ title, slug, sessions, recap, at }) {
  return {
    id: code("WS-"),
    slug,
    title,
    ...COMMON,
    sessions,
    recap: recap ?? { text: { vi: "", en: "" }, images: [] },
    createdAt: at,
    updatedAt: at,
  };
}

/* a student's booking and (for a paid one) its payment, as the booking
   flow would have left them */
function booking(workshop, index, { status, seats = 1, bookedAt, paid = true }) {
  const [name, locale] = STUDENTS[index % STUDENTS.length];
  const id = code("PC-");
  const at = new Date(bookedAt).toISOString();
  const amount = seats * workshop.price;
  const enrollment = {
    id,
    workshopId: workshop.id,
    name,
    phone: `+849000002${String(index).padStart(2, "0")}`,
    email: `${name.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/đ/g, "d").replace(/[^a-z]+/g, ".")}@example.com`,
    seats,
    locale,
    amount,
    currency: "VND",
    status,
    holdExpiresAt: new Date(bookedAt + HOLD_MINUTES * 60_000).toISOString(),
    accessToken: randomBytes(18).toString("base64url"),
    paymentId: null,
    demo: true,
    createdAt: at,
    updatedAt: at,
    log: [{ at, from: null, to: "pending_payment", by: "student", note: null }],
  };
  if (!paid) return { enrollment, payment: null };

  const paidAt = new Date(bookedAt + 3 * 60_000).toISOString();
  const payment = {
    id: code("PAY-", 10),
    enrollmentId: id,
    workshopId: workshop.id,
    provider: "mock",
    providerRef: `mock_demo_${randomBytes(6).toString("hex")}`,
    amount,
    currency: "VND",
    status: "succeeded",
    checkoutUrl: null,
    expiresAt: enrollment.holdExpiresAt,
    paidAt,
    createdAt: at,
    updatedAt: paidAt,
    log: [
      { at, from: null, to: "requires_payment", source: "system", note: null },
      { at: paidAt, from: "requires_payment", to: "succeeded", source: "webhook", note: null },
    ],
  };
  enrollment.paymentId = payment.id;
  enrollment.paidAt = paidAt;
  if (status === "attended") enrollment.checkedInAt = paidAt;
  if (status === "refund_pending") {
    enrollment.refundReason = "staffCancelled";
    payment.status = "refund_pending";
    payment.refundReason = "staffCancelled";
  }
  return { enrollment, payment };
}

export function buildDemoClasses(clock) {
  const now = Date.now();
  const at = new Date(now).toISOString();
  const today = clock.dateKey;

  /* today's class started a little while ago, so check-in is open */
  const start = Math.max(0, Math.floor((clock.minutes - 30) / 30) * 30);
  const end = Math.min(23 * 60 + 59, start + 180);
  const todayClass = workshop({
    title: { vi: "Lớp mẫu: Bột pizza hôm nay", en: "Sample class: Dough day" },
    slug: `sample-class-${today}`,
    sessions: [{ date: today, start: toTime(start), end: toTime(end) }],
    at,
  });

  const nextWeek = addDays(today, 7);
  const openClass = workshop({
    title: { vi: "Lớp mẫu: Bột pizza cơ bản", en: "Sample class: Pizza dough basics" },
    slug: `sample-class-${nextWeek}`,
    sessions: [{ date: nextWeek, start: "09:00", end: "12:00" }],
    at,
  });

  const lastMonth = addDays(today, -12);
  const pastClass = workshop({
    title: { vi: "Lớp mẫu: Ủ ngắn và ủ dài", en: "Sample class: Short and long rise" },
    slug: `sample-class-${lastMonth}`,
    sessions: [{ date: lastMonth, start: "09:00", end: "12:00" }],
    recap: {
      text: {
        vi: "Ghi chép mẫu: đây là chỗ tiệm kể lại buổi học và đăng ảnh sau khi lớp kết thúc.",
        en: "Sample notes: this is where the shop tells how the class went and adds photos afterwards.",
      },
      images: RECAP_IMAGES.map((image, index) => ({
        id: `IMG-demo${index}`,
        key: null,
        store: "static",
        addedAt: at,
        ...image,
      })),
    },
    at,
  });

  const daysAgo = (days, minutes = 0) =>
    shopInstant(addDays(today, -days), 10 * 60) + minutes * 60_000;
  const items = [
    booking(todayClass, 0, { status: "confirmed", seats: 2, bookedAt: daysAgo(9) }),
    booking(todayClass, 1, { status: "confirmed", bookedAt: daysAgo(6, 25) }),
    booking(todayClass, 2, { status: "attended", bookedAt: daysAgo(5, 40) }),
    booking(todayClass, 3, { status: "confirmed", bookedAt: daysAgo(3, 5) }),
    booking(todayClass, 4, { status: "refund_pending", bookedAt: daysAgo(4, 15) }),
    booking(openClass, 5, { status: "confirmed", seats: 2, bookedAt: daysAgo(2) }),
    /* someone at the payment page right now */
    booking(openClass, 6, { status: "pending_payment", bookedAt: now - 4 * 60_000, paid: false }),
    ...[7, 8, 9, 10].map((index) =>
      booking(pastClass, index, { status: "attended", bookedAt: daysAgo(20 + index) }),
    ),
    booking(pastClass, 1, { status: "attended", seats: 2, bookedAt: daysAgo(25) }),
  ];

  return {
    workshops: [todayClass, openClass, pastClass],
    enrollments: items.map((item) => item.enrollment),
    payments: items.map((item) => item.payment).filter(Boolean),
  };
}
