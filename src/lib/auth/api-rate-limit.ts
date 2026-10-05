import { NextResponse } from "next/server";

import { rateLimit } from "./rate-limit";

/**
 * Per-identity rate-limit guard for an authenticated API route. Returns a 429
 * NextResponse (with Retry-After) when the caller has exceeded the window, else
 * null so the handler proceeds. Backed by the shared Redis limiter (fail-open when
 * Redis is unavailable). Use it to stop a single logged-in account from hammering
 * the external-provider proxies (weather/geocode/routing/traffic) or token mints.
 *
 *   const limited = await enforceRateLimit(`geocode:${session.userId}`, 60, 60);
 *   if (limited) return limited;
 */
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<NextResponse | null> {
  const r = await rateLimit(key, limit, windowSec);
  if (r.allowed) return null;
  return NextResponse.json(
    { error: "rate_limited", retryAfterSec: r.retryAfterSec },
    { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } },
  );
}

/**
 * Best-effort client IP for rate-limiting PUBLIC (unauthenticated) proxy routes —
 * weather, geocoding, load-shedding, etc. These serve non-sensitive display data
 * the app needs even when a session is stale, so they must NOT require auth; the IP
 * key still bounds abuse of the server as an open relay.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "anon";
}
