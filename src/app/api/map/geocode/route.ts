import { NextResponse } from "next/server";

import { clientIp, enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { geocodeSearch } from "@/lib/maps/geocode";

export async function GET(req: Request) {
  // Proxies Nominatim (public place lookup). No auth gate so it works with a stale
  // session; an IP rate-limit keeps the server from being an open relay against OSM.
  const limited = await enforceRateLimit(`geocode:${clientIp(req)}`, 60, 60);
  if (limited) return limited;

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await geocodeSearch(q);
  return NextResponse.json({ results });
}
