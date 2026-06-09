"use client";

import dynamic from "next/dynamic";

const EventMapView = dynamic(
  () => import("@/components/map/EventMapView").then((m) => ({ default: m.EventMapView })),
  {
    ssr: false,
    loading: () => <p className="ic-empty-hint">Loading map…</p>,
  },
);

export function MapView() {
  return <EventMapView />;
}
