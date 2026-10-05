import { describe, expect, it } from "vitest";

import { createInitialIncidentState } from "@/lib/incident/initial-state";
import {
  CORE_MODULE,
  assembleState,
  isModuleReadable,
  moduleForKey,
  splitStateByModule,
} from "@/lib/incident/module-state-map";

describe("module ↔ state-key mapping", () => {
  it("maps every incident-state key to a module (never silently unmapped)", () => {
    // Any key not in the explicit map falls to CORE — assert none of the real
    // state keys do, so a new key can't accidentally become always-visible.
    for (const key of Object.keys(createInitialIncidentState())) {
      const slug = moduleForKey(key);
      if (slug === CORE_MODULE) {
        // Only `settings` is intentionally core.
        expect(key).toBe("settings");
      }
    }
  });

  it("routes custom forms/surveys through the forms module (so they persist to the DB)", () => {
    // Custom (drag-and-drop) forms live under `customForms` and must sync with the
    // forms module — this is what makes them save to the database like ICS forms.
    expect(moduleForKey("customForms")).toBe("forms");
    const split = splitStateByModule({ forms: [], customForms: [{ id: "cf1" }] });
    expect(split.forms).toEqual({ forms: [], customForms: [{ id: "cf1" }] });
  });

  it("split → assemble round-trips a whole state doc", () => {
    const state = { situation: { name: "x" }, personnel: [{ id: "p1" }], forms: [] };
    const split = splitStateByModule(state);
    expect(split.situation).toEqual({ situation: { name: "x" } });
    expect(split.personnel).toEqual({ personnel: [{ id: "p1" }] });
    const assembled = assembleState(
      Object.entries(split).map(([moduleSlug, s]) => ({ moduleSlug, state: s })),
    );
    expect(assembled).toEqual(state);
  });

  it("redacts modules not in the allow-set (core always readable)", () => {
    const allowed = new Set(["situation"]);
    expect(isModuleReadable("situation", allowed)).toBe(true);
    expect(isModuleReadable("personnel", allowed)).toBe(false);
    expect(isModuleReadable(CORE_MODULE, allowed)).toBe(true); // settings
  });
});
