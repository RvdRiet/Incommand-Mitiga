import { getSql } from "@/db/client";
import { hashToken } from "./tokens";

/**
 * Pre-auth lookup of an invite/reset token by its raw value. Uses the
 * SECURITY DEFINER `lookup_auth_token` helper (RLS-exempt) because the link is
 * followed before the user has any tenant session. Returns null for
 * unknown / expired / already-consumed tokens.
 */
export type AuthTokenRow = {
  id: string;
  tenant_id: string;
  purpose: "invite" | "password_reset" | "email_verify";
  email: string;
  role: string | null;
  organization_id: string | null;
  user_id: string | null;
  expires_at: string;
};

export async function lookupAuthToken(raw: string): Promise<AuthTokenRow | null> {
  if (!raw) return null;
  const sql = getSql();
  const rows = await sql<AuthTokenRow[]>`
    select id, tenant_id, purpose, email, role::text as role, organization_id, user_id, expires_at
    from lookup_auth_token(${hashToken(raw)}::text)
  `;
  return rows[0] ?? null;
}
