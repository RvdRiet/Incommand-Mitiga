import { NextResponse } from "next/server";

import { clientIp, enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { getWeatherForecast } from "@/lib/weather";

export async function GET(req: Request) {
  // PUBLIC data — the app needs it even with a stale session, so NO auth gate.
  // An IP rate-limit still bounds abuse of the server as an open relay.
  const limited = await enforceRateLimit(`forecast:${clientIp(req)}`, 120, 60);
  if (limited) return limited;

  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  try {
    const forecast = await getWeatherForecast(lat, lng);
    return NextResponse.json(forecast, {
      headers: { "Cache-Control": "s-maxage=600, stale-while-revalidate=1800" },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "forecast_failed" },
      { status: 502 },
    );
  }
}
