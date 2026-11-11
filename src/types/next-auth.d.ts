import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    tenantId?: string;
    organizationId?: string;
    role?: string;
    roleId?: string;
    roleRank?: number;
    canWrite?: boolean;
    canManageUsers?: boolean;
    canManageRoles?: boolean;
    tokenVersion?: number;
    mustChangePassword?: boolean;
  }

  interface Session {
    tenantId: string;
    userId: string;
    /** The role's stable key (built-in enum value or a custom role's slug). */
    role: string;
    /** The role row's id (null only for a membership not yet carrying one). */
    roleId: string | null;
    /** Resolved privilege rank (higher = more). Used for no-escalation comparisons. */
    roleRank: number;
    /** Resolved capability flags (work for custom roles, unlike the pure helpers). */
    canWrite: boolean;
    canManageUsers: boolean;
    canManageRoles: boolean;
    organizationId: string;
    /** When true, the user must set a new password before using anything else. */
    mustChangePassword: boolean;
    user: DefaultSession["user"] & { id: string };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId?: string;
    userId?: string;
    role?: string;
    roleId?: string;
    roleRank?: number;
    canWrite?: boolean;
    canManageUsers?: boolean;
    canManageRoles?: boolean;
    organizationId?: string;
    tokenVersion?: number;
    mustChangePassword?: boolean;
    checkedAt?: number;
  }
}
