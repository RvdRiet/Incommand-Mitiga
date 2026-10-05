import os from "node:os";

/**
 * Resolve the LiveKit URL to hand back with a token. The problem: on a LAN dev/expo
 * setup the configured host is a DHCP-assigned IP that drifts (e.g. .189 → .191),
 * silently breaking video for phones on the LAN. This keeps the configured scheme
 * and port but substitutes the machine's CURRENT LAN IP whenever the configured
 * host is a private-LAN address or localhost — so a DHCP change self-heals. A
 * public host (a real domain / LiveKit Cloud) is left untouched.
 *
 * Set LIVEKIT_URL_STATIC=1 to disable the substitution and always use the env value
 * verbatim (e.g. if you front LiveKit with a fixed reverse-proxy on the LAN).
 */

function isPrivateIpv4(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const [a, b] = host.split(".").map(Number);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** Ranges that belong to virtual adapters (VirtualBox host-only, Docker/WSL) — skip them. */
function isLikelyVirtual(ip: string): boolean {
  return (
    ip.startsWith("192.168.56.") || // VirtualBox host-only
    ip.startsWith("172.17.") || // Docker default bridge
    ip.startsWith("172.18.") ||
    ip.startsWith("172.19.") ||
    /^172\.2\d\./.test(ip) || // Docker/WSL 172.20–29
    /^172\.3[01]\./.test(ip)
  );
}

/** The machine's current LAN IPv4, preferring one in the same /24 as `hint`. */
export function currentLanIpv4(hint?: string): string | null {
  const candidates: string[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      // node <18 gives family "IPv4"; >=18 may give 4 — accept both.
      const isV4 = a.family === "IPv4" || (a.family as unknown as number) === 4;
      if (isV4 && !a.internal) candidates.push(a.address);
    }
  }
  if (candidates.length === 0) return null;

  // Best: an address in the same /24 as the configured host (handles DHCP drift).
  if (hint && isPrivateIpv4(hint)) {
    const prefix = hint.split(".").slice(0, 3).join(".") + ".";
    const sameSubnet = candidates.find((ip) => ip.startsWith(prefix));
    if (sameSubnet) return sameSubnet;
  }

  // Else a real LAN address, skipping known virtual adapters.
  const real = candidates.filter((ip) => !isLikelyVirtual(ip));
  return (
    real.find((ip) => ip.startsWith("192.168.")) ??
    real.find((ip) => ip.startsWith("10.")) ??
    real[0] ??
    candidates[0]
  );
}

/**
 * The LiveKit URL to return to a client, with the LAN-IP fallback applied.
 * Returns undefined when LIVEKIT_URL is unset.
 */
export function resolveLiveKitUrl(): string | undefined {
  const configured = process.env.LIVEKIT_URL;
  if (!configured) return undefined;
  if (process.env.LIVEKIT_URL_STATIC === "1") return configured;

  let u: URL;
  try {
    u = new URL(configured);
  } catch {
    return configured; // not a parseable URL — hand back verbatim
  }

  const host = u.hostname;
  const localOrLan = host === "localhost" || host === "127.0.0.1" || isPrivateIpv4(host);
  if (!localOrLan) return configured; // public domain / cloud — never rewrite

  const ip = currentLanIpv4(isPrivateIpv4(host) ? host : undefined);
  if (!ip) return configured;
  u.hostname = ip;
  return u.toString().replace(/\/$/, "");
}
