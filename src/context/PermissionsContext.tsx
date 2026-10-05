"use client";

import { createContext, useContext, useMemo } from "react";

/**
 * Module visibility for the current user, resolved server-side (in the event
 * layout) and passed down so the sidebar/hubs/module routes filter without a
 * loading flash. Outside a provider it defaults OPEN, so anything not gated
 * (e.g. local-only, unauthenticated use) behaves exactly as before.
 */
type PermCtx = { canSee: (slug: string) => boolean };

const Ctx = createContext<PermCtx | null>(null);

export function PermissionsProvider({
  allowed,
  children,
}: {
  allowed: string[];
  children: React.ReactNode;
}) {
  const value = useMemo<PermCtx>(() => {
    const set = new Set(allowed);
    return { canSee: (slug: string) => set.has(slug) };
  }, [allowed]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePermissions(): PermCtx {
  return useContext(Ctx) ?? { canSee: () => true };
}
