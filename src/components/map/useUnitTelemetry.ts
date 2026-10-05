"use client";

import { useEffect, useRef, useState } from "react";

import { useEventId } from "@/context/EventContext";
import type { FieldUnit } from "@/lib/incident/types";
import { openReconnectingSocket } from "@/lib/net/reconnecting-socket";

const WS_URL = process.env.NEXT_PUBLIC_TELEMETRY_WS_URL;

export type LiveFix = { lat: number; lng: number };

export type UnitMeta = {
  /** Direction of travel in radians (0 = east, π/2 = north), null if unknown. */
  heading: number | null;
  /** Epoch ms of the last received fix. */
  lastFixAt: number;
  /** True when no fix has arrived within the stale window. */
  stale: boolean;
};

export type LiveTelemetry = {
  /** Current live position per unit id (overrides the unit's last-set position). */
  positions: Map<string, LiveFix>;
  /** Recent track per unit id, as [lng, lat] pairs, for breadcrumb trails. */
  trails: Map<string, [number, number][]>;
  /** Heading / fix-age / stale flag per unit id. */
  meta: Map<string, UnitMeta>;
};

const EMPTY: LiveTelemetry = { positions: new Map(), trails: new Map(), meta: new Map() };
const MAX_TRAIL = 40;
const STEP_METERS_DEG = 0.0004; // ~40 m per tick
const TICK_MS = 1500;
const STALE_MS = 5000; // no fix for 5 s → stale
const OUTAGE_CHANCE = 0.06; // per-tick chance a unit enters a signal outage
const OUTAGE_MIN_MS = 5500;
const OUTAGE_MAX_MS = 9500;

/**
 * Relays live unit locations onto the map.
 *
 * This is the ingest seam for RFC-003 bodycam telemetry: today it runs a local
 * random-walk **simulation** (seeded from each unit's last-set position, with
 * occasional dropouts so units visibly go stale). To wire real devices, replace
 * the interval body with a WebSocket subscription that pushes `{ unitId, lat, lng }`
 * fixes and updates the same position/trail/meta maps — nothing downstream (the map
 * layer, heading vectors, stale roster, distress auto-focus) needs to change.
 *
 * All state is ephemeral (in-memory only), never written to the incident store.
 */
export function useUnitTelemetry(fieldUnits: FieldUnit[], enabled: boolean): LiveTelemetry {
  const [, setTick] = useState(0);
  const eventId = useEventId();
  const stateRef = useRef<LiveTelemetry>(EMPTY);
  const headingRef = useRef<Map<string, number>>(new Map());
  const outageUntilRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!enabled) {
      stateRef.current = EMPTY;
      headingRef.current = new Map();
      outageUntilRef.current = new Map();
      setTick((t) => t + 1);
      return;
    }

    // --- Real feed: subscribe to the telemetry WebSocket when configured. ---
    if (WS_URL) {
      const positions = new Map<string, LiveFix>();
      const trails = new Map<string, [number, number][]>();
      const meta = new Map<string, UnitMeta>();
      const now = Date.now();
      for (const u of fieldUnits) {
        if (u.lat != null && u.lng != null) {
          positions.set(u.id, { lat: u.lat, lng: u.lng });
          trails.set(u.id, [[u.lng, u.lat]]);
          meta.set(u.id, { heading: null, lastFixAt: now, stale: false });
        }
      }
      stateRef.current = { positions, trails, meta };
      setTick((t) => t + 1);

      return openReconnectingSocket(WS_URL, {
        onOpen: (ws) => {
          ws.send(
            JSON.stringify({
              t: "hello",
              role: "operator",
              incidentId: eventId,
              units: fieldUnits
                .filter((u) => u.lat != null && u.lng != null)
                .map((u) => ({ id: u.id, lat: u.lat, lng: u.lng })),
            }),
          );
        },
        onMessage: (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        const prev = stateRef.current;
        const nextPositions = new Map(prev.positions);
        const nextTrails = new Map(prev.trails);
        const nextMeta = new Map(prev.meta);
        if (msg.t === "fix") {
          const id = String(msg.unitId);
          const lat = Number(msg.lat);
          const lng = Number(msg.lng);
          const prevPos = nextPositions.get(id);
          nextPositions.set(id, { lat, lng });
          const trail = [...(nextTrails.get(id) ?? []), [lng, lat] as [number, number]];
          if (trail.length > MAX_TRAIL) trail.shift();
          nextTrails.set(id, trail);
          let heading = typeof msg.heading === "number" ? msg.heading : null;
          if (heading == null && prevPos) heading = Math.atan2(lat - prevPos.lat, lng - prevPos.lng);
          nextMeta.set(id, { heading, lastFixAt: Date.now(), stale: false });
        } else if (msg.t === "presence") {
          const id = String(msg.unitId);
          const m = nextMeta.get(id) ?? { heading: null, lastFixAt: Date.now(), stale: false };
          nextMeta.set(id, { ...m, stale: Boolean(msg.stale) });
        } else {
          return;
        }
        stateRef.current = { positions: nextPositions, trails: nextTrails, meta: nextMeta };
        setTick((t) => t + 1);
        },
      });
    }

    // --- Fallback: local simulation (no backend configured). ---

    const now = Date.now();
    const positions = new Map<string, LiveFix>();
    const trails = new Map<string, [number, number][]>();
    const meta = new Map<string, UnitMeta>();
    for (const u of fieldUnits) {
      if (u.lat != null && u.lng != null) {
        positions.set(u.id, { lat: u.lat, lng: u.lng });
        trails.set(u.id, [[u.lng, u.lat]]);
        meta.set(u.id, { heading: null, lastFixAt: now, stale: false });
        if (!headingRef.current.has(u.id)) {
          headingRef.current.set(u.id, Math.random() * Math.PI * 2);
        }
      }
    }
    stateRef.current = { positions, trails, meta };
    setTick((t) => t + 1);

    const id = window.setInterval(() => {
      const prev = stateRef.current;
      const t = Date.now();
      const nextPositions = new Map<string, LiveFix>();
      const nextTrails = new Map<string, [number, number][]>();
      const nextMeta = new Map<string, UnitMeta>();

      prev.positions.forEach((cur, unitId) => {
        const prevMeta = prev.meta.get(unitId);
        let outageUntil = outageUntilRef.current.get(unitId) ?? 0;
        // Occasionally start a multi-second signal outage so units visibly go stale.
        if (t >= outageUntil && Math.random() < OUTAGE_CHANCE) {
          outageUntil = t + OUTAGE_MIN_MS + Math.random() * (OUTAGE_MAX_MS - OUTAGE_MIN_MS);
          outageUntilRef.current.set(unitId, outageUntil);
        }
        const dropped = t < outageUntil;

        if (dropped) {
          // No fix this tick — hold position, let the fix age toward stale.
          nextPositions.set(unitId, cur);
          nextTrails.set(unitId, prev.trails.get(unitId) ?? [[cur.lng, cur.lat]]);
          const lastFixAt = prevMeta?.lastFixAt ?? t;
          nextMeta.set(unitId, {
            heading: prevMeta?.heading ?? null,
            lastFixAt,
            stale: t - lastFixAt > STALE_MS,
          });
          return;
        }

        let heading = headingRef.current.get(unitId) ?? 0;
        heading += (Math.random() - 0.5) * 0.7; // gentle wander
        headingRef.current.set(unitId, heading);
        const next: LiveFix = {
          lat: cur.lat + Math.sin(heading) * STEP_METERS_DEG,
          lng: cur.lng + Math.cos(heading) * STEP_METERS_DEG,
        };
        nextPositions.set(unitId, next);
        const trail = [...(prev.trails.get(unitId) ?? []), [next.lng, next.lat] as [number, number]];
        if (trail.length > MAX_TRAIL) trail.shift();
        nextTrails.set(unitId, trail);
        nextMeta.set(unitId, { heading, lastFixAt: t, stale: false });
      });

      stateRef.current = { positions: nextPositions, trails: nextTrails, meta: nextMeta };
      setTick((tk) => tk + 1);
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [enabled, fieldUnits, eventId]);

  return stateRef.current;
}
