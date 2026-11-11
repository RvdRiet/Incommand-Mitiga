import { createHmac } from "crypto";
import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/rbac";

/**
 * Mints the operator softphone's SIP credentials for a SIGNED-IN user (RFC-006).
 *
 * The SIP username/password must never be compiled into the client bundle (a static
 * `NEXT_PUBLIC_SIP_PASSWORD` is extractable by anyone and lets them register to the
 * SIP domain). Instead the secret stays server-side: the password is derived with the
 * same fleet HMAC scheme the devices use (`HMAC_SHA256(username, SIP_HMAC_SECRET)`,
 * see livekit/publish-token) or read from a server-only `SIP_PASSWORD`, and handed out
 * only through this authenticated endpoint. The WSS URL + domain are public connection
 * info and may stay client-side.
 */
const WSS_URL = process.env.SIP_WSS_URL ?? process.env.NEXT_PUBLIC_SIP_WSS_URL;
const DOMAIN = process.env.SIP_DOMAIN ?? process.env.NEXT_PUBLIC_SIP_DOMAIN;
const SIP_USER = process.env.SIP_USER;
const SIP_PASSWORD = process.env.SIP_PASSWORD;
const HMAC_SECRET = process.env.SIP_HMAC_SECRET;

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  if (!WSS_URL || !DOMAIN || !SIP_USER) {
    return NextResponse.json({ error: "sip_not_configured" }, { status: 501 });
  }

  const password = HMAC_SECRET
    ? createHmac("sha256", HMAC_SECRET).update(SIP_USER).digest("hex")
    : SIP_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "sip_not_configured" }, { status: 501 });
  }

  return NextResponse.json(
    { wssUrl: WSS_URL, domain: DOMAIN, username: SIP_USER, password },
    { headers: { "Cache-Control": "no-store" } },
  );
}
