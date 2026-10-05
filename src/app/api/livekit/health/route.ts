import { NextResponse } from "next/server";
import { RoomServiceClient } from "livekit-server-sdk";

import { requireSession } from "@/lib/auth/rbac";
import { resolveLiveKitUrl } from "@/lib/livekit/url";

/**
 * Reports whether the configured LiveKit server is actually reachable and the API
 * key/secret pair works — not just "the env vars are set" (RFC-007). Used by the Comms UI
 * to show "LiveKit: connected/unreachable" instead of silently failing per-channel.
 *
 * Calls listRooms() (a real authenticated round-trip) rather than a bare HTTP ping, so a
 * misconfigured key/secret — or the wrong host after a DHCP IP change — shows up as
 * unreachable too, not just "port closed".
 */
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

function toHttpUrl(wsUrl: string): string {
  return wsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
}

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
    return NextResponse.json({ ok: false, reason: "not_configured" });
  }

  // Check the SAME URL tokens hand out (LAN-IP fallback applied), so a DHCP drift
  // shows here too instead of health passing while clients fail (or vice-versa).
  const resolved = resolveLiveKitUrl() ?? LIVEKIT_URL;
  try {
    const client = new RoomServiceClient(toHttpUrl(resolved), API_KEY, API_SECRET);
    await client.listRooms();
    return NextResponse.json({ ok: true, url: resolved });
  } catch (e) {
    return NextResponse.json({ ok: false, reason: e instanceof Error ? e.message : "unreachable" });
  }
}
