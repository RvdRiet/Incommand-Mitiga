/**
 * MQTT → InCommand telemetry bridge.
 *
 * Subscribes to the L310 bodycam app's circle location topic on the public MQTT broker
 * and relays each device's GPS into InCommand's telemetry service as `fix` messages — so
 * the bodycam's *real* position appears on the map with ZERO changes to the Android app.
 *
 *   bodycam (com.life360like)  →  MQTT (vespera/<INVITE.SALT> @ broker.hivemq.com)
 *                              →  [this bridge]  →  telemetry WS (:8787)  →  InCommand map
 *
 * The bodycam location payload (MqttLocationService.publishCurrentLocation):
 *   { pv, type:"location", deviceId, name, latitude, longitude, speed, bearing, batteryLevel }
 * Each device's `deviceId` becomes the InCommand field-unit id — create a unit with that id.
 *
 * Run: `npm run mqtt-bridge`
 * Env:
 *   MQTT_URL         (default mqtts://broker.hivemq.com:8883)
 *   MQTT_CIRCLE      the circle join key "INVITE.SALT" (topic = vespera/<circle>)   [required]
 *   MQTT_TOPIC       full topic override (otherwise built from MQTT_CIRCLE)
 *   TELEMETRY_WS_URL (default ws://localhost:8787)
 *   INCIDENT_ID      the InCommand event id to publish into                         [required]
 */
import mqtt from "mqtt";
import WebSocket from "ws";

const MQTT_URL = process.env.MQTT_URL ?? "mqtts://broker.hivemq.com:8883";
const TOPIC_PREFIX = "vespera";
const CIRCLE = process.env.MQTT_CIRCLE ?? "";
const TOPIC = process.env.MQTT_TOPIC ?? (CIRCLE ? `${TOPIC_PREFIX}/${CIRCLE}` : "");
const TELEMETRY_WS_URL = process.env.TELEMETRY_WS_URL ?? "ws://localhost:8787";
const INCIDENT_ID = process.env.INCIDENT_ID ?? "";

if (!TOPIC || !INCIDENT_ID) {
  // eslint-disable-next-line no-console
  console.error("[mqtt-bridge] MQTT_CIRCLE (or MQTT_TOPIC) and INCIDENT_ID are required.");
  process.exit(1);
}

/** Compass bearing (deg from north, clockwise) → math heading (rad from east, CCW). */
function bearingToHeadingRad(bearingDeg: number): number {
  return ((90 - bearingDeg) * Math.PI) / 180;
}

/* ------------------------- telemetry WS (with reconnect) ------------------------- */
let ws: WebSocket | null = null;
let wsReady = false;

function connectTelemetry() {
  ws = new WebSocket(TELEMETRY_WS_URL);
  ws.on("open", () => {
    wsReady = true;
    ws!.send(JSON.stringify({ t: "hello", role: "device", incidentId: INCIDENT_ID, unitId: "mqtt-bridge" }));
    // eslint-disable-next-line no-console
    console.log(`[mqtt-bridge] telemetry connected → ${TELEMETRY_WS_URL} (incident ${INCIDENT_ID})`);
  });
  ws.on("close", () => {
    wsReady = false;
    setTimeout(connectTelemetry, 2000);
  });
  ws.on("error", () => {
    /* close handler schedules reconnect */
  });
}

function sendFix(
  unitId: string,
  lat: number,
  lng: number,
  headingRad: number,
  battery: number,
  name?: string,
) {
  if (!ws || !wsReady) return;
  ws.send(
    JSON.stringify({
      t: "fix",
      unitId,
      lat,
      lng,
      heading: headingRad,
      battery,
      ...(name ? { name } : {}),
      at: new Date().toISOString(),
    }),
  );
}

function sendDistress(unitId: string, lat: number, lng: number) {
  if (!ws || !wsReady) return;
  ws.send(JSON.stringify({ t: "distress", unitId, kind: "sos", lat, lng, at: new Date().toISOString() }));
}

/* ------------------------------- MQTT subscribe -------------------------------- */
const client = mqtt.connect(MQTT_URL, { reconnectPeriod: 3000 });

client.on("connect", () => {
  client.subscribe(TOPIC, { qos: 1 }, (err) => {
    // eslint-disable-next-line no-console
    if (err) console.error("[mqtt-bridge] subscribe failed:", err.message);
    else console.log(`[mqtt-bridge] subscribed → ${TOPIC}`);
  });
});

let loggedShape = false;

/** First value that parses to a finite number, across common field-name spellings. */
function pick(msg: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    if (msg[k] != null) {
      const n = Number(msg[k]);
      if (Number.isFinite(n)) return n;
    }
  }
  return NaN;
}

client.on("message", (_topic, payload) => {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(payload.toString());
  } catch {
    return;
  }
  // One-time diagnostic: print the actual payload keys so a field-name/format mismatch
  // (the usual cause of "web location wrong while the bodycam is fine") is obvious.
  if (!loggedShape) {
    loggedShape = true;
    // eslint-disable-next-line no-console
    console.log("[mqtt-bridge] first payload keys:", Object.keys(msg).join(", "), "→", JSON.stringify(msg).slice(0, 200));
  }
  const type = String(msg.type ?? "location");
  const deviceId = String(msg.deviceId ?? msg.device_id ?? msg.id ?? "");
  if (!deviceId) return;

  // Accept common lat/lng spellings so a differently-named payload still plots.
  const lat = pick(msg, ["latitude", "lat", "Latitude", "Lat"]);
  const lng = pick(msg, ["longitude", "lng", "lon", "long", "Longitude", "Lng", "Lon"]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    // eslint-disable-next-line no-console
    console.warn("[mqtt-bridge] dropped fix — no usable lat/lng in payload keys:", Object.keys(msg).join(", "));
    return;
  }
  // Sanity range: real GPS is |lat|<=90, |lng|<=180. Values far outside suggest a
  // scaled/encoded format (e.g. E7 integers) — warn rather than plot a wrong spot.
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    // eslint-disable-next-line no-console
    console.warn(`[mqtt-bridge] out-of-range coords lat=${lat} lng=${lng} — payload likely uses a scaled/E7 format; not plotting.`);
    return;
  }

  if (type === "location" || type === "sos") {
    const bearing = Number(msg.bearing ?? 0);
    const battery = Number(msg.batteryLevel ?? 100);
    const name = typeof msg.name === "string" ? msg.name.trim() : "";
    sendFix(deviceId, lat, lng, bearingToHeadingRad(bearing), battery, name);
    if (type === "sos") sendDistress(deviceId, lat, lng);
    // eslint-disable-next-line no-console
    console.log(
      `[mqtt-bridge] ${type} ${deviceId} → ${lat.toFixed(5)}, ${lng.toFixed(5)}${type === "sos" ? "  ⚠ SOS → distress" : ""}`,
    );
  }
});

client.on("error", (e) => {
  // eslint-disable-next-line no-console
  console.error("[mqtt-bridge] mqtt error:", e.message);
});

connectTelemetry();
// eslint-disable-next-line no-console
console.log(`[mqtt-bridge] starting — broker ${MQTT_URL}, topic ${TOPIC}`);
