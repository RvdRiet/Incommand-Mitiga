/**
 * Pure role logic — no server imports, so it's safe to use in client components
 * (the RBAC guard in rbac.ts adds the server-only session checks on top).
 *
 * Roles are described by a RECORD (rank + explicit capability flags), not an enum
 * position. The 5 built-ins live in SYSTEM_ROLES below; a tenant's custom roles
 * (added in a later RBAC phase) are the same shape, resolved from the DB server-side.
 * Keeping capabilities as explicit flags — rather than deriving them from rank — lets
 * a custom role mix them freely (e.g. write incident data but not manage users).
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

/** What a role is allowed to do. Visibility of individual modules is separate (permissions.ts). */
export type RoleCapabilities = {
  /** May write incident data (state sync, blob uploads). `viewer` cannot. */
  canWrite: boolean;
  /** May invite/manage users and assign roles. */
  canManageUsers: boolean;
  /** May edit the role catalogue + per-role module permissions. */
  canManageRoles: boolean;
};

export type RoleDescriptor = RoleCapabilities & {
  key: string;
  name: string;
  /** Higher = more privileged. Built-ins are spaced by 10 so custom roles can slot between. */
  rank: number;
  isSystem: boolean;
};

/**
 * The built-in roles and their capabilities — the exact behaviour the app has always
 * enforced: planner+ can write; org_admin+ can manage users and roles. Ranks are
 * spaced by 10 to leave room for custom roles between them.
 */
export const SYSTEM_ROLES: Record<Role, RoleDescriptor> = {
  viewer:           { key: "viewer",           name: "Viewer",           rank: 10, isSystem: true, canWrite: false, canManageUsers: false, canManageRoles: false },
  planner:          { key: "planner",          name: "Planner",          rank: 20, isSystem: true, canWrite: true,  canManageUsers: false, canManageRoles: false },
  incident_manager: { key: "incident_manager", name: "Incident Manager", rank: 30, isSystem: true, canWrite: true,  canManageUsers: false, canManageRoles: false },
  org_admin:        { key: "org_admin",        name: "Org Admin",        rank: 40, isSystem: true, canWrite: true,  canManageUsers: true,  canManageRoles: true  },
  tenant_admin:     { key: "tenant_admin",     name: "Tenant Admin",     rank: 50, isSystem: true, canWrite: true,  canManageUsers: true,  canManageRoles: true  },
};

/**
 * Resolve a role key to its descriptor. Unknown or missing keys fall back to `viewer`
 * (the least-privileged role) — identical to the previous indexOf-based default. Note
 * this only knows the built-ins; a tenant's custom roles are resolved server-side and
 * carried on the session, so callers that must rank a custom role use that resolved
 * descriptor, not this pure helper.
 */
export function systemRole(role: string | undefined): RoleDescriptor {
  return SYSTEM_ROLES[(role ?? "viewer") as Role] ?? SYSTEM_ROLES.viewer;
}

export function roleRank(role: string | undefined): number {
  return systemRole(role).rank;
}

export function hasRole(userRole: string | undefined, required: Role): boolean {
  return roleRank(userRole) >= roleRank(required);
}

/** Roles allowed to manage users/invitations in a tenant. */
export function canManageUsers(role: string | undefined): boolean {
  return systemRole(role).canManageUsers;
}

/** Roles allowed to edit the role catalogue + per-role permission matrix. */
export function canManageRoles(role: string | undefined): boolean {
  return systemRole(role).canManageRoles;
}

/**
 * Minimum role to WRITE incident data (state sync, blob uploads). `viewer` is
 * read-only; everyone above can contribute. This is the server-side floor that
 * makes the read-only role a real boundary, not just a hidden nav item — the
 * per-module visibility layer only declutters the UI.
 */
export const MIN_WRITE_ROLE: Role = "planner";

export function canWriteIncidentData(role: string | undefined): boolean {
  return systemRole(role).canWrite;
}
