import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface User {
    tenantId?: string;
    organizationId?: string;
    role?: string;
    tokenVersion?: number;
  }

  interface Session {
    tenantId: string;
    userId: string;
    role: string;
    organizationId: string;
    user: DefaultSession["user"] & { id: string };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    tenantId?: string;
    userId?: string;
    role?: string;
    organizationId?: string;
    tokenVersion?: number;
    checkedAt?: number;
  }
}
