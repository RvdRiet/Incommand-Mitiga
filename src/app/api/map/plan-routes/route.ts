import { NextResponse } from "next/server";
import { z } from "zod";

import { planRouteVariants } from "@/lib/maps/route-engine";

const waypointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string().default(""),
});

const bodySchema = z.object({
  origin: waypointSchema,
  destination: waypointSchema,
  viaPoints: z.array(waypointSchema).optional(),
  avoidPolygon: z.array(z.tuple([z.number(), z.number()])).optional(),
  midJourneyOrigin: waypointSchema.nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const body = bodySchema.parse(await req.json());
    const variants = await planRouteVariants({
      origin: body.origin,
      destination: body.destination,
      viaPoints: body.viaPoints,
      avoidPolygon: body.avoidPolygon,
      midJourneyOrigin: body.midJourneyOrigin ?? null,
    });
    return NextResponse.json({ variants });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Route planning failed";
    return NextResponse.json({ error: message, variants: [] }, { status: 400 });
  }
}
