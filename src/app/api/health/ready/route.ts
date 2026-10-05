import { NextResponse } from "next/server";

import { pingDb } from "@/db/client";

/**
 * Readiness probe for Kubernetes. Unlike /api/health (liveness — "the process is
 * up"), this verifies the pod can actually reach Postgres, so k8s won't route
 * traffic to a replica that can't serve requests. Returns 503 when the DB is down.
 */
export async function GET() {
  const db = await pingDb();
  const ok = db;
  return NextResponse.json(
    { ok, checks: { database: db } },
    { status: ok ? 200 : 503 },
  );
}
