import { NextResponse } from "next/server";

import { reverseGeocodeCity } from "@/lib/maps/geocode";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const city = await reverseGeocodeCity(lat, lng);
  return NextResponse.json({ city });
}
