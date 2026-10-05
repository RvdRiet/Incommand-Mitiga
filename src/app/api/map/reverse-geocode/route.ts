import { NextResponse } from "next/server";

import { clientIp, enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { reverseGeocodeCity } from "@/lib/maps/geocode";

export async function GET(req: Request) {
  // Public reverse-geocode. No auth gate; IP rate-limit bounds abuse.
  const limited = await enforceRateLimit(`revgeocode:${clientIp(req)}`, 60, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const city = await reverseGeocodeCity(lat, lng);
  return NextResponse.json({ city });
}
