import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { MIN_WRITE_ROLE, requireSession } from "@/lib/auth/rbac";
import { resolveLiveKitUrl } from "@/lib/livekit/url";

/**
 * Mints a LiveKit PUBLISH token for an operator's own browser (webcam), so live video can be
 * demoed/tested end-to-end without a physical bodycam. Unlike /api/livekit/publish-token
 * (which authenticates a remote device via HMAC proof), this trusts the operator's own
 * signed-in session — the same as the subscribe-only /api/livekit/token — since the caller
 * IS the identity being granted, not a remote device claiming one.
 *
 * Identity is prefixed "webcam-" (vs. "operator-" for the viewer token) so a self-published
 * test tile is visually/logically distinguishable from a real bodycam's tile.
 */
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;

export async function GET(req: Request) {
  // Gated at MIN_WRITE_ROLE, same bar as go-live — publishing video is a real action on a
  // shared channel, not a read.
  const session = await requireSession(MIN_WRITE_ROLE);
  if (session instanceof NextResponse) return session;
  const limited = await enforceRateLimit(`lkdemopub:${session.userId}`, 30, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const room = url.searchParams.get("room");

  // A per-tab tag makes the identity unique, so ONE operator can open several tabs
  // and each becomes its own tile in the room's grid (LiveKit collapses duplicate
  // identities to a single participant). The tag is cosmetic — auth is still the
  // session — so a sanitized client value is fine.
  const tag = (url.searchParams.get("tag") ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  const identity = tag ? `webcam-${session.userId}-${tag}` : `webcam-${session.userId}`;
  const label = (url.searchParams.get("label") ?? "").slice(0, 40).trim();
  const name = label || `Webcam ${tag || "1"}`;

  if (!room) {
    return NextResponse.json({ error: "room required" }, { status: 400 });
  }
  if (!API_KEY || !API_SECRET || !LIVEKIT_URL) {
    return NextResponse.json({ error: "livekit_not_configured" }, { status: 501 });
  }

  const at = new AccessToken(API_KEY, API_SECRET, { identity, name, ttl: "1h" });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: false,
    canPublishData: false,
  });

  const token = await at.toJwt();
  return NextResponse.json({ token, url: resolveLiveKitUrl() ?? LIVEKIT_URL });
}
