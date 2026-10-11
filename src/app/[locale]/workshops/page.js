import { connection } from "next/server";

import WorkshopList from "@/components/Workshops/WorkshopList";
import { listPublicWorkshops } from "@/lib/server/classes";

/* the class calendar, read fresh on every visit since seats change */
export default async function WorkshopsPage() {
  await connection();
  const workshops = await listPublicWorkshops();
  return <WorkshopList workshops={workshops} />;
}
