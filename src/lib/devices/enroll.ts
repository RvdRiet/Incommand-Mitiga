/**
 * Web-initiated enrollment: the operator generates an enrollment QR in the web UI, the bodycam
 * SCANS it and calls home to /api/devices/enroll, and the device self-registers into the
 * operator's registry (with the callsign the operator chose).
 *
 * Enrollment QR wire format (the bodycam must parse this):
 *   "incommand-enroll:1:" + base64url(JSON { url, token, cs, circle? })
 *   - url    : the web app origin the bodycam calls home to (must be reachable from the device)
 *   - token  : one-time enrollment token (gates who may enroll)
 *   - cs     : the callsign the operator assigned
 *   - circle : optional MQTT circle join key ("INVITE.SALT") to also join
 */
export type EnrollPayload = {
  url: string;
  token: string;
  cs: string;
  circle?: string;
};

const ENROLL_PREFIX = "incommand-enroll:1:";

function b64urlEncode(s: string): string {
  const b64 =
    typeof btoa === "function"
      ? btoa(unescape(encodeURIComponent(s)))
      : Buffer.from(s, "utf8").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return typeof atob === "function"
    ? decodeURIComponent(escape(atob(b64)))
    : Buffer.from(b64, "base64").toString("utf8");
}

export function buildEnrollQrPayload(p: EnrollPayload): string {
  const json = JSON.stringify({
    url: p.url,
    token: p.token,
    cs: p.cs,
    ...(p.circle ? { circle: p.circle } : {}),
  });
  return ENROLL_PREFIX + b64urlEncode(json);
}

export function parseEnrollQrPayload(input: string): EnrollPayload | null {
  const raw = input.trim();
  if (!raw.startsWith(ENROLL_PREFIX)) return null;
  try {
    const p = JSON.parse(b64urlDecode(raw.slice(ENROLL_PREFIX.length))) as Partial<EnrollPayload>;
    if (!p.url || !p.token || !p.cs) return null;
    return { url: p.url, token: p.token, cs: p.cs, circle: p.circle };
  } catch {
    return null;
  }
}
