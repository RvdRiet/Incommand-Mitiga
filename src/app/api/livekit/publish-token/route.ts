import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { AccessToken } from "livekit-server-sdk";

import { resolveLiveKitUrl } from "@/lib/livekit/url";

/**
 * Mints a LiveKit PUBLISH token for a bodycam (RFC-007). Unlike the operator (subscribe-only)
 * token, this grants camera publish — so it must authenticate the device.
 *
 * Auth reuses the fleet HMAC (same `SIP_HMAC_SECRET` the SIP creds derive from): the device
 * sends { deviceId, proof, room } where
 *     proof = HMAC_SHA256(deviceId, SIP_HMAC_SECRET)  (hex, lowercase)
 * which the L310 already knows how to compute (SipCredentialGenerator). Identity = deviceId so
 * the published tile maps to the registered unit.
 */
const API_KEY = process.env.LIVEKIT_API_KEY;
const API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const HMAC_SECRET = process.env.SIP_HMAC_SECRET;

function proofFor(deviceId: string): string {
  return createHmac("sha256", HMAC_SECRET as string).update(deviceId).digest("hex");
}

function validProof(deviceId: string, proof: string): boolean {
  const expected = proofFor(deviceId);
  const a = Buffer.from(proof, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!API_KEY || !API_SECRET || !LIVEKIT_URL || !HMAC_SECRET) {
    return NextResponse.json({ error: "livekit_not_configured" }, { status: 501 });
  }

  let body: { deviceId?: string; proof?: string; room?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const deviceId = body.deviceId?.trim();
  const proof = body.proof?.trim();
  const room = body.room?.trim();
  if (!deviceId || !proof || !room) {
    return NextResponse.json({ error: "deviceId, proof and room required" }, { status: 400 });
  }
  if (!validProof(deviceId, proof)) {
    return NextResponse.json({ error: "invalid_proof" }, { status: 401 });
  }

  const at = new AccessToken(API_KEY, API_SECRET, { identity: deviceId, ttl: "1h" });
  at.addGrant({
    roomJoin: true,
    room,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  const token = await at.toJwt();
  return NextResponse.json({ token, url: resolveLiveKitUrl() ?? LIVEKIT_URL });
}
