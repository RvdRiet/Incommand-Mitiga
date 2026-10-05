import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { requireSession } from "@/lib/auth/rbac";
import { resolveLiveKitUrl } from "@/lib/livekit/url";

/**
 * Mints a short-lived LiveKit access token for an operator to SUBSCRIBE to a channel's video
 * room (RFC-007). The API secret stays server-side. Operators are viewers only (no publish).
 *
 * Gated on an authenticated session so an anonymous caller can't mint a subscribe token for
 * an arbitrary room and eavesdrop on a comms/bodycam feed. Identity is bound to the signed-in
 * user (ignoring any client-supplied identity) so tiles map to the real operator.
 */
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export async function GET(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const limited = await enforceRateLimit(`lktoken:${session.userId}`, 30, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const room = url.searchParams.get("room");
  const identity = `operator-${session.userId}`;

  if (!room) {
    return NextResponse.json({ error: "room required" }, { status: 400 });
  }
  if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
    return NextResponse.json({ error: "livekit_not_configured" }, { status: 501 });
  }

  const at = new AccessToken(API_KEY, API_SECRET, { identity, ttl: "1h" });
  at.addGrant({
    roomJoin: true,
    room,
    canSubscribe: true,
    canPublish: false,
    canPublishData: false,
  });

  const token = await at.toJwt();
  return NextResponse.json({ token, url: resolveLiveKitUrl() ?? LIVEKIT_URL });
}
