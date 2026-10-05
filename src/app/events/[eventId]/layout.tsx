import { notFound } from "next/navigation";

import { auth } from "@/auth";
import { EventProvider } from "@/context/EventContext";
import { PermissionsProvider } from "@/context/PermissionsContext";
import { EventSync } from "@/components/events/EventSync";
import { ALL_MODULE_SLUGS, ALWAYS_ON } from "@/lib/auth/permissions";
import { allowedModulesForRole } from "@/lib/auth/permissions-server";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
};

export default async function EventLayout({ children, params }: LayoutProps) {
  const { eventId } = await params;
  if (!eventId) notFound();

  // Resolve which modules this user's role may see (server-side → no nav flash).
  // Availability-first: if the backend is unreachable (offline) or slow, fall back
  // to all modules rather than hang or 500 — the workspace must open regardless.
  // Per-module WRITE authorization is still enforced server-side on sync.
  const OPEN = [...ALWAYS_ON, ...ALL_MODULE_SLUGS];
  let allowed: string[] = OPEN;
  try {
    const session = await auth();
    if (session?.tenantId && session.role) {
      allowed = await Promise.race([
        allowedModulesForRole(session.tenantId, session.role),
        new Promise<string[]>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500)),
      ]);
    }
  } catch {
    allowed = OPEN;
  }

  return (
    <EventProvider eventId={eventId}>
      <PermissionsProvider allowed={allowed}>
        <EventSync />
        {children}
      </PermissionsProvider>
    </EventProvider>
  );
}
