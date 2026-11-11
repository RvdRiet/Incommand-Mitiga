import { notFound } from "next/navigation";

import { IncidentLayout } from "@/components/incident/IncidentLayout";
import { isRouteInEdition } from "@/lib/editions";
import { getModuleBySlug } from "@/lib/navigation/modules";

type PageProps = {
  params: Promise<{ eventId: string; module: string }>;
};

export default async function EventModulePage({ params }: PageProps) {
  const { module } = await params;
  // Unknown module, or one hidden by the active product edition → 404.
  if (!getModuleBySlug(module) || !isRouteInEdition(module)) {
    notFound();
  }
  return <IncidentLayout moduleSlug={module} />;
}
