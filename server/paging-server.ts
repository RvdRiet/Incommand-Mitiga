/**
 * Live Ops paging WebSocket service (RFC-005 §3).
 *
 * Delivers pages from operators to the field units on a channel, and relays the
 * acknowledged state machine back: `queued → delivered → ack`, per recipient.
 *   - real devices receive the page and send `{ t:"receipt", status:"delivered"|"ack" }`
 *   - demo mode (default) auto-generates delivered/ack receipts for recipients that have
 *     no connected device, so the client read-receipt panel fills in end-to-end.
 *
 * Run: `npm run paging`  (port via PAGING_PORT, default 8788)
 * Point the client at it with NEXT_PUBLIC_PAGING_WS_URL=ws://localhost:8788
 */
import { WebSocketServer, type WebSocket } from "ws";

const PORT = Number(process.env.PAGING_PORT ?? 8788);
const DEMO = process.env.PAGING_DEMO !== "0";
const DELIVERED_MS = 800;
const ACK_MS = 1900;

type Room = { operators: Set<WebSocket>; devices: Map<string, WebSocket> };

const rooms = new Map<string, Room>();

function room(incidentId: string): Room {
  let r = rooms.get(incidentId);
  if (!r) {
    r = { operators: new Set(), devices: new Map() };
    rooms.set(incidentId, r);
  }
  return r;
}

function toOperators(r: Room, msg: unknown) {
  const data = JSON.stringify(msg);
  for (const op of r.operators) if (op.readyState === op.OPEN) op.send(data);
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  let incidentId: string | null = null;
  let role: "operator" | "device" | null = null;
  let unitId: string | null = null;

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
      if (role === "operator") r.operators.add(ws);
      else {
        unitId = String(msg.unitId ?? "");
        if (unitId) r.devices.set(unitId, ws);
      }
      return;
    }

    // Operator dispatches a page to the recipients on a channel.
    if (msg.t === "page" && incidentId) {
      const r = room(incidentId);
      const pageId = String(msg.pageId);
      const recipients = Array.isArray(msg.recipients) ? (msg.recipients as string[]).map(String) : [];
      const body = String(msg.body ?? "");

      for (const rid of recipients) {
        const device = r.devices.get(rid);
        if (device && device.readyState === device.OPEN) {
          // Real device: forward the page; it will send its own receipts.
          device.send(JSON.stringify({ t: "page", pageId, body, at: new Date().toISOString() }));
        } else if (DEMO) {
          // No device connected — synthesize delivery + ACK so the loop closes.
          setTimeout(() => {
            toOperators(r, { t: "receipt", pageId, unitId: rid, status: "delivered", at: new Date().toISOString() });
          }, DELIVERED_MS + Math.random() * 400);
          setTimeout(() => {
            toOperators(r, { t: "receipt", pageId, unitId: rid, status: "ack", at: new Date().toISOString() });
          }, ACK_MS + Math.random() * 900);
        }
      }
      return;
    }

    // Device reports delivery / acknowledgement.
    if (msg.t === "receipt" && incidentId) {
      toOperators(room(incidentId), {
        t: "receipt",
        pageId: String(msg.pageId),
        unitId: String(msg.unitId ?? unitId ?? ""),
        status: msg.status === "ack" ? "ack" : "delivered",
        at: new Date().toISOString(),
      });
    }
  });

  ws.on("close", () => {
    if (!incidentId) return;
    const r = room(incidentId);
    if (role === "operator") r.operators.delete(ws);
    else if (unitId) r.devices.delete(unitId);
  });
});

// eslint-disable-next-line no-console
console.log(`[paging] ws://localhost:${PORT}  (demo=${DEMO})`);
