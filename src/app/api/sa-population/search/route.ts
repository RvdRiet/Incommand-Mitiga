import { NextResponse } from "next/server";

import { clientIp, enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { CENSUS_SOURCE, CENSUS_YEAR, searchCensusPlaces } from "@/lib/sa-population";

export async function GET(req: Request) {
  // Local census dataset (public). No auth gate; IP rate-limit bounds abuse.
  const limited = await enforceRateLimit(`sapop:${clientIp(req)}`, 120, 60);
  if (limited) return limited;

  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = searchCensusPlaces(q);
  return NextResponse.json({
    results,
    censusYear: CENSUS_YEAR,
    source: CENSUS_SOURCE,
  });
}
