import { NextResponse } from "next/server";

import { defaultOsmRasterStyle } from "@/lib/maps/osm-style";

export async function GET() {
  const tileUrl =
    process.env.NEXT_PUBLIC_OSM_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  return NextResponse.json({ style: defaultOsmRasterStyle(tileUrl) });
}
