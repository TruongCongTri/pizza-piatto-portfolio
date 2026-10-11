import { RESTAURANT } from "./restaurant";

const PLACES_API = "https://places.googleapis.com/v1/places";
const FIELD_MASK = "rating,userRatingCount,googleMapsUri,reviews";
/* Google allows caching review content; refresh twice a day */
const REVALIDATE_SECONDS = 60 * 60 * 12;

/* reviews straight from the Google Maps listing via the Places API (New);
   returns null when no key is configured or the request fails, so the
   testimonials fall back to their bundled reviews */
export async function getGoogleReviews(locale) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return null;

  const placeId = process.env.GOOGLE_PLACE_ID || RESTAURANT.googlePlaceId;

  try {
    const response = await fetch(
      `${PLACES_API}/${placeId}?languageCode=${locale}`,
      {
        headers: {
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": FIELD_MASK,
        },
        next: { revalidate: REVALIDATE_SECONDS },
      },
    );

    if (!response.ok) {
      console.error(`Google reviews request failed: ${response.status}`);
      return null;
    }

    const place = await response.json();
    const reviews = (place.reviews ?? [])
      .filter((review) => review.text?.text)
      .map((review) => ({
        id: review.name,
        name: review.authorAttribution?.displayName ?? "Google user",
        photo: review.authorAttribution?.photoUri ?? null,
        authorUrl: review.authorAttribution?.uri ?? null,
        rating: review.rating ?? null,
        text: review.text.text,
        translated:
          Boolean(review.originalText?.languageCode) &&
          review.originalText.languageCode !== review.text.languageCode,
      }));

    if (!reviews.length) return null;

    return {
      rating: place.rating ?? null,
      count: place.userRatingCount ?? null,
      url: place.googleMapsUri ?? RESTAURANT.links.googleMaps,
      reviews,
    };
  } catch (error) {
    console.error("Google reviews request failed:", error);
    return null;
  }
}
