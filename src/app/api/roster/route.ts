import { inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { withTenant, type MitigaDb } from "@/db/client";
import { attendanceRecords, orgPersonnel, orgQualifications, orgShifts } from "@/db/schema";
import { requireSession, requireWrite } from "@/lib/auth/rbac";
import { sanitizeForJsonb } from "@/lib/incident/module-state-map";

/**
 * Server-backed org roster + attendance sync (tenant-scoped, RLS-isolated). The
 * roster lives locally in each browser; this endpoint lets it converge across
 * devices. Upserts are last-write-wins on each record's `updatedAt`, so a stale
 * device cannot clobber a newer edit; deletions are explicit id/key lists.
 */

const MAX_ROWS = 5_000; // guard against runaway payloads
// The roster payload is stored in Postgres AND mirrored into every client's local
// copy, so an unbounded body is a bloat / DoS vector — cap it like the state sync.
const MAX_BODY_BYTES = Number(process.env.ROSTER_MAX_BYTES ?? 4 * 1024 * 1024);
const MAX_PHOTO_LEN = 512 * 1024; // ~512 KB data URL; the client resizes to a few KB
const MAX_FIELD_LEN = 4_000; // any single short text field (name/role/notes/…)
const MAX_LONG_FIELD_LEN = 20_000; // the free-text experience/history field

function clip(v: unknown, n = MAX_FIELD_LEN): string | undefined {
  return typeof v === "string" ? v.slice(0, n) : undefined;
}

type PersonInput = {
  id: string;
  name?: string;
  role?: string;
  team?: string | null;
  phone?: string | null;
  email?: string | null;
  experience?: string | null;
  photo?: string | null;
  addedAt?: string;
  updatedAt?: string;
};

type QualInput = {
  id: string;
  personId: string;
  name?: string;
  level?: string;
  issuer?: string;
  issuedAt?: string;
  expiresAt?: string;
  reference?: string;
  updatedAt?: string;
};

type ShiftInput = {
  id: string;
  personId: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  role?: string;
  location?: string;
  notes?: string;
  status?: string;
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
const SHIFT_STATUSES = new Set(["scheduled", "confirmed", "completed", "cancelled"]);

async function readAll(db: MitigaDb) {
  const people = await db.select().from(orgPersonnel).orderBy(orgPersonnel.addedAt);
  const attendance = await db.select().from(attendanceRecords);
  const quals = await db.select().from(orgQualifications);
  const shifts = await db.select().from(orgShifts);
  return { people, attendance, quals, shifts };
}

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const data = await withTenant(session.tenantId, readAll);
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const session = await requireWrite();
  if (session instanceof NextResponse) return session;

  // Reject early on the declared size, then hard-check the actual bytes
  // (Content-Length can be absent or wrong under chunked encoding).
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large", maxBytes: MAX_BODY_BYTES }, { status: 413 });
  }
  const raw = await req.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload too large", maxBytes: MAX_BODY_BYTES }, { status: 413 });
  }

  let parsed: {
    people?: PersonInput[];
    attendance?: AttendanceInput[];
    quals?: QualInput[];
    shifts?: ShiftInput[];
    deletePersonIds?: string[];
    deleteAttendanceKeys?: { personId: string; date: string }[];
    deleteQualIds?: string[];
    deleteShiftIds?: string[];
  } | null;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) return NextResponse.json({ error: "invalid body" }, { status: 400 });
  // Strip NUL bytes / lone surrogates so bad paste-in text can't 500 the sync
  // (Postgres text/jsonb reject both), matching the incident-state sync.
  const body = sanitizeForJsonb(parsed);

  const people = (body.people ?? [])
    .filter((p) => p && UUID_RE.test(p.id))
    .slice(0, MAX_ROWS)
    .map((p) => ({
      ...p,
      name: clip(p.name),
      role: clip(p.role),
      team: clip(p.team),
      phone: clip(p.phone),
      email: clip(p.email),
      experience: clip(p.experience, MAX_LONG_FIELD_LEN),
      // Drop an oversized photo rather than fail the whole sync; the client only
      // ever sends a small resized data URL, so anything larger is abuse.
      photo: typeof p.photo === "string" && p.photo.length <= MAX_PHOTO_LEN ? p.photo : null,
    }));
  const quals = (body.quals ?? [])
    .filter((q) => q && UUID_RE.test(q.id) && UUID_RE.test(q.personId))
    .slice(0, MAX_ROWS)
    .map((q) => ({
      ...q,
      name: clip(q.name),
      level: clip(q.level),
      issuer: clip(q.issuer),
      issuedAt: clip(q.issuedAt, 40),
      expiresAt: clip(q.expiresAt, 40),
      reference: clip(q.reference),
    }));
  const deleteQualIds = (body.deleteQualIds ?? []).filter((id) => UUID_RE.test(id));
  const shifts = (body.shifts ?? [])
    .filter((s) => s && UUID_RE.test(s.id) && UUID_RE.test(s.personId))
    .slice(0, MAX_ROWS)
    .map((s) => ({
      ...s,
      date: clip(s.date, 40),
      startTime: clip(s.startTime, 40),
      endTime: clip(s.endTime, 40),
      role: clip(s.role),
      location: clip(s.location),
      notes: clip(s.notes, MAX_LONG_FIELD_LEN),
    }));
  const deleteShiftIds = (body.deleteShiftIds ?? []).filter((id) => UUID_RE.test(id));
  const attendance = (body.attendance ?? [])
    .filter(
      (a) =>
        a && UUID_RE.test(a.personId) && DATE_RE.test(a.date) && STATUSES.has(String(a.status)),
    )
    .slice(0, MAX_ROWS)
    .map((a) => ({ ...a, checkInAt: clip(a.checkInAt, 40), note: clip(a.note) }));
  const deletePersonIds = (body.deletePersonIds ?? []).filter((id) => UUID_RE.test(id));
  const deleteAttendanceKeys = (body.deleteAttendanceKeys ?? []).filter(
    (k) => k && UUID_RE.test(k.personId) && DATE_RE.test(k.date),
  );

  const tenantId = session.tenantId;

  const data = await withTenant(tenantId, async (db) => {
    for (const p of people) {
      await db.execute(sql`
        INSERT INTO org_personnel (id, tenant_id, name, role, team, phone, email, experience, photo, added_at, updated_at)
        VALUES (
          ${p.id}, ${tenantId}, ${p.name ?? ""}, ${p.role ?? ""}, ${p.team ?? null},
          ${p.phone ?? null}, ${p.email ?? null}, ${p.experience ?? null}, ${p.photo ?? null},
          ${p.addedAt ?? new Date().toISOString()}::timestamptz,
          ${p.updatedAt ?? new Date().toISOString()}::timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name, role = excluded.role, team = excluded.team,
          phone = excluded.phone, email = excluded.email, experience = excluded.experience,
          photo = excluded.photo, updated_at = excluded.updated_at
        WHERE excluded.updated_at >= org_personnel.updated_at
      `);
    }

    // Qualifications upsert (last-write-wins). People are upserted above first, so the
    // person_id FK is satisfied for any qual on a newly-added person.
    for (const q of quals) {
      await db.execute(sql`
        INSERT INTO org_qualifications (id, tenant_id, person_id, name, level, issuer, issued_at, expires_at, reference, updated_at)
        VALUES (
          ${q.id}, ${tenantId}, ${q.personId}, ${q.name ?? ""}, ${q.level ?? ""}, ${q.issuer ?? ""},
          ${q.issuedAt ?? ""}, ${q.expiresAt ?? ""}, ${q.reference ?? ""},
          ${q.updatedAt ?? new Date().toISOString()}::timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
          name = excluded.name, level = excluded.level, issuer = excluded.issuer,
          issued_at = excluded.issued_at, expires_at = excluded.expires_at,
          reference = excluded.reference, updated_at = excluded.updated_at
        WHERE excluded.updated_at >= org_qualifications.updated_at
      `);
    }

    // Shifts upsert (last-write-wins). People upserted above satisfy the person_id FK.
    for (const s of shifts) {
      const status = SHIFT_STATUSES.has(String(s.status)) ? s.status : "scheduled";
      await db.execute(sql`
        INSERT INTO org_shifts (id, tenant_id, person_id, date, start_time, end_time, role, location, notes, status, added_at, updated_at)
        VALUES (
          ${s.id}, ${tenantId}, ${s.personId}, ${s.date ?? ""}, ${s.startTime ?? ""}, ${s.endTime ?? ""},
          ${s.role ?? ""}, ${s.location ?? ""}, ${s.notes ?? ""}, ${status},
          ${s.addedAt ?? new Date().toISOString()}::timestamptz,
          ${s.updatedAt ?? new Date().toISOString()}::timestamptz
        )
        ON CONFLICT (id) DO UPDATE SET
          date = excluded.date, start_time = excluded.start_time, end_time = excluded.end_time,
          role = excluded.role, location = excluded.location, notes = excluded.notes,
          status = excluded.status, updated_at = excluded.updated_at
        WHERE excluded.updated_at >= org_shifts.updated_at
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
      // org_qualifications + org_shifts cascade on person delete via FK; attendance has no FK.
      await db.delete(orgPersonnel).where(inArray(orgPersonnel.id, deletePersonIds));
      await db.delete(attendanceRecords).where(inArray(attendanceRecords.personId, deletePersonIds));
    }
    if (deleteQualIds.length > 0) {
      await db.delete(orgQualifications).where(inArray(orgQualifications.id, deleteQualIds));
    }
    if (deleteShiftIds.length > 0) {
      await db.delete(orgShifts).where(inArray(orgShifts.id, deleteShiftIds));
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
