"use client";

import { useEffect, useRef } from "react";

import { useEventId, useIncidentStore } from "@/context/EventContext";
import { useEventsStore } from "@/lib/events/store";
import type { EventStatus } from "@/lib/events/types";

function activationToStatus(level: string): EventStatus {
  if (level === "activated") return "activated";
  if (level === "closed") return "closed";
  if (level === "planning") return "planning";
  return "none";
}

/** Sync event registry ↔ incident situation (per event). */
export function EventSync() {
  const eventId = useEventId();
  const event = useEventsStore((s) => s.events.find((e) => e.id === eventId));
  const situation = useIncidentStore((s) => s.situation);
  const updateSituation = useIncidentStore((s) => s.updateSituation);
  const updateEvent = useEventsStore((s) => s.updateEvent);
  const hydrated = useRef(false);

  useEffect(() => {
    if (!event || hydrated.current) return;
    updateSituation({
      name: event.name,
      lat: event.lat,
      lng: event.lng,
      startDate: event.startDate || situation.startDate,
    });
    hydrated.current = true;
  }, [event, updateSituation, situation.startDate]);

  useEffect(() => {
    if (!hydrated.current) return;
    updateEvent(eventId, {
      name: situation.name,
      lat: situation.lat,
      lng: situation.lng,
      startDate: situation.startDate,
      status: activationToStatus(situation.activationLevel),
    });
  }, [
    eventId,
    situation.name,
    situation.lat,
    situation.lng,
    situation.startDate,
    situation.activationLevel,
    updateEvent,
  ]);

  return null;
}
