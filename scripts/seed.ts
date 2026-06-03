import bcrypt from "bcryptjs";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");

  const sql = postgres(url, { prepare: false, max: 1 });

  const password = "MitigaDemo!23";
  const passwordHash = await bcrypt.hash(password, 10);

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
      values (${tenantId}, ${userId}, ${orgId}, 'incident_manager')
      on conflict (user_id, organization_id) do update set role = excluded.role
    `;

    const [incident] = await tx<{ id: string }[]>`
      insert into incidents (tenant_id, organization_id, name, status, severity, is_exercise, description, created_by)
      values (
        ${tenantId},
        ${orgId},
        'Sample windstorm exercise',
        'planning',
        'moderate',
        true,
        'Seeded incident for UI development.',
        ${userId}
      )
      returning id
    `;

    const incidentId = incident?.id;
    if (!incidentId) throw new Error("incident insert failed");

    await tx`
      insert into ics_form_instances (tenant_id, incident_id, code, schema_version, payload, created_by)
      values (${tenantId}, ${incidentId}, 'ICS_201', 1, ${sql.json(briefing)}, ${userId})
    `;
  });

  await sql.end({ timeout: 5 });
  console.log("Seed complete. Tenant slug: demo, email: ic@example.com, password: MitigaDemo!23");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
