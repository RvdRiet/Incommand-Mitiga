"use client";

import { useRef } from "react";

import { useEventId, useIncidentStore } from "@/context/EventContext";
import { useDeviceRegistry } from "@/lib/devices/store";
import type { DistressKind } from "@/lib/incident/types";
import { useReconnectingWebSocket } from "@/lib/net/reconnecting-socket";
import { getTracksStore } from "@/lib/tracks/store";

const WS_URL = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL;
const SEEN_THROTTLE_MS = 30_000;
/** How often a unit's last-known GPS is written back to the store (so it plots when idle). */
const POS_SAVE_THROTTLE_MS = 8_000;

/**
 * Global bridge from the telemetry service's `distress` messages (e.g. an L310 bodycam SOS
 * relayed via the MQTT bridge) into the incident's distress state. Runs at the layout level
 * so a distress fires the takeover banner + map auto-focus from any module.
 *
 * Only active when NEXT_PUBLIC_TELEMETRY_WS_URL is configured; otherwise distress comes
 * solely from the manual (simulate-device) buttons.
 */
export function useTelemetryDistress() {
  const eventId = useEventId();
  const raiseDistress = useIncidentStore((s) => s.raiseDistress);
  const fieldUnits = useIncidentStore((s) => s.fieldUnits);
  const distressEvents = useIncidentStore((s) => s.distressEvents);
  const updateFieldUnit = useIncidentStore((s) => s.updateFieldUnit);
  const markSeen = useDeviceRegistry((s) => s.markSeen);

  // Read latest state inside the socket handler without re-opening the connection.
  const unitsRef = useRef(fieldUnits);
  const eventsRef = useRef(distressEvents);
  const seenRef = useRef<Map<string, number>>(new Map());
  const posSavedRef = useRef<Map<string, number>>(new Map());
  unitsRef.current = fieldUnits;
  eventsRef.current = distressEvents;

  useReconnectingWebSocket(
    WS_URL,
    {
      onOpen: (ws) =>
        ws.send(JSON.stringify({ t: "hello", role: "operator", incidentId: eventId, units: [] })),
      onMessage: (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      // Any device that reports in is remembered in the org-wide registry (throttled;
      // auto-registers ids we've never seen), so the fleet builds itself.
      if (msg.t === "fix" || msg.t === "distress") {
        const uid = String(msg.unitId ?? "");
        if (uid) {
          const now = Date.now();
          const last = seenRef.current.get(uid) ?? 0;
          if (now - last > SEEN_THROTTLE_MS) {
            seenRef.current.set(uid, now);
            const name = typeof msg.name === "string" ? msg.name : undefined;
            markSeen(uid, name);
          }
        }
      }

      // Persist a tracked field unit's last-known position so it still plots on the map when the
      // device goes quiet (units carry no other saved position). Throttled to limit store writes.
      if (msg.t === "fix") {
        const uid = String(msg.unitId ?? "");
        const lat = Number(msg.lat);
        const lng = Number(msg.lng);
        if (
          uid &&
          Number.isFinite(lat) &&
          Number.isFinite(lng) &&
          unitsRef.current.some((u) => u.id === uid)
        ) {
          const now = Date.now();
          const last = posSavedRef.current.get(uid) ?? 0;
          if (now - last > POS_SAVE_THROTTLE_MS) {
            posSavedRef.current.set(uid, now);
            updateFieldUnit(uid, { lat, lng });
          }
          // Movement history: append to the unit's full incident track (gated inside the store
          // by distance/interval so stationary time doesn't bloat localStorage).
          getTracksStore(eventId).getState().append(uid, { lat, lng, t: now });
        }
      }

      if (msg.t !== "distress") return;

      const unitId = String(msg.unitId ?? "");
      // Only raise for units we actually track (id must match a field unit).
      if (!unitsRef.current.some((u) => u.id === unitId)) return;
      // De-dupe: ignore repeat SOS pings while one is already open for this unit.
      const alreadyOpen = eventsRef.current.some(
        (d) => d.unitId === unitId && (d.status === "active" || d.status === "acknowledged"),
      );
      if (alreadyOpen) return;

      const kind: DistressKind =
        msg.kind === "man_down" || msg.kind === "duress" ? msg.kind : "sos";
      const coords =
        typeof msg.lat === "number" && typeof msg.lng === "number"
          ? { lat: msg.lat, lng: msg.lng }
          : undefined;
      raiseDistress(unitId, kind, "auto", coords);
      },
    },
    [eventId],
  );
}
