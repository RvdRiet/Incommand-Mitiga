import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { z } from "zod";

import { authConfig } from "./auth.config";
import { getSql } from "@/db/client";

const credentialsSchema = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  ...authConfig,
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        tenantSlug: { label: "Tenant", type: "text" },
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { tenantSlug, email, password } = parsed.data;
        const sql = getSql();

        const rows = await sql<
          {
            tenant_id: string;
            user_id: string;
            password_hash: string | null;
            name: string | null;
            email: string;
          }[]
        >`select tenant_id, user_id, password_hash, name, email from lookup_user_for_login(${tenantSlug}::citext, ${email}::citext)`;

        const row = rows[0];
        if (!row?.password_hash) return null;

        const ok = await compare(password, row.password_hash);
        if (!ok) return null;

        return await sql.begin(async (tx) => {
          await tx`select set_config('app.tenant_id', ${row.tenant_id}::text, true)`;
          const memberships = await tx<
            { organization_id: string; role: string }[]
          >`select organization_id, role::text from memberships where user_id = ${row.user_id} limit 1`;

          const m = memberships[0];

          return {
            id: row.user_id,
            tenantId: row.tenant_id,
            organizationId: m?.organization_id ?? "",
            role: m?.role ?? "viewer",
            email: row.email,
            name: row.name ?? undefined,
          };
        });
      },
    }),
  ],
});
