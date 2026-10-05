import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { authenticator } from "otplib";
import { z } from "zod";

import { withTenant } from "@/db/client";
import { users } from "@/db/schema";
import { recordAuthEvent } from "@/lib/auth/audit";
import { requireSession } from "@/lib/auth/rbac";
import { decryptSecret, encryptSecret } from "@/lib/auth/secrets";

const ISSUER = "InCommand";
// Accept the adjacent 30s step too, tolerating clock skew + request latency.
authenticator.options = { window: 1 };

/** GET — current MFA status for the signed-in user. */
export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const [u] = await withTenant(session.tenantId, (db) =>
    db.select({ enabled: users.totpEnabled }).from(users).where(eq(users.id, session.userId)).limit(1),
  );
  return NextResponse.json({ enabled: u?.enabled ?? false });
}

/** POST — begin enrollment: generate + store a secret (not yet enabled), return the otpauth URI. */
export async function POST() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const secret = authenticator.generateSecret();
  await withTenant(session.tenantId, (db) =>
    db
      .update(users)
      .set({ totpSecret: encryptSecret(secret), totpEnabled: false, updatedAt: new Date() })
      .where(eq(users.id, session.userId)),
  );
  const otpauth = authenticator.keyuri(session.user?.email ?? "user", ISSUER, secret);
  return NextResponse.json({ otpauth, secret });
}

const codeSchema = z.object({ code: z.string().min(6).max(8) });

/** PUT — confirm enrollment: verify a code against the pending secret, then enable. */
export async function PUT(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = codeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "code required" }, { status: 400 });

  const result = await withTenant(session.tenantId, async (db) => {
    const [u] = await db
      .select({ secret: users.totpSecret })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!u?.secret) return { ok: false as const };
    if (!authenticator.verify({ token: parsed.data.code, secret: decryptSecret(u.secret) })) {
      return { ok: false as const };
    }
    await db.update(users).set({ totpEnabled: true, updatedAt: new Date() }).where(eq(users.id, session.userId));
    return { ok: true as const };
  });

  if (!result.ok) return NextResponse.json({ error: "invalid code" }, { status: 400 });
  await recordAuthEvent({ tenantId: session.tenantId, action: "auth.mfa_enabled", actorId: session.userId, entityId: session.userId });
  return NextResponse.json({ ok: true });
}

/** DELETE — turn MFA off (requires a valid current code to prevent lockout mischief). */
export async function DELETE(req: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const parsed = codeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "code required" }, { status: 400 });

  const result = await withTenant(session.tenantId, async (db) => {
    const [u] = await db
      .select({ secret: users.totpSecret, enabled: users.totpEnabled })
      .from(users)
      .where(eq(users.id, session.userId))
      .limit(1);
    if (!u?.enabled || !u.secret) return { ok: false as const };
    if (!authenticator.verify({ token: parsed.data.code, secret: decryptSecret(u.secret) })) {
      return { ok: false as const };
    }
    await db
      .update(users)
      .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
      .where(eq(users.id, session.userId));
    return { ok: true as const };
  });

  if (!result.ok) return NextResponse.json({ error: "invalid code" }, { status: 400 });
  await recordAuthEvent({ tenantId: session.tenantId, action: "auth.mfa_disabled", actorId: session.userId, entityId: session.userId });
  return NextResponse.json({ ok: true });
}
