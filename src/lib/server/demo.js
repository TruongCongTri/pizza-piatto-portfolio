import "server-only";

import { getRestaurantClock, getVisitState, MAX_UPCOMING_PER_PHONE } from "@/lib/booking";
import {
  buildDemoReservations,
  buildGuestHistory,
  DEMO_GUEST_PHONE,
} from "@/lib/demo-reservations";
import { normalizePhone } from "@/lib/phone";

import { enrollmentsDb, paymentsDb, workshopsDb } from "./collections";
import { buildDemoClasses } from "./demo-classes";
import { deleteReservations, insertReservations, listReservations } from "./store";
import { deleteImage } from "./uploads";

/* sample-data tools: on in development, or on a demo deployment with
   DEMO_TOOLS=true; off on a live shop's site */
export const demoToolsEnabled =
  process.env.DEMO_TOOLS === "true" || process.env.NODE_ENV !== "production";

/* replaces any earlier samples with a fresh set around today; a sample
   history made for a particular number (seedDemoGuest) stays */
export async function seedDemoReservations() {
  const all = await listReservations();
  const removed = await deleteReservations(
    all.filter((reservation) => reservation.demo && !reservation.demoGuest),
  );
  const kept = all.filter((reservation) => !reservation.demo || reservation.demoGuest);
  const added = await insertReservations(
    buildDemoReservations(getRestaurantClock(), kept),
  );
  return { added, removed, guestPhone: DEMO_GUEST_PHONE };
}

/* a sample booking history for one phone number (lib/demo-reservations
   buildGuestHistory), under the name and email of that number's latest
   booking. Replaces an earlier sample history for the same number, never
   touches its real bookings, and leaves room for one more booking of its
   own within the per-phone limit. */
export async function seedDemoGuest({ phone: input } = {}) {
  const phone = normalizePhone(input);
  if (!phone) return { error: "invalidPhone" };
  const all = await listReservations();
  const removed = await deleteReservations(
    all.filter((reservation) => reservation.phone === phone && reservation.demoGuest),
  );
  const others = all.filter((reservation) => !(reservation.phone === phone && reservation.demoGuest));
  const own = others
    .filter((reservation) => reservation.phone === phone)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const latest = own.at(-1);
  const clock = getRestaurantClock();
  const upcoming = own.filter((reservation) => getVisitState(reservation, clock).canCancel).length;
  const added = await insertReservations(
    buildGuestHistory(
      {
        name: latest?.name || "Khách mẫu",
        phone,
        email: latest?.email ?? null,
        locale: latest?.locale ?? "vi",
      },
      clock,
      others,
      { upcomingAllowed: Math.max(0, MAX_UPCOMING_PER_PHONE - 1 - upcoming) },
    ),
  );
  return { added, removed, phone };
}

export async function clearDemoReservations() {
  const samples = (await listReservations()).filter((reservation) => reservation.demo);
  return { removed: await deleteReservations(samples) };
}

/* sample classes, with their bookings and payments (lib/server/demo-classes) */
export async function seedDemoClasses() {
  const { removed } = await clearDemoClasses();
  const { workshops, enrollments, payments } = buildDemoClasses(getRestaurantClock());
  for (const workshop of workshops) await workshopsDb.insert(workshop);
  for (const enrollment of enrollments) await enrollmentsDb.insert(enrollment);
  for (const payment of payments) await paymentsDb.insert(payment);
  return { added: workshops.length, removed };
}

/* removes sample classes and everything booked on them, including test
   bookings made through the site and photos uploaded to their recaps */
export async function clearDemoClasses() {
  const samples = (await workshopsDb.list()).filter((workshop) => workshop.demo);
  for (const workshop of samples) {
    for (const enrollment of await enrollmentsDb.listBy("workshopId", workshop.id)) {
      for (const payment of await paymentsDb.listBy("enrollmentId", enrollment.id)) {
        await paymentsDb.remove(payment);
      }
      await enrollmentsDb.remove(enrollment);
    }
    await Promise.all((workshop.recap?.images ?? []).map(deleteImage));
    await workshopsDb.remove(workshop);
  }
  return { removed: samples.length };
}
