import { NextResponse } from "next/server";

import { getLoadSheddingSnapshot } from "@/lib/loadshedding";

export async function GET(req: Request) {
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
