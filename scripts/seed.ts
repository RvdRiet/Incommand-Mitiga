import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import bcrypt from "bcryptjs";
import postgres from "postgres";

/**
 * Load DB credentials from the project's env files when run standalone (`npm run
 * db:seed`). Next.js auto-loads these, but a bare tsx script does not — so without
 * this the seed fails with "DATABASE_ADMIN_URL is required". Uses Node's built-in
 * loader (Node 20.12+); .env.local is loaded first so its values win.
 */
function loadEnvFiles() {
  const load = (process as NodeJS.Process & { loadEnvFile?: (p: string) => void }).loadEnvFile;
  if (typeof load !== "function") return;
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  for (const file of [".env.local", ".env"]) {
    try {
      load(join(root, file));
    } catch {
      /* file absent — fine */
    }
  }
}

/**
 * Fully-populated demo incident ("Coastal Storm & Flood — DEMO"). The fixture is a
 * verbatim export of the incident's per-module operational state (map + supply
 * routes, damage, outages, residents, comms, roster, ICS forms, logs, …), so
 * re-seeding a fresh/wiped database recreates the whole demo exactly. See
 * scripts/fixtures/demo-incident.json.
 */
type DemoFixture = {
  id: string;
  incident: {
    name: string;
    status: string;
    severity: string;
    isExercise: boolean;
    description: string | null;
  };
  stateRev: number | string;
  modules: { slug: string; rev: number | string; state: Record<string, unknown> }[];
};

function loadDemoFixture(): DemoFixture {
  const here = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(here, "fixtures", "demo-incident.json"), "utf8");
  return JSON.parse(raw) as DemoFixture;
}

async function main() {
  loadEnvFiles();
  // Seeding creates a tenant + users, which the least-privilege runtime role
  // (DATABASE_URL / mitiga_app) is blocked from doing by RLS. Use the admin
  // connection when the two-role split is configured, else fall back.
  const url = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_ADMIN_URL or DATABASE_URL is required");

  const sql = postgres(url, { prepare: false, max: 1 });

  const password = "MitigaDemo!23";
  const passwordHash = await bcrypt.hash(password, 12);

  const briefing = {
    incidentName: "Sample windstorm exercise",
    preparedBy: "Mitiga seed",
    summary: "Initial briefing content for development.",
  };

  await sql.begin(async (tx) => {
    const [tenant] = await tx<{ id: string }[]>`
      insert into tenants (name, slug)
      values ('Demo City', 'demo')
      on conflict (slug) do update set name = excluded.name
      returning id
    `;

    const tenantId = tenant?.id;
    if (!tenantId) throw new Error("tenant insert failed");

    await tx`select set_config('app.tenant_id', ${tenantId}::text, true)`;

    let orgId: string | undefined;
    const [existingOrg] = await tx<{ id: string }[]>`
      select id from organizations where tenant_id = ${tenantId} limit 1
    `;
    if (existingOrg?.id) {
      orgId = existingOrg.id;
    } else {
      const [org] = await tx<{ id: string }[]>`
        insert into organizations (tenant_id, name)
        values (${tenantId}, 'EOC Central')
        returning id
      `;
      orgId = org?.id;
    }
    if (!orgId) throw new Error("organization missing");

    const [user] = await tx<{ id: string }[]>`
      insert into users (tenant_id, email, name, password_hash)
      values (${tenantId}, 'ic@example.com', 'Incident Commander', ${passwordHash})
      on conflict (tenant_id, email) do update
        set password_hash = excluded.password_hash,
            name = excluded.name
      returning id
    `;

    const userId = user?.id;
    if (!userId) throw new Error("user insert failed");

    await tx`
      insert into memberships (tenant_id, user_id, organization_id, role)
      values (${tenantId}, ${userId}, ${orgId}, 'tenant_admin')
      on conflict (user_id, organization_id) do update set role = excluded.role
    `;

    // Fixed id + upsert so re-seeding never duplicates this sample incident.
    const SAMPLE_INCIDENT_ID = "00000000-0000-4000-8000-000000000002";
    const [incident] = await tx<{ id: string }[]>`
      insert into incidents (id, tenant_id, organization_id, name, status, severity, is_exercise, description, created_by)
      values (
        ${SAMPLE_INCIDENT_ID},
        ${tenantId},
        ${orgId},
        'Sample windstorm exercise',
        'planning',
        'moderate',
        true,
        'Seeded incident for UI development.',
        ${userId}
      )
      on conflict (id) do update set name = excluded.name
      returning id
    `;

    const incidentId = incident?.id;
    if (!incidentId) throw new Error("incident insert failed");

    // Idempotent: only add the briefing form if this incident doesn't have one yet.
    await tx`
      insert into ics_form_instances (tenant_id, incident_id, code, schema_version, payload, created_by)
      select ${tenantId}, ${incidentId}, 'ICS_201', 1, ${sql.json(briefing)}, ${userId}
      where not exists (
        select 1 from ics_form_instances
        where incident_id = ${incidentId} and code = 'ICS_201'
      )
    `;

    // ---- Fully-populated demo incident (idempotent replay of the fixture) ----
    const demo = loadDemoFixture();

    await tx`
      insert into incidents (id, tenant_id, organization_id, name, status, severity, is_exercise, description, created_by)
      values (
        ${demo.id},
        ${tenantId},
        ${orgId},
        ${demo.incident.name},
        ${demo.incident.status},
        ${demo.incident.severity},
        ${demo.incident.isExercise},
        ${demo.incident.description},
        ${userId}
      )
      on conflict (id) do update set
        name = excluded.name,
        status = excluded.status,
        severity = excluded.severity,
        is_exercise = excluded.is_exercise,
        description = excluded.description
    `;

    // Incident-level anchor row — readModuleState returns null without it, so the
    // module rows below would never assemble. State stays {} (module rows are authoritative).
    await tx`
      insert into incident_state (incident_id, tenant_id, state, rev, updated_by)
      values (${demo.id}, ${tenantId}, '{}'::jsonb, ${Number(demo.stateRev)}, ${userId})
      on conflict (incident_id) do update set rev = excluded.rev, updated_by = excluded.updated_by
    `;

    for (const mod of demo.modules) {
      await tx`
        insert into incident_module_state (incident_id, tenant_id, module_slug, state, rev, updated_by)
        values (${demo.id}, ${tenantId}, ${mod.slug}, ${sql.json(mod.state as Parameters<typeof sql.json>[0])}, ${Number(mod.rev)}, ${userId})
        on conflict (incident_id, module_slug) do update set
          state = excluded.state,
          rev = excluded.rev,
          updated_by = excluded.updated_by,
          updated_at = now()
      `;
    }
  });

  await sql.end({ timeout: 5 });
  console.log("Seed complete. Tenant slug: demo, email: ic@example.com, password: MitigaDemo!23");
  console.log("Demo incident 'Coastal Storm & Flood — DEMO' populated across all modules.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
