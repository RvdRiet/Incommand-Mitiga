import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { requireSession } from "@/lib/auth/rbac";
import { getRedis } from "@/lib/redis";

/**
 * Web-initiated device enrollment sessions (RFC — device registry).
 *
 *   POST  (operator)  { callsign, circle? }        → { token }   creates a session + QR token
 *   PUT   (bodycam)   { token, deviceId, callsign? } → { ok, callsign, circle }   device claims it
 *   GET   (operator)  ?token=…                       → { status, device? }         poll for the claim
 *
 * Sessions are ephemeral (10-min TTL). They live in REDIS when REDIS_URL is set so
 * the create/claim/poll steps work across k8s replicas (the operator may POST on one
 * pod and the device PUT-claim on another). Without Redis we fall back to an in-memory
 * globalThis Map — correct for a single-machine / dev deployment. The registry itself
 * stays client-side; the operator's browser writes the claimed device into localStorage.
 */
type EnrollSession = {
  callsign: string;
  circle: string;
  createdAt: number;
  deviceId?: string;
  claimedAt?: number;
};

const TTL_SEC = 10 * 60;
const TTL_MS = TTL_SEC * 1000;
const redisKey = (token: string) => `enroll:${token}`;

// In-memory fallback (only used when REDIS_URL is unset). Kept on globalThis so dev
// HMR doesn't drop an in-flight session.
const mem: Map<string, EnrollSession> =
  (globalThis as { __enrollSessions?: Map<string, EnrollSession> }).__enrollSessions ??
  ((globalThis as { __enrollSessions?: Map<string, EnrollSession> }).__enrollSessions = new Map());

function sweepMem() {
  const now = Date.now();
  for (const [k, s] of mem) if (now - s.createdAt > TTL_MS) mem.delete(k);
}

/** Persist a session, refreshing its TTL. Falls back to in-memory if Redis errors,
 *  so a Redis hiccup can never leave enrollment hung/500 (it degrades to single-node). */
async function putSession(token: string, s: EnrollSession): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(redisKey(token), JSON.stringify(s), "EX", TTL_SEC);
      return;
    } catch {
      /* Redis unreachable — fall through to the in-memory Map. */
    }
  }
  mem.set(token, s);
}

/** Load a session (null when absent or expired). Redis-first with in-memory fallback. */
async function getSession(token: string): Promise<EnrollSession | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(redisKey(token));
      if (raw) return JSON.parse(raw) as EnrollSession;
    } catch {
      /* Redis unreachable — fall through to the in-memory Map. */
    }
  }
  sweepMem();
  return mem.get(token) ?? null;
}

export async function POST(req: Request) {
  // Operator-initiated: creating an enrollment session requires a session so an
  // anonymous caller can't spam sessions. (The device's PUT claim stays token-authed.)
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const limited = await enforceRateLimit(`enroll:${session.userId}`, 30, 60);
  if (limited) return limited;

  let body: { callsign?: string; circle?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const callsign = body.callsign?.trim();
  if (!callsign) return NextResponse.json({ error: "callsign required" }, { status: 400 });
  const token = randomUUID();
  await putSession(token, { callsign, circle: body.circle?.trim() ?? "", createdAt: Date.now() });
  return NextResponse.json({ token });
}

export async function PUT(req: Request) {
  // Device claim — authenticated by possession of the single-use QR token, not a session.
  let body: { token?: string; deviceId?: string; callsign?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const token = body.token?.trim();
  const deviceId = body.deviceId?.trim();
  if (!token || !deviceId) {
    return NextResponse.json({ error: "token and deviceId required" }, { status: 400 });
  }
  const enroll = await getSession(token);
  if (!enroll) return NextResponse.json({ error: "invalid_or_expired_token" }, { status: 404 });
  if (enroll.deviceId && enroll.deviceId !== deviceId) {
    return NextResponse.json({ error: "token_already_claimed" }, { status: 409 });
  }
  enroll.deviceId = deviceId;
  enroll.claimedAt = Date.now();
  if (body.callsign?.trim()) enroll.callsign = body.callsign.trim();
  await putSession(token, enroll);
  return NextResponse.json({ ok: true, callsign: enroll.callsign, circle: enroll.circle });
}

export async function GET(req: Request) {
  // Operator polling for the claim — session-gated (the device never GETs).
  const authed = await requireSession();
  if (authed instanceof NextResponse) return authed;

  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  const enroll = await getSession(token);
  if (!enroll) return NextResponse.json({ status: "expired" });
  if (!enroll.deviceId) return NextResponse.json({ status: "pending" });
  return NextResponse.json({
    status: "claimed",
    device: { id: enroll.deviceId, callsign: enroll.callsign, circle: enroll.circle },
  });
}
