import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSql, withTenant } from "@/db/client";
import { authTokens, tenants, users } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { rateLimit } from "@/lib/auth/rate-limit";
import { sendPasswordResetEmail } from "@/lib/email/mailer";
import { generateToken, hashToken, TOKEN_TTL } from "@/lib/auth/tokens";

const schema = z.object({ tenantSlug: z.string().min(1), email: z.string().email() });

/**
 * POST — request a password reset. Always returns a generic 200 (never reveals
 * whether the account exists). Emails a one-hour reset link if it does.
 */
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: true }); // don't leak shape
  const { tenantSlug, email } = parsed.data;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = await rateLimit(`pwreset:${ip}`, 10, 15 * 60);
  if (!rl.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const sql = getSql();
  const rows = await sql<{ tenant_id: string; user_id: string }[]>`
    select tenant_id, user_id from lookup_user_for_login(${tenantSlug}::citext, ${email}::citext)
  `;
  const found = rows[0];

  let devLink: string | undefined;
  if (found) {
    const raw = generateToken();
    const done = await withTenant(found.tenant_id, async (db) => {
      const [u] = await db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, found.user_id))
        .limit(1);
      if (!u || u.status === "disabled") return null;

      await db.insert(authTokens).values({
        tenantId: found.tenant_id,
        purpose: "password_reset",
        email,
        tokenHash: hashToken(raw),
        userId: found.user_id,
        expiresAt: new Date(Date.now() + TOKEN_TTL.password_reset),
      });
      const [tenant] = await db
        .select({ name: tenants.name })
        .from(tenants)
        .where(eq(tenants.id, found.tenant_id))
        .limit(1);
      return tenant?.name ?? "your district";
    });

    if (done) {
      const link = await sendPasswordResetEmail({ to: email, tenantName: done, token: raw });
      await recordAuthEvent({
        tenantId: found.tenant_id,
        action: "auth.password_reset_requested",
        entityId: found.user_id,
        metadata: { ip },
      });
      // Only ever surface the raw link in NON-production dev (console transport).
      // In production this must never be returned or it's an account-takeover hole.
      if (process.env.NODE_ENV !== "production" && (process.env.EMAIL_TRANSPORT ?? "console") === "console") {
        devLink = link;
      }
    }
  }

  return NextResponse.json({ ok: true, devLink });
}
