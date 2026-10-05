/**
 * Live Ops signaling WebSocket service (RFC-005 §1).
 *
 * Handles the control plane for channels: per-channel presence, PTT floor control with
 * command preemption, and join info (media room ids + ICE + a join token). The media
 * itself (LiveKit video, SIP/PTT audio) lives in the media plane — this service only
 * arbitrates who is on a channel and who holds the talk floor.
 *
 * NOTE: the returned `token` is a STRUCTURED PLACEHOLDER. A real deployment mints a
 * LiveKit AccessToken (server SDK + API key/secret) and SIP credentials here.
 *
 * Run: `npm run signaling`  (port via SIGNALING_PORT, default 8789)
 * Point the client at it with NEXT_PUBLIC_SIGNALING_WS_URL=ws://localhost:8789
 */
import { WebSocketServer, type WebSocket } from "ws";

const PORT = Number(process.env.SIGNALING_PORT ?? 8789);
const ICE_SERVERS = [{ urls: process.env.STUN_URL ?? "stun:stun.l.google.com:19302" }];

type Role = "command" | "unit";
type Member = { ws: WebSocket; role: Role; callsign: string };
type Channel = { members: Map<string, Member>; floor: string | null };
type Room = { channels: Map<string, Channel> };

const rooms = new Map<string, Room>();

function room(incidentId: string): Room {
  let r = rooms.get(incidentId);
  if (!r) {
    r = { channels: new Map() };
    rooms.set(incidentId, r);
  }
  return r;
}

function channel(r: Room, channelId: string): Channel {
  let c = r.channels.get(channelId);
  if (!c) {
    c = { members: new Map(), floor: null };
    r.channels.set(channelId, c);
  }
  return c;
}

function broadcastPresence(c: Channel, channelId: string) {
  const participants = [...c.members.entries()].map(([id, m]) => ({
    id,
    callsign: m.callsign,
    role: m.role,
  }));
  const holder = c.floor && c.members.get(c.floor)
    ? { id: c.floor, callsign: c.members.get(c.floor)!.callsign }
    : null;
  const msg = JSON.stringify({ t: "presence", channelId, participants, floorHolder: holder });
  for (const m of c.members.values()) if (m.ws.readyState === m.ws.OPEN) m.ws.send(msg);
}

function tokenFor(channelId: string, identity: string) {
  // Placeholder — replace with a real LiveKit AccessToken in production.
  return Buffer.from(JSON.stringify({ room: channelId, identity, exp: Date.now() + 3600_000 })).toString("base64url");
}

const wss = new WebSocketServer({ port: PORT });

wss.on("connection", (ws) => {
  let incidentId: string | null = null;
  let participantId: string | null = null;
  let role: Role = "unit";
  let callsign = "";
  const joined = new Set<string>();

  ws.on("message", (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (msg.t === "hello") {
      incidentId = String(msg.incidentId ?? "");
      participantId = String(msg.participantId ?? Math.random().toString(36).slice(2));
      role = msg.role === "command" ? "command" : "unit";
      callsign = String(msg.callsign ?? participantId);
      return;
    }

    if (!incidentId || !participantId) return;
    const r = room(incidentId);

    if (msg.t === "join") {
      const channelId = String(msg.channelId);
      const c = channel(r, channelId);
      c.members.set(participantId, { ws, role, callsign });
      joined.add(channelId);
      ws.send(
        JSON.stringify({
          t: "joined",
          channelId,
          media: {
            videoRoom: `vid-${channelId}`,
            sipRoom: `sip-${channelId}`,
            iceServers: ICE_SERVERS,
            token: tokenFor(channelId, participantId),
          },
        }),
      );
      broadcastPresence(c, channelId);
      return;
    }

    if (msg.t === "leave") {
      const channelId = String(msg.channelId);
      const c = r.channels.get(channelId);
      if (!c) return;
      c.members.delete(participantId);
      if (c.floor === participantId) c.floor = null;
      joined.delete(channelId);
      broadcastPresence(c, channelId);
      return;
    }

    if (msg.t === "floor") {
      const channelId = String(msg.channelId);
      const c = r.channels.get(channelId);
      if (!c || !c.members.has(participantId)) return;
      const action = msg.action;

      if (action === "release") {
        if (c.floor === participantId) c.floor = null;
        broadcastPresence(c, channelId);
        return;
      }

      // request: grant if free, or preempt when the requester outranks the holder.
      if (!c.floor) {
        c.floor = participantId;
      } else if (c.floor !== participantId) {
        const holder = c.members.get(c.floor);
        const requesterIsCommand = role === "command";
        const holderIsCommand = holder?.role === "command";
        if (requesterIsCommand && !holderIsCommand) {
          // Preempt: notify the displaced holder.
          holder?.ws.send(
            JSON.stringify({ t: "floor-preempted", channelId, by: callsign }),
          );
          c.floor = participantId;
        }
        // else: denied — holder keeps the floor (a real client would queue/beep).
      }
      broadcastPresence(c, channelId);
    }
  });

  ws.on("close", () => {
    if (!incidentId) return;
    const r = rooms.get(incidentId);
    if (!r) return;
    for (const channelId of joined) {
      const c = r.channels.get(channelId);
      if (!c || !participantId) continue;
      c.members.delete(participantId);
      if (c.floor === participantId) c.floor = null;
      broadcastPresence(c, channelId);
    }
  });
});

// eslint-disable-next-line no-console
console.log(`[signaling] ws://localhost:${PORT}`);
