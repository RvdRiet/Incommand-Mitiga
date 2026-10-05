import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { requireSession } from "@/lib/auth/rbac";
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
  // Proxies an external routing engine — gate to prevent unauthenticated abuse.
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const limited = await enforceRateLimit(`planroutes:${session.userId}`, 30, 60);
  if (limited) return limited;

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
