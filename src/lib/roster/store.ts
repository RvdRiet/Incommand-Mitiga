"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { newId, nowIso } from "@/lib/incident/id";

/** A staff member on the organisation-wide roster, reusable across every event. */
export type OrgPerson = {
  id: string;
  name: string;
  role: string;
  team?: string;
  phone?: string;
  email?: string;
  /** Free-text experience & history: years of service, past deployments, quals gained. */
  experience?: string;
  addedAt: string;
  /** Last local edit — drives last-write-wins server sync. */
  updatedAt?: string;
};

type RosterState = { people: OrgPerson[] };
type RosterActions = {
  addPerson: (p?: Partial<OrgPerson>) => string;
  updatePerson: (id: string, patch: Partial<OrgPerson>) => void;
  removePerson: (id: string) => void;
  /** Merge server records (last-write-wins on updatedAt) — for cross-device sync. */
  mergeServerPeople: (server: OrgPerson[]) => void;
};
export type RosterStore = RosterState & RosterActions;

export const useOrgRoster = create<RosterStore>()(
  persist(
    (set) => ({
      people: [],
      addPerson: (p) => {
        const id = p?.id ?? newId();
        const ts = nowIso();
        set((s) => ({
          people: [
            ...s.people,
            {
              id,
              name: p?.name?.trim() || "New person",
              role: p?.role?.trim() || "",
              team: p?.team?.trim() || undefined,
              phone: p?.phone?.trim() || undefined,
              email: p?.email?.trim() || undefined,
              experience: p?.experience?.trim() || undefined,
              addedAt: ts,
              updatedAt: ts,
            },
          ],
        }));
        return id;
      },
      updatePerson: (id, patch) =>
        set((s) => ({
          people: s.people.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p,
          ),
        })),
      removePerson: (id) => set((s) => ({ people: s.people.filter((p) => p.id !== id) })),
      mergeServerPeople: (server) =>
        set((s) => {
          const byId = new Map(s.people.map((p) => [p.id, p]));
          for (const sp of server) {
            if (!sp?.id) continue;
            const local = byId.get(sp.id);
            // Server wins only if we have no local copy or its edit is newer/equal.
            if (!local || (sp.updatedAt ?? "") >= (local.updatedAt ?? "")) {
              byId.set(sp.id, {
                ...sp,
                team: sp.team ?? undefined,
                phone: sp.phone ?? undefined,
                email: sp.email ?? undefined,
                experience: sp.experience ?? undefined,
              });
            }
          }
          return { people: [...byId.values()].sort((a, b) => a.addedAt.localeCompare(b.addedAt)) };
        }),
    }),
    { name: "mitiga-org-roster-v1" },
  ),
);

/** Avoids SSR/client hydration mismatch before localStorage rehydrates. */
export function useOrgRosterHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useOrgRoster.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useOrgRoster.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
