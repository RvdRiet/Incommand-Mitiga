import { redirect } from "next/navigation";

/** Legacy route — redirect to events home (pick or create an event). */
export default function LegacyDashboardPage() {
  redirect("/");
}
