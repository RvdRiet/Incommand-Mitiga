"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { newId, nowIso } from "@/lib/incident/id";

export type ShiftStatus = "scheduled" | "confirmed" | "completed" | "cancelled";

export const SHIFT_STATUS_META: Record<ShiftStatus, { label: string; tone: string }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  confirmed: { label: "Confirmed", tone: "ok" },
  completed: { label: "Completed", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "bad" },
};

export const SHIFT_STATUS_ORDER: ShiftStatus[] = [
  "scheduled",
  "confirmed",
  "completed",
  "cancelled",
];

/** A planned shift on the org-wide master schedule, assigned to a roster person. */
export type OrgShift = {
  id: string;
  personId: string;
  /** Shift day, YYYY-MM-DD. */
  date: string;
  /** Start clock time, HH:mm. */
  startTime: string;
  /** End clock time, HH:mm. */
  endTime: string;
  /** Position worked this shift (free text). */
  role: string;
  location: string;
  notes: string;
  status: ShiftStatus;
  addedAt: string;
  /** Last local edit — drives last-write-wins server sync. */
  updatedAt?: string;
};

type ShiftState = { shifts: OrgShift[] };
type ShiftActions = {
  addShift: (personId: string, s?: Partial<OrgShift>) => string;
  updateShift: (id: string, patch: Partial<OrgShift>) => void;
  removeShift: (id: string) => void;
  mergeServerShifts: (server: OrgShift[]) => void;
};
export type ShiftStore = ShiftState & ShiftActions;

export const useOrgShifts = create<ShiftStore>()(
  persist(
    (set) => ({
      shifts: [],
      addShift: (personId, s) => {
        const id = s?.id ?? newId();
        const ts = nowIso();
        set((state) => ({
          shifts: [
            ...state.shifts,
            {
              id,
              personId,
              date: s?.date ?? "",
              startTime: s?.startTime ?? "",
              endTime: s?.endTime ?? "",
              role: s?.role ?? "",
              location: s?.location ?? "",
              notes: s?.notes ?? "",
              status: s?.status ?? "scheduled",
              addedAt: ts,
              updatedAt: ts,
            },
          ],
        }));
        return id;
      },
      updateShift: (id, patch) =>
        set((state) => ({
          shifts: state.shifts.map((sh) =>
            sh.id === id ? { ...sh, ...patch, updatedAt: nowIso() } : sh,
          ),
        })),
      removeShift: (id) => set((state) => ({ shifts: state.shifts.filter((sh) => sh.id !== id) })),
      mergeServerShifts: (server) =>
        set((state) => {
          const byId = new Map(state.shifts.map((sh) => [sh.id, sh]));
          for (const ss of server) {
            if (!ss?.id) continue;
            const local = byId.get(ss.id);
            if (!local || (ss.updatedAt ?? "") >= (local.updatedAt ?? "")) byId.set(ss.id, ss);
          }
          return { shifts: [...byId.values()] };
        }),
    }),
    { name: "mitiga-org-shifts-v1" },
  ),
);

/** Sort key: later date first, then later start time — newest shift leads. */
function recencyKey(s: OrgShift): string {
  return `${s.date}T${s.startTime || "00:00"}`;
}

/** A person's most recent shifts (by date+time, newest first). Used by the in-event person view. */
export function recentShiftsFor(shifts: OrgShift[], personId: string, limit = 3): OrgShift[] {
  return shifts
    .filter((s) => s.personId === personId && s.status !== "cancelled")
    .sort((a, b) => recencyKey(b).localeCompare(recencyKey(a)))
    .slice(0, limit);
}

/** Duration of a shift in hours (0 if times missing or end precedes start, e.g. overnight not handled). */
export function shiftHours(s: Pick<OrgShift, "startTime" | "endTime">): number {
  if (!s.startTime || !s.endTime) return 0;
  const [sh, sm] = s.startTime.split(":").map(Number);
  const [eh, em] = s.endTime.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return 0;
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight shift
  return Math.round((mins / 60) * 10) / 10;
}

/** Avoids SSR/client hydration mismatch before localStorage rehydrates. */
export function useOrgShiftsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useOrgShifts.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useOrgShifts.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
