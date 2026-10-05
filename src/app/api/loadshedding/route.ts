import { NextResponse } from "next/server";

import { clientIp, enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { getLoadSheddingSnapshot } from "@/lib/loadshedding";

export async function GET(req: Request) {
  // Public data — no auth gate (works with a stale session); IP rate-limit bounds abuse.
  const limited = await enforceRateLimit(`loadshedding:${clientIp(req)}`, 120, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");

  const latN = lat != null ? Number(lat) : undefined;
  const lngN = lng != null ? Number(lng) : undefined;

  const payload = await getLoadSheddingSnapshot({
    lat: latN != null && Number.isFinite(latN) ? latN : undefined,
    lng: lngN != null && Number.isFinite(lngN) ? lngN : undefined,
  });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=900" },
  });
}
