/**
 * Provision a new district (tenant) + its first org + an invite for the first
 * tenant admin. Internal operator tool — run with the admin DB connection.
 *
 *   npm run db:new-tenant -- --name "Cityville" --slug cityville \
 *       --email admin@cityville.gov.za [--org "EOC Central"]
 *
 * Prints an accept-invite link; the admin follows it to set their own password
 * (no temporary password is ever created or emailed by this tool).
 */
import { readFileSync } from "node:fs";

import postgres from "postgres";

import { generateToken, hashToken, TOKEN_TTL } from "../src/lib/auth/tokens";
import { seedSystemRoles } from "./lib/seed-system-roles";

function loadEnv(path: string) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ambient env */
  }
}
loadEnv(".env.local");

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const name = arg("name");
  const slug = arg("slug");
  const email = arg("email");
  const orgName = arg("org") ?? "Emergency Operations Centre";
  if (!name || !slug || !email) {
    console.error('Usage: npm run db:new-tenant -- --name "Cityville" --slug cityville --email admin@cityville.gov.za [--org "EOC"]');
    process.exit(1);
  }

  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("❌ DATABASE_ADMIN_URL or DATABASE_URL is required.");
    process.exit(1);
  }
  const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });

  try {
    const raw = generateToken();
    const result = await sql.begin(async (tx) => {
      const [tenant] = await tx<{ id: string }[]>`
        insert into tenants (name, slug) values (${name}, ${slug})
        on conflict (slug) do nothing returning id`;
      if (!tenant) throw new Error(`A district with slug "${slug}" already exists.`);

      const [org] = await tx<{ id: string }[]>`
        insert into organizations (tenant_id, name) values (${tenant.id}, ${orgName}) returning id`;

      // Seed the built-in roles so this new tenant has the role catalogue from day one.
      await seedSystemRoles(tx, tenant.id);

      await tx`
        insert into auth_tokens (tenant_id, purpose, email, token_hash, role, organization_id, expires_at)
        values (${tenant.id}, 'invite', ${email}, ${hashToken(raw)}, 'tenant_admin', ${org.id},
                ${new Date(Date.now() + TOKEN_TTL.invite)})`;

      return { tenantId: tenant.id, orgId: org.id };
    });

    const link = `${appUrl}/accept-invite?token=${encodeURIComponent(raw)}`;
    console.log(`\n✅ Provisioned district "${name}" (${slug})`);
    console.log(`   tenant: ${result.tenantId}`);
    console.log(`   org:    ${result.orgId} (${orgName})`);
    console.log(`\nSend this to ${email} to finish setup (expires in 7 days):`);
    console.log(`   ${link}\n`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((e) => {
  console.error("\n❌", e instanceof Error ? e.message : e);
  process.exit(1);
});
