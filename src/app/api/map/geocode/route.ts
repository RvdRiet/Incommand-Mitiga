import { NextResponse } from "next/server";

import { geocodeSearch } from "@/lib/maps/geocode";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await geocodeSearch(q);
  return NextResponse.json({ results });
}
