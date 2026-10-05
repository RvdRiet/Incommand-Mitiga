/**
 * Device registry — an org-level catalogue of bodycams that persists across all incidents.
 * A device is registered once (by its stable `id`, which equals the bodycam's MQTT `deviceId`)
 * and can then be added to any scenario as a field unit.
 */
export type RegisteredDevice = {
  /** Stable device id — MUST equal the bodycam's `deviceId` so telemetry/SOS match. */
  id: string;
  callsign: string;
  /** Friendly label / assigned officer. */
  label: string;
  model: string;
  /** Optional MQTT circle join key the device publishes on ("INVITE.SALT"). */
  mqttCircle: string;
  registeredAt: string;
  lastSeenAt: string | null;
};

const QR_PREFIX = "incommand-dev:1:";

type DevicePayload = {
  id: string;
  cs?: string;
  model?: string;
  circle?: string;
};

/** Encode a device identity into a compact string suitable for a QR code. */
export function buildDeviceQrPayload(d: Pick<RegisteredDevice, "id" | "callsign" | "model" | "mqttCircle">): string {
  const payload: DevicePayload = {
    id: d.id,
    cs: d.callsign || undefined,
    model: d.model || undefined,
    circle: d.mqttCircle || undefined,
  };
  const json = JSON.stringify(payload);
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(json)))
      : Buffer.from(json, "utf8").toString("base64");
  return QR_PREFIX + b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Parse a scanned/pasted registration string. Accepts the full QR payload, or a bare device
 * id (so an operator can register a device just by typing its id).
 */
export function parseDeviceQrPayload(input: string): Partial<RegisteredDevice> | null {
  const raw = input.trim();
  if (!raw) return null;
  if (!raw.startsWith(QR_PREFIX)) {
    // Bare device id fallback.
    return /\s/.test(raw) ? null : { id: raw };
  }
  try {
    let b64 = raw.slice(QR_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const json =
      typeof atob === "function"
        ? decodeURIComponent(escape(atob(b64)))
        : Buffer.from(b64, "base64").toString("utf8");
    const p = JSON.parse(json) as DevicePayload;
    if (!p.id) return null;
    return { id: p.id, callsign: p.cs ?? "", model: p.model ?? "", mqttCircle: p.circle ?? "" };
  } catch {
    return null;
  }
}
