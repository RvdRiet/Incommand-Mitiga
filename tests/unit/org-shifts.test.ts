import { describe, expect, it } from "vitest";

import { recentShiftsFor, shiftHours, type OrgShift } from "@/lib/roster/shifts";

function shift(p: Partial<OrgShift>): OrgShift {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    personId: p.personId ?? "p1",
    date: p.date ?? "2026-01-01",
    startTime: p.startTime ?? "08:00",
    endTime: p.endTime ?? "16:00",
    role: p.role ?? "",
    location: p.location ?? "",
    notes: p.notes ?? "",
    status: p.status ?? "scheduled",
    addedAt: p.addedAt ?? "2026-01-01T00:00:00.000Z",
    updatedAt: p.updatedAt,
  };
}

describe("shiftHours", () => {
  it("computes whole and fractional hours", () => {
    expect(shiftHours({ startTime: "08:00", endTime: "16:00" })).toBe(8);
    expect(shiftHours({ startTime: "08:00", endTime: "12:30" })).toBe(4.5);
  });

  it("wraps past midnight for overnight shifts", () => {
    expect(shiftHours({ startTime: "22:00", endTime: "06:00" })).toBe(8);
  });

  it("returns 0 when a time is missing or unparseable", () => {
    expect(shiftHours({ startTime: "", endTime: "16:00" })).toBe(0);
    expect(shiftHours({ startTime: "08:00", endTime: "" })).toBe(0);
  });
});

describe("recentShiftsFor", () => {
  const shifts: OrgShift[] = [
    shift({ id: "a", personId: "p1", date: "2026-01-01", startTime: "08:00" }),
    shift({ id: "b", personId: "p1", date: "2026-03-01", startTime: "08:00" }),
    shift({ id: "c", personId: "p1", date: "2026-02-01", startTime: "08:00" }),
    shift({ id: "d", personId: "p1", date: "2026-02-01", startTime: "14:00" }),
    shift({ id: "e", personId: "p2", date: "2026-05-01", startTime: "08:00" }),
    shift({ id: "x", personId: "p1", date: "2026-09-01", startTime: "08:00", status: "cancelled" }),
  ];

  it("returns a person's shifts newest-first, default 3, ignoring cancelled and other people", () => {
    const recent = recentShiftsFor(shifts, "p1");
    expect(recent.map((s) => s.id)).toEqual(["b", "d", "c"]);
  });

  it("respects the limit", () => {
    expect(recentShiftsFor(shifts, "p1", 1).map((s) => s.id)).toEqual(["b"]);
  });

  it("returns [] for a person with no shifts", () => {
    expect(recentShiftsFor(shifts, "nobody")).toEqual([]);
  });
});
