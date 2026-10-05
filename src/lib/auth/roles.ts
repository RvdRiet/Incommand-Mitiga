/**
 * Pure role logic — no server imports, so it's safe to use in client components
 * (the RBAC guard in rbac.ts adds the server-only session checks on top).
 *
 * Ordered by privilege: tenant_admin > org_admin > incident_manager > planner > viewer
 */
export const ROLES = [
  "viewer",
  "planner",
  "incident_manager",
  "org_admin",
  "tenant_admin",
] as const;
export type Role = (typeof ROLES)[number];

export function roleRank(role: string | undefined): number {
  const i = ROLES.indexOf((role ?? "viewer") as Role);
  return i < 0 ? 0 : i;
}

export function hasRole(userRole: string | undefined, required: Role): boolean {
  return roleRank(userRole) >= roleRank(required);
}

/** Roles allowed to manage users/invitations in a tenant. */
export function canManageUsers(role: string | undefined): boolean {
  return hasRole(role, "org_admin");
}

/**
 * Minimum role to WRITE incident data (state sync, blob uploads). `viewer` is
 * read-only; everyone above can contribute. This is the server-side floor that
 * makes the read-only role a real boundary, not just a hidden nav item — the
 * per-module visibility layer only declutters the UI.
 */
export const MIN_WRITE_ROLE: Role = "planner";

export function canWriteIncidentData(role: string | undefined): boolean {
  return hasRole(role, MIN_WRITE_ROLE);
}
