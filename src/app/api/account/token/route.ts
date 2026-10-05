import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant } from "@/db/client";
import { tenants } from "@/db/schema";
import { lookupAuthToken } from "@/lib/auth/token-store";

/**
 * Context for the accept-invite / reset-password pages: given a raw token,
 * return its purpose + the email and district name it's for — WITHOUT consuming
 * it — so the page can render "Set your password for you@city.gov at Cityville".
 */
export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get("token") ?? "";
  const token = await lookupAuthToken(raw);
  if (!token) return NextResponse.json({ valid: false }, { status: 404 });

  const [tenant] = await withTenant(token.tenant_id, async (db) =>
    db.select({ name: tenants.name, slug: tenants.slug }).from(tenants).where(eq(tenants.id, token.tenant_id)).limit(1),
  );

  return NextResponse.json({
    valid: true,
    purpose: token.purpose,
    email: token.email,
    tenantName: tenant?.name ?? null,
    tenantSlug: tenant?.slug ?? null,
  });
}
