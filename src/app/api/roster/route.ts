import { inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant, type MitigaDb } from "@/db/client";
import { attendanceRecords, orgPersonnel } from "@/db/schema";
import { MIN_WRITE_ROLE, requireSession } from "@/lib/auth/rbac";

/**
 * Server-backed org roster + attendance sync (tenant-scoped, RLS-isolated). The
 * roster lives locally in each browser; this endpoint lets it converge across
 * devices. Upserts are last-write-wins on each record's `updatedAt`, so a stale
 * device cannot clobber a newer edit; deletions are explicit id/key lists.
 */

const MAX_ROWS = 5_000; // guard against runaway payloads

type PersonInput = {
  id: string;
  name?: string;
  role?: string;
  team?: string | null;
  phone?: string | null;
  email?: string | null;
  experience?: string | null;
  addedAt?: string;
  updatedAt?: string;
};

type AttendanceInput = {
  personId: string;
  date: string;
  status?: string;
  checkInAt?: string | null;
  note?: string | null;
  markedAt?: string;
  updatedAt?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES = new Set(["present", "late", "absent", "excused"]);

async function readAll(db: MitigaDb) {
  const people = await db.select().from(orgPersonnel).orderBy(orgPersonnel.addedAt);
  const attendance = await db.select().from(attendanceRecords);
  return { people, attendance };
}

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const data = await withTenant(session.tenantId, readAll);
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const session = await requireSession(MIN_WRITE_ROLE);
  if (session instanceof NextResponse) return session;

  let body: {
    people?: PersonInput[];
    attendance?: AttendanceInput[];
    deletePersonIds?: string[];
    deleteAttendanceKeys?: { personId: string; date: string }[];
  } | null;
  try {
    body = (await req.json()) as typeof body;
  } catch {
    body = null;
  }
  if (!body) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const people = (body.people ?? []).filter((p) => p && UUID_RE.test(p.id)).slice(0, MAX_ROWS);
  const attendance = (body.attendance ?? [])
    .filter(
      (a) =>
        a && UUID_RE.test(a.personId) && DATE_RE.test(a.date) && STATUSES.has(String(a.status)),
    )
    .slice(0, MAX_ROWS);
  const deletePersonIds = (body.deletePersonIds ?? []).filter((id) => UUID_RE.test(id));
  const deleteAttendanceKeys = (body.deleteAttendanceKeys ?? []).filter(
    (k) => k && UUID_RE.test(k.personId) && DATE_RE.test(k.date),
  );

  const tenantId = session.tenantId;

  const data = await withTenant(tenantId, async (db) => {
    for (const p of people) {
      await db.execute(sql`
        INSERT INTO org_personnel (id, tenant_id, name, role, team, phone, email, experience, added_at, updated_at)
        VALUES (
          ${p.id}, ${tenantId}, ${p.name ?? ""}, ${p.role ?? ""}, ${p.team ?? null},
          ${p.phone ?? null}, ${p.email ?? null}, ${p.experience ?? null},
          ${p.addedAt ?? new Date().toISOString()}::timestamptz,
          ${p.updatedAt ?? new Date().toISOString()}::timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name, role = excluded.role, team = excluded.team,
          phone = excluded.phone, email = excluded.email, experience = excluded.experience,
          updated_at = excluded.updated_at
        WHERE excluded.updated_at >= org_personnel.updated_at
      `);
    }

    for (const a of attendance) {
      await db.execute(sql`
        INSERT INTO attendance_records (tenant_id, person_id, date, status, check_in_at, note, marked_at, updated_at)
        VALUES (
          ${tenantId}, ${a.personId}, ${a.date}, ${a.status}, ${a.checkInAt ?? null},
          ${a.note ?? null}, ${a.markedAt ?? new Date().toISOString()}::timestamptz,
          ${a.updatedAt ?? new Date().toISOString()}::timestamptz
        )
        ON CONFLICT (tenant_id, person_id, date) DO UPDATE SET
          status = excluded.status, check_in_at = excluded.check_in_at, note = excluded.note,
          marked_at = excluded.marked_at, updated_at = excluded.updated_at
        WHERE excluded.updated_at >= attendance_records.updated_at
      `);
    }

    if (deletePersonIds.length > 0) {
      await db.delete(orgPersonnel).where(inArray(orgPersonnel.id, deletePersonIds));
      await db.delete(attendanceRecords).where(inArray(attendanceRecords.personId, deletePersonIds));
    }
    for (const k of deleteAttendanceKeys) {
      await db.execute(sql`
        DELETE FROM attendance_records
        WHERE person_id = ${k.personId} AND date = ${k.date}
      `);
    }

    return readAll(db);
  });

  return NextResponse.json(data);
}
