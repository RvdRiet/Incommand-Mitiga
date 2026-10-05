import { NextResponse } from "next/server";
import mqtt, { type MqttClient } from "mqtt";

import { enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { MIN_WRITE_ROLE, requireSession } from "@/lib/auth/rbac";

/**
 * Emits the bodycam command-channel messages (RFC-007) so an operator can start/stop a channel's
 * live video. Publishes to the units' MQTT circle topic(s); the L310 app subscribes and
 * goes live to `room`.
 *
 *   POST { action: "go_live"|"stop_live", circles: string[], room, channelId }
 *
 * The bodycam ignores messages with no `deviceId` or with its own id, so we send a non-device
 * sentinel id. `room` MUST equal what the web ChannelVideo subscribes to (channel.videoRoom ||
 * `vid-<channelId>`) — that's the room alignment.
 */
const MQTT_URL = process.env.MQTT_URL ?? "mqtts://broker.hivemq.com:8883";
const TOPIC_PREFIX = "vespera";
const SENDER_ID = "incommand-web";

type G = { __commsMqtt?: Promise<MqttClient> };

function getClient(): Promise<MqttClient> {
  const g = globalThis as G;
  if (g.__commsMqtt) return g.__commsMqtt;
  const p = new Promise<MqttClient>((resolve, reject) => {
    const c = mqtt.connect(MQTT_URL, { reconnectPeriod: 5000 });
    let settled = false;
    c.on("connect", () => {
      if (!settled) {
        settled = true;
        resolve(c);
      }
    });
    c.on("error", () => {});
    setTimeout(() => {
      if (!settled) {
        settled = true;
        c.end(true);
        reject(new Error("mqtt connect timeout"));
      }
    }, 8000);
  });
  g.__commsMqtt = p;
  p.catch(() => {
    (globalThis as G).__commsMqtt = undefined;
  });
  return p;
}

export async function POST(req: Request) {
  // Publishing go-live/stop-live drives real bodycams — require a contributor
  // session so an anonymous caller can't force devices to start/stop streaming.
  const session = await requireSession(MIN_WRITE_ROLE);
  if (session instanceof NextResponse) return session;
  const limited = await enforceRateLimit(`golive:${session.userId}`, 30, 60);
  if (limited) return limited;

  let body: { action?: string; circles?: unknown; room?: string; channelId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const action = body.action === "stop_live" ? "stop_live" : "go_live";
  const room = String(body.room ?? "").trim();
  const channelId = String(body.channelId ?? "").trim();
  const circles = Array.isArray(body.circles)
    ? [...new Set(body.circles.map((c) => String(c).trim()).filter(Boolean))]
    : [];

  if (action === "go_live" && !room) {
    return NextResponse.json({ error: "room required" }, { status: 400 });
  }
  if (circles.length === 0) {
    return NextResponse.json({ error: "no target circles (units need an MQTT circle)" }, { status: 400 });
  }

  let client: MqttClient;
  try {
    client = await getClient();
  } catch {
    return NextResponse.json({ error: "mqtt_unavailable" }, { status: 502 });
  }

  const payload = JSON.stringify({
    pv: 1,
    type: action,
    deviceId: SENDER_ID,
    room,
    channelId,
    timestamp: Date.now(),
  });

  await Promise.all(
    circles.map(
      (circle) =>
        new Promise<void>((resolve) => {
          client.publish(`${TOPIC_PREFIX}/${circle}`, payload, { qos: 1 }, () => resolve());
        }),
    ),
  );

  return NextResponse.json({ ok: true, action, room, published: circles.length });
}
