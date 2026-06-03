import { redirect } from "next/navigation";

/** Legacy module routes redirect to events home. */
export default function LegacyModulePage() {
  redirect("/");
}
