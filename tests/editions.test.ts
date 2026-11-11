import { afterEach, describe, expect, it } from "vitest";

import { isModuleInEdition, isRouteInEdition, getActiveEdition } from "@/lib/editions";

const setEdition = (v: string | undefined) => {
  if (v === undefined) delete process.env.NEXT_PUBLIC_EDITION;
  else process.env.NEXT_PUBLIC_EDITION = v;
};

afterEach(() => setEdition(undefined));

describe("editions — full (default)", () => {
  it("exposes every module when no edition is set", () => {
    setEdition(undefined);
    expect(getActiveEdition().id).toBe("full");
    for (const slug of ["", "forms", "shelters", "analytics", "notifications", "settings"]) {
      expect(isModuleInEdition(slug)).toBe(true);
      expect(isRouteInEdition(slug)).toBe(true);
    }
  });

  it("treats an unknown edition value as full", () => {
    setEdition("enterprise-xyz");
    expect(getActiveEdition().id).toBe("full");
    expect(isModuleInEdition("shelters")).toBe(true);
  });
});

describe("editions — command_core", () => {
  it("selects the command_core edition", () => {
    setEdition("command_core");
    expect(getActiveEdition().id).toBe("command_core");
  });

  it("keeps the D4H-replacement modules in scope", () => {
    setEdition("command_core");
    for (const slug of [
      "situation", "map", "forms", "calendar", "tasks", "status-boards",
      "roles", "personnel", "certifications", "inventory", "logs", "library",
    ]) {
      expect(isModuleInEdition(slug)).toBe(true);
    }
  });

  it("hides the out-of-scope modules (incl. Live Ops comms + device registry)", () => {
    setEdition("command_core");
    for (const slug of [
      "analytics", "track-history", "outages", "damage-assessment",
      "road-damages", "residents", "shelters", "utilities-electricity", "notifications",
      "comms", "devices",
    ]) {
      expect(isModuleInEdition(slug)).toBe(false);
      expect(isRouteInEdition(slug)).toBe(false);
    }
  });

  it("always keeps the dashboard and settings", () => {
    setEdition("command_core");
    expect(isModuleInEdition("")).toBe(true);
    expect(isModuleInEdition("settings")).toBe(true);
    expect(isRouteInEdition("")).toBe(true);
    expect(isRouteInEdition("settings")).toBe(true);
  });

  it("keeps the populated area hubs reachable, and drops the now-empty Comms hub", () => {
    setEdition("command_core");
    for (const hub of [
      "hub-situation", "hub-plans", "hub-operations", "hub-people", "hub-records",
    ]) {
      expect(isRouteInEdition(hub)).toBe(true);
    }
    // Comms area = ["comms", "notifications"], both out of this edition → hub is empty.
    expect(isRouteInEdition("hub-comms")).toBe(false);
  });
});
