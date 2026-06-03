import { NextResponse } from "next/server";

import { CENSUS_SOURCE, CENSUS_YEAR, searchCensusPlaces } from "@/lib/sa-population";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = searchCensusPlaces(q);
  return NextResponse.json({
    results,
    censusYear: CENSUS_YEAR,
    source: CENSUS_SOURCE,
  });
}
