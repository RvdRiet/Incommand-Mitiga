import { NextResponse } from "next/server";
import { z } from "zod";

import { enforceRateLimit } from "@/lib/auth/api-rate-limit";
import { requireSession } from "@/lib/auth/rbac";
import { verifyAllVariants } from "@/lib/maps/route-verify";
import type { RouteVariant } from "@/lib/maps/routing-types";

const waypointSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  label: z.string().default(""),
});

const variantSchema = z.object({
  id: z.string(),
  scenario: z.string(),
  label: z.string(),
  description: z.string(),
  distanceMeters: z.number(),
  durationSeconds: z.number(),
  geojson: z.object({
    type: z.literal("Feature"),
    properties: z.record(z.unknown()).optional(),
    geometry: z.object({
      type: z.literal("LineString"),
      coordinates: z.array(z.tuple([z.number(), z.number()])),
    }),
  }),
  googleMapsUrl: z.string(),
  waypoints: z.array(waypointSchema),
});

const bodySchema = z.object({
  origin: waypointSchema,
  destination: waypointSchema,
  variants: z.array(variantSchema),
});

export async function POST(req: Request) {
  // Proxies external routing verification — gate to prevent unauthenticated abuse.
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const limited = await enforceRateLimit(`verifyroutes:${session.userId}`, 30, 60);
  if (limited) return limited;

  try {
    const body = bodySchema.parse(await req.json());
    const rows = await verifyAllVariants(
      body.variants as RouteVariant[],
      body.origin,
      body.destination,
    );
    return NextResponse.json({ rows });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Verification failed";
    return NextResponse.json({ error: message, rows: [] }, { status: 400 });
  }
}
