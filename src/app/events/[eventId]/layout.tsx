import { notFound } from "next/navigation";

import { EventProvider } from "@/context/EventContext";
import { EventSync } from "@/components/events/EventSync";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ eventId: string }>;
};

export default async function EventLayout({ children, params }: LayoutProps) {
  const { eventId } = await params;
  if (!eventId) notFound();

  return (
    <EventProvider eventId={eventId}>
      <EventSync />
      {children}
    </EventProvider>
  );
}
