import { NextResponse } from "next/server";

import { clientIp, enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { createMapStackFromEnv } from "@/lib/maps/providers";

export async function GET(req: Request) {
  // Public data — no auth gate (works with a stale session); IP rate-limit bounds abuse.
  const limited = await enforceRateLimit(`traffic:${clientIp(req)}`, 120, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const west = Number(url.searchParams.get("west"));
  const south = Number(url.searchParams.get("south"));
  const east = Number(url.searchParams.get("east"));
  const north = Number(url.searchParams.get("north"));

  if ([west, south, east, north].some((n) => Number.isNaN(n))) {
    return NextResponse.json({ error: "bounds required" }, { status: 400 });
  }

  const { traffic } = createMapStackFromEnv();
  const summary = await traffic.getSummaryForViewport({ west, south, east, north });

  return NextResponse.json({
    summary: summary?.summary ?? "No data",
    congestionIndex: summary?.congestionIndex ?? 0,
    provider: summary?.provider ?? "none",
    asOf: summary?.asOf ?? new Date().toISOString(),
    disclaimer:
      "Traffic and routing information is indicative and may be incomplete or delayed. It does not replace road closures, law enforcement direction, or field observation.",
  });
}
