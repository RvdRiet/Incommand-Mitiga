/**
 * Live Ops telemetry WebSocket service (RFC-005 §2).
 *
 * Fans out field-unit GPS fixes to operators, per incident. Two input modes:
 *   - real devices push `{ t:"fix", unitId, lat, lng, ... }`
 *   - demo mode (default) random-walks any operator-seeded units that have no device,
 *     so the map layer moves end-to-end without hardware.
 *
 * Run: `npm run telemetry`  (port via TELEMETRY_PORT, default 8787)
 * Point the client at it with NEXT_PUBLIC_TELEMETRY_WS_URL=ws://localhost:8787
 */
import { WebSocketServer, type WebSocket } from "ws";

const PORT = Number(process.env.TELEMETRY_PORT ?? 8787);
const DEMO = process.env.TELEMETRY_DEMO !== "0"; // demo movement on by default
const TICK_MS = 1500;
const STALE_MS = 5000;
const STEP = 0.0004;
const OUTAGE_CHANCE = 0.06;

type Unit = {
  lat: number;
  lng: number;
  heading: number;
  lastFixAt: number;
  deviceBacked: boolean;
  outageUntil: number;
};

type Room = { operators: Set<WebSocket>; units: Map<string, Unit> };

const rooms = new Map<string, Room>();

function room(incidentId: string): Room {
  let r = rooms.get(incidentId);
  if (!r) {
    r = { operators: new Set(), units: new Map() };
    rooms.set(incidentId, r);
  }
  return r;
}

function broadcast(r: Room, msg: unknown) {
  const data = JSON.stringify(msg);
  for (const op of r.operators) {
    if (op.readyState === op.OPEN) op.send(data);
  }
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  let incidentId: string | null = null;
  let role: "operator" | "device" | null = null;

  ws.on("message", (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.t === "hello") {
      incidentId = String(msg.incidentId ?? "");
      role = msg.role === "device" ? "device" : "operator";
      const r = room(incidentId);
      if (role === "operator") {
        r.operators.add(ws);
        // Seed units the operator knows about (from client config).
        const units = Array.isArray(msg.units) ? (msg.units as Array<Record<string, number | string>>) : [];
        for (const u of units) {
          const id = String(u.id);
          if (!r.units.has(id)) {
            r.units.set(id, {
              lat: Number(u.lat),
              lng: Number(u.lng),
              heading: Math.random() * Math.PI * 2,
              lastFixAt: Date.now(),
              deviceBacked: false,
              outageUntil: 0,
            });
          }
        }
      }
      return;
    }

    if (msg.t === "distress" && incidentId) {
      // Relay a distress signal (e.g. bodycam SOS) to all operators of the incident.
      broadcast(room(incidentId), {
        t: "distress",
        unitId: String(msg.unitId ?? ""),
        kind: msg.kind ?? "sos",
        lat: msg.lat,
        lng: msg.lng,
        at: new Date().toISOString(),
      });
      return;
    }

    if (msg.t === "fix" && incidentId) {
      // A real device fix — record and fan out; stop demo-driving this unit.
      const r = room(incidentId);
      const id = String(msg.unitId);
      r.units.set(id, {
        lat: Number(msg.lat),
        lng: Number(msg.lng),
        heading: Number(msg.heading ?? 0),
        lastFixAt: Date.now(),
        deviceBacked: true,
        outageUntil: 0,
      });
      broadcast(r, {
        t: "fix",
        unitId: id,
        lat: Number(msg.lat),
        lng: Number(msg.lng),
        heading: msg.heading,
        ...(typeof msg.name === "string" && msg.name ? { name: msg.name } : {}),
        stale: false,
        at: new Date().toISOString(),
      });
    }
  });

  ws.on("close", () => {
    if (incidentId && role === "operator") room(incidentId).operators.delete(ws);
  });
});

// Demo driver + stale sweeper.
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.operators.size === 0) continue;
    for (const [id, u] of r.units) {
      if (u.deviceBacked) {
        if (now - u.lastFixAt > STALE_MS) {
          broadcast(r, { t: "presence", unitId: id, stale: true, lastFixAt: new Date(u.lastFixAt).toISOString() });
        }
        continue;
      }
      if (!DEMO) continue;
      if (now >= u.outageUntil && Math.random() < OUTAGE_CHANCE) {
        u.outageUntil = now + 5500 + Math.random() * 4000;
      }
      if (now < u.outageUntil) {
        if (now - u.lastFixAt > STALE_MS) {
          broadcast(r, { t: "presence", unitId: id, stale: true, lastFixAt: new Date(u.lastFixAt).toISOString() });
        }
        continue;
      }
      u.heading += (Math.random() - 0.5) * 0.7;
      u.lat += Math.sin(u.heading) * STEP;
      u.lng += Math.cos(u.heading) * STEP;
      u.lastFixAt = now;
      broadcast(r, {
        t: "fix",
        unitId: id,
        lat: u.lat,
        lng: u.lng,
        heading: u.heading,
        stale: false,
        at: new Date(now).toISOString(),
      });
    }
  }
}, TICK_MS);

// eslint-disable-next-line no-console
console.log(`[telemetry] ws://localhost:${PORT}  (demo=${DEMO})`);
