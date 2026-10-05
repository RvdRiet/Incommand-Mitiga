"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { nowIso } from "@/lib/incident/id";

/** Attendance state for one person on one day/session. */
export type AttendanceStatus = "present" | "late" | "absent" | "excused";

export type AttendanceRecord = {
  personId: string;
  /** Session day, YYYY-MM-DD. */
  date: string;
  status: AttendanceStatus;
  /** Optional check-in clock time, HH:mm. */
  checkInAt?: string;
  note?: string;
  markedAt: string;
  /** Last local edit — drives last-write-wins server sync. */
  updatedAt?: string;
};

export const ATTENDANCE_STATUS_META: Record<
  AttendanceStatus,
  { label: string; short: string }
> = {
  present: { label: "Present", short: "P" },
  late: { label: "Late", short: "L" },
  absent: { label: "Absent", short: "A" },
  excused: { label: "Excused", short: "E" },
};

export const ATTENDANCE_STATUS_ORDER: AttendanceStatus[] = [
  "present",
  "late",
  "absent",
  "excused",
];

/** Records keyed by `${date}|${personId}` so lookups and upserts are O(1). */
function key(date: string, personId: string) {
  return `${date}|${personId}`;
}

type AttendanceState = { records: Record<string, AttendanceRecord> };
type AttendanceActions = {
  /** Set (or replace) a person's status for a date; clears any prior record's fields it doesn't touch. */
  setStatus: (personId: string, date: string, status: AttendanceStatus) => void;
  /** Patch check-in time / note for an existing (or new) record. */
  patch: (
    personId: string,
    date: string,
    patch: Partial<Pick<AttendanceRecord, "checkInAt" | "note" | "status">>,
  ) => void;
  /** Remove a person's mark for a date (back to "unmarked"). */
  clearMark: (personId: string, date: string) => void;
  /** Merge server records (last-write-wins on updatedAt) — for cross-device sync. */
  mergeServerAttendance: (server: AttendanceRecord[]) => void;
};

export type AttendanceStore = AttendanceState & AttendanceActions;

export const useAttendance = create<AttendanceStore>()(
  persist(
    (set) => ({
      records: {},
      setStatus: (personId, date, status) =>
        set((s) => {
          const k = key(date, personId);
          const prev = s.records[k];
          return {
            records: {
              ...s.records,
              [k]: {
                personId,
                date,
                status,
                checkInAt:
                  status === "present" || status === "late"
                    ? (prev?.checkInAt ?? defaultCheckIn())
                    : undefined,
                note: prev?.note,
                markedAt: nowIso(),
                updatedAt: nowIso(),
              },
            },
          };
        }),
      patch: (personId, date, patchValue) =>
        set((s) => {
          const k = key(date, personId);
          const prev = s.records[k];
          const base: AttendanceRecord =
            prev ?? { personId, date, status: "present", markedAt: nowIso() };
          return {
            records: {
              ...s.records,
              [k]: { ...base, ...patchValue, markedAt: nowIso(), updatedAt: nowIso() },
            },
          };
        }),
      clearMark: (personId, date) =>
        set((s) => {
          const next = { ...s.records };
          delete next[key(date, personId)];
          return { records: next };
        }),
      mergeServerAttendance: (server) =>
        set((s) => {
          const records = { ...s.records };
          for (const sr of server) {
            if (!sr?.personId || !sr?.date) continue;
            const k = key(sr.date, sr.personId);
            const local = records[k];
            if (!local || (sr.updatedAt ?? "") >= (local.updatedAt ?? "")) {
              records[k] = {
                ...sr,
                checkInAt: sr.checkInAt ?? undefined,
                note: sr.note ?? undefined,
              };
            }
          }
          return { records };
        }),
    }),
    { name: "mitiga-attendance-v1" },
  ),
);

/** Local YYYY-MM-DD for a Date (default today) — avoids UTC off-by-one from toISOString. */
export function toDateInput(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function defaultCheckIn(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Look up one person's record for a date. */
export function attendanceFor(
  records: Record<string, AttendanceRecord>,
  date: string,
  personId: string,
): AttendanceRecord | undefined {
  return records[key(date, personId)];
}

/** Avoids SSR/client hydration mismatch before localStorage rehydrates. */
export function useAttendanceHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useAttendance.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useAttendance.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
