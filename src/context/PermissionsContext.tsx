"use client";

import { createContext, useContext, useMemo } from "react";

import { isModuleInEdition } from "@/lib/editions";

/**
 * Module visibility for the current user, resolved server-side (in the event
 * layout) and passed down so the sidebar/hubs/module routes filter without a
 * loading flash. Outside a provider it defaults OPEN, so anything not gated
 * (e.g. local-only, unauthenticated use) behaves exactly as before.
 *
 * The active product edition is ANDed in on both paths, so an out-of-edition
 * module is hidden even in local/unauthenticated use (where no provider wraps the
 * tree). Role permissions and edition are independent gates; a module must pass
 * both to be seen.
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
    return { canSee: (slug: string) => set.has(slug) && isModuleInEdition(slug) };
  }, [allowed]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const EDITION_ONLY: PermCtx = { canSee: (slug: string) => isModuleInEdition(slug) };

export function usePermissions(): PermCtx {
  return useContext(Ctx) ?? EDITION_ONLY;
}
