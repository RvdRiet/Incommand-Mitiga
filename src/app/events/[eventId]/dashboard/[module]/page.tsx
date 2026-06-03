import { notFound } from "next/navigation";

import { IncidentLayout } from "@/components/incident/IncidentLayout";
import { getModuleBySlug } from "@/lib/navigation/modules";

type PageProps = {
  params: Promise<{ eventId: string; module: string }>;
};

export default async function EventModulePage({ params }: PageProps) {
  const { module } = await params;
  if (!getModuleBySlug(module)) {
    notFound();
  }
  return <IncidentLayout moduleSlug={module} />;
}
