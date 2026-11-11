"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { newId, nowIso } from "@/lib/incident/id";

/** An org-level qualification/certification attached to a roster person. */
export type OrgQualification = {
  id: string;
  personId: string;
  name: string;
  /** Competency level, e.g. "Level 3" / "Advanced" (free text). */
  level: string;
  issuer: string;
  /** ISO date issued ("" if unknown). */
  issuedAt: string;
  /** ISO date it expires ("" = no expiry). */
  expiresAt: string;
  /** Certificate / registration number. */
  reference: string;
  /** Last local edit — drives last-write-wins server sync. */
  updatedAt?: string;
};

type QualState = { quals: OrgQualification[] };
type QualActions = {
  addQual: (personId: string, q?: Partial<OrgQualification>) => string;
  updateQual: (id: string, patch: Partial<OrgQualification>) => void;
  removeQual: (id: string) => void;
  mergeServerQuals: (server: OrgQualification[]) => void;
};
export type QualStore = QualState & QualActions;

export const useOrgQualifications = create<QualStore>()(
  persist(
    (set) => ({
      quals: [],
      addQual: (personId, q) => {
        const id = q?.id ?? newId();
        set((s) => ({
          quals: [
            ...s.quals,
            {
              id,
              personId,
              name: q?.name ?? "",
              level: q?.level ?? "",
              issuer: q?.issuer ?? "",
              issuedAt: q?.issuedAt ?? "",
              expiresAt: q?.expiresAt ?? "",
              reference: q?.reference ?? "",
              updatedAt: nowIso(),
            },
          ],
        }));
        return id;
      },
      updateQual: (id, patch) =>
        set((s) => ({
          quals: s.quals.map((q) => (q.id === id ? { ...q, ...patch, updatedAt: nowIso() } : q)),
        })),
      removeQual: (id) => set((s) => ({ quals: s.quals.filter((q) => q.id !== id) })),
      mergeServerQuals: (server) =>
        set((s) => {
          const byId = new Map(s.quals.map((q) => [q.id, q]));
          for (const sq of server) {
            if (!sq?.id) continue;
            const local = byId.get(sq.id);
            if (!local || (sq.updatedAt ?? "") >= (local.updatedAt ?? "")) byId.set(sq.id, sq);
          }
          return { quals: [...byId.values()] };
        }),
    }),
    { name: "mitiga-org-qualifications-v1" },
  ),
);

/** Days until a qualification expires (negative = expired); null if no expiry. */
export function daysUntilExpiry(expiresAt: string): number | null {
  if (!expiresAt) return null;
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return null;
  return Math.ceil((ms - Date.now()) / 86_400_000);
}

/** Avoids SSR/client hydration mismatch before localStorage rehydrates. */
export function useOrgQualificationsHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useOrgQualifications.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useOrgQualifications.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
