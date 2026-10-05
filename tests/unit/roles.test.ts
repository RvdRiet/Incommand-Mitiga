import { describe, expect, it } from "vitest";

import {
  MIN_WRITE_ROLE,
  canManageUsers,
  canWriteIncidentData,
  hasRole,
  roleRank,
} from "@/lib/auth/roles";
import { isSessionStillValid } from "@/lib/auth/session";

describe("role hierarchy", () => {
  it("orders roles by privilege", () => {
    expect(roleRank("viewer")).toBeLessThan(roleRank("planner"));
    expect(roleRank("planner")).toBeLessThan(roleRank("incident_manager"));
    expect(roleRank("incident_manager")).toBeLessThan(roleRank("org_admin"));
    expect(roleRank("org_admin")).toBeLessThan(roleRank("tenant_admin"));
  });

  it("hasRole is a floor check", () => {
    expect(hasRole("tenant_admin", "org_admin")).toBe(true);
    expect(hasRole("viewer", "planner")).toBe(false);
    expect(hasRole(undefined, "viewer")).toBe(true);
  });

  it("viewers are read-only; planner+ can write incident data", () => {
    expect(MIN_WRITE_ROLE).toBe("planner");
    expect(canWriteIncidentData("viewer")).toBe(false);
    expect(canWriteIncidentData("planner")).toBe(true);
    expect(canWriteIncidentData("incident_manager")).toBe(true);
  });

  it("only org_admin+ can manage users", () => {
    expect(canManageUsers("incident_manager")).toBe(false);
    expect(canManageUsers("org_admin")).toBe(true);
    expect(canManageUsers("tenant_admin")).toBe(true);
  });
});

describe("session revocation", () => {
  it("valid when active and token_version matches", () => {
    expect(isSessionStillValid({ status: "active", dbTokenVersion: 0, tokenTokenVersion: 0 })).toBe(true);
    expect(isSessionStillValid({ status: "active", dbTokenVersion: 3, tokenTokenVersion: 3 })).toBe(true);
  });

  it("invalid when disabled", () => {
    expect(isSessionStillValid({ status: "disabled", dbTokenVersion: 0, tokenTokenVersion: 0 })).toBe(false);
  });

  it("invalid when token_version has moved (forced sign-out / reset)", () => {
    expect(isSessionStillValid({ status: "active", dbTokenVersion: 2, tokenTokenVersion: 1 })).toBe(false);
  });
});
