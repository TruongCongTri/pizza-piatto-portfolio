import TicketView from "@/components/Workshops/TicketView";
import { buildPageMetadata } from "@/i18n/metadata";

/* a student's own ticket: kept out of search results, and its secret link
   is never passed on to other sites */
export async function generateMetadata({ params }) {
  const { locale, id } = await params;
  return {
    ...buildPageMetadata(locale, { page: "workshopTicket", path: `/workshops/ticket/${id}` }),
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

/* payment providers add their own query to the return address, sometimes
   after a second "?": only the part before it is ours */
const ours = (value) => (typeof value === "string" ? value.split("?")[0] : "");

export default async function ClassTicketPage({ params, searchParams }) {
  const { id } = await params;
  const query = await searchParams;
  return (
    <TicketView
      id={id}
      token={ours(query.t)}
      checkout={ours(query.checkout) === "cancelled" ? "cancelled" : null}
    />
  );
}
