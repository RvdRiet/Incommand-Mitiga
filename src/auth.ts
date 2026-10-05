import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { authenticator } from "otplib";
import { z } from "zod";

// Tolerate ±1 time-step (clock skew + latency) when verifying TOTP at login.
authenticator.options = { window: 1 };

import { authConfig } from "./auth.config";
import { getSql, withTenant } from "@/db/client";
import { memberships, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { recordAuthEvent } from "@/lib/auth/audit";
import { isSessionStillValid } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/auth/secrets";
import { LOCKOUT, LOGIN_LIMITS, rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";

const credentialsSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  totp: z.string().optional(),
});

// Re-check the user against the DB at most this often per session, so a disabled
// account or a forced sign-out (token_version bump) takes effect within the window
// without a DB read on every single request.
const REVALIDATE_MS = 60 * 1000;

function clientIp(req: Request | undefined): string {
  const xff = req?.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req?.headers.get("x-real-ip") ?? "unknown";
}

// A real bcrypt hash to compare against when the account doesn't exist, so an
// unknown email costs the same time as a known one (defeats timing enumeration).
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = hashPassword(`no-such-user-${Math.random()}`);
  return dummyHash;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  ...authConfig,
  // Long, SLIDING session so operators aren't logged out mid-incident (shifts run
  // for days; the app is often left open overnight). maxAge is the inactivity window;
  // updateAge re-issues the token on activity, so the 30-day clock keeps sliding
  // forward for anyone using it regularly — it effectively never expires in use.
  // Forced sign-out / disable still takes effect via the token_version revalidation
  // below (independent of maxAge). Override with AUTH_SESSION_MAX_AGE (seconds).
  session: {
    strategy: "jwt",
    maxAge: Number(process.env.AUTH_SESSION_MAX_AGE ?? 30 * 24 * 60 * 60),
    updateAge: 60 * 60,
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        tenantSlug: { label: "Tenant", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" },
      },
      authorize: async (raw, request) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { tenantSlug, email, password, totp } = parsed.data;

        // 1. Rate limit — per account (email+tenant) and per source IP. Both are
        //    Redis-backed so limits hold across pods; fail-open if Redis is down.
        const ip = clientIp(request);
        const acct = `login:acct:${tenantSlug}:${email.toLowerCase()}`;
        const perIp = `login:ip:${ip}`;
        const [a, b] = await Promise.all([
          rateLimit(acct, LOGIN_LIMITS.perAccount.limit, LOGIN_LIMITS.perAccount.windowSec),
          rateLimit(perIp, LOGIN_LIMITS.perIp.limit, LOGIN_LIMITS.perIp.windowSec),
        ]);
        if (!a.allowed || !b.allowed) return null;

        // 2. Resolve the account across tenants (SECURITY DEFINER, RLS-exempt).
        const sql = getSql();
        const rows = await sql<
          { tenant_id: string; user_id: string; password_hash: string | null; name: string | null; email: string }[]
        >`select tenant_id, user_id, password_hash, name, email
          from lookup_user_for_login(${tenantSlug}::citext, ${email}::citext)`;
        const found = rows[0];
        if (!found) {
          // Spend the same time as a real password check so an unknown account
          // isn't distinguishable by response latency.
          await verifyPassword(password, await getDummyHash());
          return null;
        }

        const tenantId = found.tenant_id;
        const userId = found.user_id;

        // 3. Lifecycle + lockout + password, all inside the tenant's RLS context.
        return withTenant(tenantId, async (db) => {
          const [u] = await db
            .select({
              status: users.status,
              lockedUntil: users.lockedUntil,
              failedLoginCount: users.failedLoginCount,
              tokenVersion: users.tokenVersion,
              totpEnabled: users.totpEnabled,
              totpSecret: users.totpSecret,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);
          if (!u) return null;

          if (u.status === "disabled") {
            await recordAuthEvent({ tenantId, action: "auth.login_failed", entityId: userId, metadata: { reason: "disabled", ip } });
            return null;
          }
          if (u.lockedUntil && u.lockedUntil.getTime() > Date.now()) {
            await recordAuthEvent({ tenantId, action: "auth.login_failed", entityId: userId, metadata: { reason: "locked", ip } });
            return null;
          }

          const ok = found.password_hash
            ? await verifyPassword(password, found.password_hash)
            : false;

          if (!ok) {
            const next = (u.failedLoginCount ?? 0) + 1;
            const lock = next >= LOCKOUT.threshold;
            await db
              .update(users)
              .set({
                failedLoginCount: next,
                lockedUntil: lock ? new Date(Date.now() + LOCKOUT.durationMs) : null,
                updatedAt: new Date(),
              })
              .where(eq(users.id, userId));
            await recordAuthEvent({
              tenantId,
              action: lock ? "auth.locked" : "auth.login_failed",
              entityId: userId,
              metadata: { reason: "bad_password", attempt: next, ip },
            });
            return null;
          }

          // Second factor — if MFA is on, require a valid TOTP code. A wrong code
          // counts toward the same lockout as a wrong password, so codes can't be
          // brute-forced even if the (fail-open) Redis rate limiter is unavailable.
          if (u.totpEnabled) {
            const valid =
              !!totp &&
              !!u.totpSecret &&
              authenticator.verify({ token: totp, secret: decryptSecret(u.totpSecret) });
            if (!valid) {
              const next = (u.failedLoginCount ?? 0) + 1;
              const lock = next >= LOCKOUT.threshold;
              await db
                .update(users)
                .set({
                  failedLoginCount: next,
                  lockedUntil: lock ? new Date(Date.now() + LOCKOUT.durationMs) : null,
                  updatedAt: new Date(),
                })
                .where(eq(users.id, userId));
              await recordAuthEvent({
                tenantId,
                action: lock ? "auth.locked" : "auth.login_failed",
                entityId: userId,
                metadata: { reason: "mfa", attempt: next, ip },
              });
              return null;
            }
          }

          // Success — reset counters, stamp last login, clear rate-limit budget.
          await db
            .update(users)
            .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), updatedAt: new Date() })
            .where(eq(users.id, userId));
          await resetRateLimit(acct);

          // Membership (org + role) — read through the tenant-scoped `db`.
          const [mem] = await db
            .select({ organizationId: memberships.organizationId, role: memberships.role })
            .from(memberships)
            .where(eq(memberships.userId, userId))
            .limit(1);

          await recordAuthEvent({ tenantId, action: "auth.login", actorId: userId, entityId: userId, metadata: { ip } });

          return {
            id: userId,
            tenantId,
            organizationId: mem?.organizationId ?? "",
            role: mem?.role ?? "viewer",
            email: found.email,
            name: found.name ?? undefined,
            tokenVersion: u.tokenVersion ?? 0,
          };
        });
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On sign-in, stamp the tenant claims + the token_version we minted at.
      if (user && "tenantId" in user) {
        token.tenantId = user.tenantId as string;
        token.userId = user.id;
        token.role = (user as { role?: string }).role ?? "viewer";
        token.organizationId = (user as { organizationId?: string }).organizationId ?? "";
        token.tokenVersion = (user as { tokenVersion?: number }).tokenVersion ?? 0;
        token.checkedAt = Date.now();
        return token;
      }

      // Throttled re-validation: reflect disable + forced-logout + role changes.
      const last = typeof token.checkedAt === "number" ? token.checkedAt : 0;
      const tenantId = typeof token.tenantId === "string" ? token.tenantId : undefined;
      const userId = typeof token.userId === "string" ? token.userId : undefined;
      if (tenantId && userId && Date.now() - last > REVALIDATE_MS) {
        try {
          const [u] = await withTenant(tenantId, async (db) =>
            db
              .select({
                status: users.status,
                tokenVersion: users.tokenVersion,
                role: memberships.role,
                organizationId: memberships.organizationId,
              })
              .from(users)
              .leftJoin(memberships, eq(memberships.userId, users.id))
              .where(eq(users.id, userId))
              .limit(1),
          );
          if (
            !u ||
            !isSessionStillValid({
              status: u.status,
              dbTokenVersion: u.tokenVersion,
              tokenTokenVersion: typeof token.tokenVersion === "number" ? token.tokenVersion : 0,
            })
          ) {
            return null; // invalidate the session (disabled or forced sign-out)
          }
          // Reflect role/org changes made by an admin without forcing re-login.
          token.role = u.role ?? "viewer";
          token.organizationId = u.organizationId ?? "";
          token.checkedAt = Date.now();
        } catch {
          // On a transient DB error, keep the existing token (fail-open on read).
        }
      }
      return token;
    },
    session({ session, token }) {
      const tenantId = typeof token.tenantId === "string" ? token.tenantId : undefined;
      const userId = typeof token.userId === "string" ? token.userId : undefined;
      if (tenantId && userId) {
        session.tenantId = tenantId;
        session.userId = userId;
        session.role = typeof token.role === "string" ? token.role : "viewer";
        session.organizationId =
          typeof token.organizationId === "string" ? token.organizationId : "";
        session.user = { ...session.user, id: userId, email: session.user?.email ?? "" };
      }
      return session;
    },
  },
});
