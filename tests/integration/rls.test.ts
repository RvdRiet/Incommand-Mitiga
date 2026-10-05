import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Row-Level Security tenant isolation — the core multi-tenant guarantee. Runs as
 * the least-privilege app role (DATABASE_URL / mitiga_app); requires the local
 * stack. Skipped when DATABASE_URL is unset.
 */
const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_URL;

describe.skipIf(!adminUrl || !appUrl)("RLS tenant isolation", () => {
  const admin = postgres(adminUrl!, { prepare: false, max: 1, onnotice: () => {} });
  const app = postgres(appUrl!, { prepare: false, max: 1, onnotice: () => {} });

  const tA = randomUUID();
  const tB = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const incA = randomUUID();
  const incB = randomUUID();

  beforeAll(async () => {
    await admin`insert into tenants (id, name, slug) values
      (${tA}, 'RLS A', ${"rls-a-" + tA.slice(0, 8)}),
      (${tB}, 'RLS B', ${"rls-b-" + tB.slice(0, 8)})`;
    await admin`insert into organizations (id, tenant_id, name) values (${orgA}, ${tA}, 'OA'), (${orgB}, ${tB}, 'OB')`;
    await admin`insert into incidents (id, tenant_id, organization_id, name) values
      (${incA}, ${tA}, ${orgA}, 'A inc'), (${incB}, ${tB}, ${orgB}, 'B inc')`;
  });

  afterAll(async () => {
    await admin`delete from tenants where id in (${tA}, ${tB})`; // cascades
    await admin.end({ timeout: 5 });
    await app.end({ timeout: 5 });
  });

  it("the app role is neither superuser nor BYPASSRLS", async () => {
    const [role] = await app<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      select rolsuper, rolbypassrls from pg_roles where rolname = current_user`;
    expect(role.rolsuper).toBe(false);
    expect(role.rolbypassrls).toBe(false);
  });

  it("sees only its own tenant's rows", async () => {
    const rows = await app.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${tA}, true)`;
      return tx<{ id: string }[]>`select id from incidents`;
    });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(incA);
    expect(ids).not.toContain(incB);
  });

  it("cannot insert into another tenant (WITH CHECK)", async () => {
    await expect(
      app.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tA}, true)`;
        await tx`insert into incidents (id, tenant_id, organization_id, name)
          values (${randomUUID()}, ${tB}, ${orgB}, 'sneak')`;
      }),
    ).rejects.toThrow();
  });

  it("cannot update another tenant's row (USING hides it → 0 rows)", async () => {
    const res = await app.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${tA}, true)`;
      return tx<{ id: string }[]>`update incidents set name = 'hijack' where id = ${incB} returning id`;
    });
    expect(res.length).toBe(0);
  });

  it("with no tenant context, sees nothing (fail-closed)", async () => {
    const rows = await app<{ id: string }[]>`select id from incidents where id in (${incA}, ${incB})`;
    expect(rows.length).toBe(0);
  });
});
