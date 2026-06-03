import { NextResponse } from "next/server";

import { getWeatherForPoint } from "@/lib/weather";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  const provider = process.env.NEXT_PUBLIC_WEATHER_PROVIDER ?? "auto";
  const payload = await getWeatherForPoint({ lat, lng, providerMode: provider });

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=300" },
  });
}
