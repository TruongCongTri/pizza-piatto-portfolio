/* shown until GOOGLE_PLACES_API_KEY is set: real recommendations from the
   Pizza Piatto Facebook page. Review text lives in the dictionaries under
   `testimonials.reviews`; `lang` is the language it was written in */
export const fallbackReviews = [
  { id: "tranVanTrang", name: "Tran Van Trang", lang: "vi" },
  { id: "tranQuynhDac", name: "Tran Quynh Dac", lang: "vi" },
  { id: "violetParisi", name: "Violet Parisi", lang: "en" },
  { id: "minhThu", name: "Minh Thư", lang: "vi" },
  { id: "linhChi", name: "Linh Chi", lang: "vi" },
  { id: "senChanDoi", name: "Sên Chan Đợi", lang: "vi" },
  { id: "nguyenNghia", name: "Nguyễn Nghĩa", lang: "vi" },
];

/* "Nguyễn Nghĩa" -> "NN" */
export function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}
