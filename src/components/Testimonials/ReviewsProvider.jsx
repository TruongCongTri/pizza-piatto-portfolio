"use client";

import { createContext, useContext } from "react";

/* Google reviews fetched on the server in the [locale] layout */
const ReviewsContext = createContext(null);

export function ReviewsProvider({ reviews, children }) {
  return (
    <ReviewsContext.Provider value={reviews}>{children}</ReviewsContext.Provider>
  );
}

export function useGoogleReviews() {
  return useContext(ReviewsContext);
}
