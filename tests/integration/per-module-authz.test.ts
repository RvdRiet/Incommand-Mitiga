import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withTenant } from "@/db/client";
import { ALL_MODULE_SLUGS } from "@/lib/auth/permissions";
import { readModuleState, writeModuleState } from "@/lib/incident/state-sync-server";

/**
 * Per-module read redaction + write preservation — the data-layer half of "who
 * sees what". Uses the real app-role path (withTenant). Requires the local stack.
 */
const adminUrl = process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL;
const appUrl = process.env.DATABASE_URL;

describe.skipIf(!adminUrl || !appUrl)("per-module read/write authorization", () => {
  const admin = postgres(adminUrl!, { prepare: false, max: 1, onnotice: () => {} });
  const tenantId = randomUUID();
  const orgId = randomUUID();
  const userId = randomUUID();
  const incidentId = randomUUID();
  const ALL = new Set(ALL_MODULE_SLUGS);
  const RESTRICTED = new Set(["situation", "forms"]); // no personnel

  beforeAll(async () => {
    await admin`insert into tenants (id, name, slug) values (${tenantId}, 'PM', ${"pm-" + tenantId.slice(0, 8)})`;
    await admin`insert into organizations (id, tenant_id, name) values (${orgId}, ${tenantId}, 'O')`;
    await admin`insert into users (id, tenant_id, email, name) values (${userId}, ${tenantId}, ${"u-" + userId.slice(0, 8) + "@t.test"}, 'U')`;
    await admin`insert into incidents (id, tenant_id, organization_id, name) values (${incidentId}, ${tenantId}, ${orgId}, 'PM inc')`;

    // Seed the full state as an unrestricted writer.
    await withTenant(tenantId, (db) =>
      writeModuleState(
        db,
        incidentId,
        tenantId,
        userId,
        { situation: { name: "orig" }, personnel: [{ id: "p1", name: "Alice" }], forms: [{ id: "f1" }] },
        ALL,
        0,
      ),
    );
  });

  afterAll(async () => {
    await admin`delete from tenants where id = ${tenantId}`; // cascades
    await admin.end({ timeout: 5 });
    await globalThis.__mitigaPostgres?.end({ timeout: 5 });
  });

  it("a full-access role reads every module", async () => {
    const row = await withTenant(tenantId, (db) => readModuleState(db, incidentId, ALL));
    expect(row).not.toBeNull();
    expect((row!.state as { personnel?: unknown }).personnel).toBeDefined();
    expect((row!.state as { situation?: { name?: string } }).situation?.name).toBe("orig");
  });

  it("redacts modules the role can't see (personnel omitted)", async () => {
    const row = await withTenant(tenantId, (db) => readModuleState(db, incidentId, RESTRICTED));
    expect("personnel" in (row!.state as object)).toBe(false);
    expect((row!.state as { situation?: unknown }).situation).toBeDefined();
    expect((row!.state as { forms?: unknown }).forms).toBeDefined();
  });

  it("a restricted writer cannot overwrite an invisible module", async () => {
    const cur = await withTenant(tenantId, (db) => readModuleState(db, incidentId, RESTRICTED));
    // Try to overwrite personnel + edit situation, as a role that can't see personnel.
    const res = await withTenant(tenantId, (db) =>
      writeModuleState(
        db,
        incidentId,
        tenantId,
        userId,
        { situation: { name: "edited" }, personnel: [{ id: "x", name: "HACKER" }], forms: [{ id: "f2" }] },
        RESTRICTED,
        cur!.rev,
      ),
    );
    expect(res.ok).toBe(true);

    const after = await withTenant(tenantId, (db) => readModuleState(db, incidentId, ALL));
    // personnel preserved; situation + forms applied.
    expect((after!.state as { personnel?: unknown }).personnel).toEqual([{ id: "p1", name: "Alice" }]);
    expect((after!.state as { situation?: { name?: string } }).situation?.name).toBe("edited");
    expect((after!.state as { forms?: { id: string }[] }).forms?.[0]?.id).toBe("f2");
  });

  it("rejects a stale write (whole-doc optimistic concurrency)", async () => {
    const res = await withTenant(tenantId, (db) =>
      writeModuleState(db, incidentId, tenantId, userId, { situation: { name: "z" } }, ALL, 0),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.conflict).toBe(true);
  });

  it("concurrent writes to DIFFERENT modules don't conflict", async () => {
    const r0 = await withTenant(tenantId, (db) => readModuleState(db, incidentId, ALL));
    const base = r0!.moduleRevs;
    // Two writers, same base revs, editing different modules.
    const a = await withTenant(tenantId, (db) =>
      writeModuleState(db, incidentId, tenantId, userId, { situation: { name: "A" } }, ALL, r0!.rev, base),
    );
    const b = await withTenant(tenantId, (db) =>
      writeModuleState(db, incidentId, tenantId, userId, { forms: [{ id: "fB" }] }, ALL, r0!.rev, base),
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const after = await withTenant(tenantId, (db) => readModuleState(db, incidentId, ALL));
    expect((after!.state as { situation?: { name?: string } }).situation?.name).toBe("A");
    expect((after!.state as { forms?: { id: string }[] }).forms?.[0]?.id).toBe("fB");
  });

  it("concurrent writes to the SAME module conflict on that module", async () => {
    const r0 = await withTenant(tenantId, (db) => readModuleState(db, incidentId, ALL));
    const base = r0!.moduleRevs;
    await withTenant(tenantId, (db) =>
      writeModuleState(db, incidentId, tenantId, userId, { situation: { name: "first" } }, ALL, r0!.rev, base),
    );
    // Second writer with the now-stale situation rev.
    const second = await withTenant(tenantId, (db) =>
      writeModuleState(db, incidentId, tenantId, userId, { situation: { name: "second" } }, ALL, r0!.rev, base),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.conflicts.situation).toBeDefined();
  });
});
