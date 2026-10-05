"use client";

import { useEffect, useRef } from "react";

import { useAttendance, type AttendanceRecord } from "@/lib/roster/attendance";
import { useOrgRoster, type OrgPerson } from "@/lib/roster/store";

/**
 * Syncs the org roster + attendance to the server so they converge across devices
 * (the stores are otherwise per-browser localStorage). On mount it pulls the
 * tenant's records and merges them (last-write-wins on `updatedAt`); thereafter it
 * pushes local changes, debounced. Deletions are diffed against the last synced
 * snapshot and sent as explicit id/key lists. Fully offline-tolerant: a failed
 * request just keeps local state and retries on the next change.
 */
function attKey(a: { date: string; personId: string }) {
  return `${a.date}|${a.personId}`;
}

export function RosterSyncBridge() {
  const mergeServerPeople = useOrgRoster((s) => s.mergeServerPeople);
  const mergeServerAttendance = useAttendance((s) => s.mergeServerAttendance);

  const ready = useRef(false);
  const suppress = useRef(false);
  const started = useRef(false);
  const lastRef = useRef<{ personIds: Set<string>; attKeys: Set<string> }>({
    personIds: new Set(),
    attKeys: new Set(),
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (started.current) return; // guard React strict-mode double-mount
    started.current = true;

    const snapshotLast = () => {
      lastRef.current = {
        personIds: new Set(useOrgRoster.getState().people.map((p) => p.id)),
        attKeys: new Set(Object.values(useAttendance.getState().records).map(attKey)),
      };
    };

    const applyServer = (data: { people?: OrgPerson[]; attendance?: AttendanceRecord[] }) => {
      suppress.current = true;
      if (Array.isArray(data.people)) mergeServerPeople(data.people);
      if (Array.isArray(data.attendance)) mergeServerAttendance(data.attendance);
      snapshotLast();
      suppress.current = false;
    };

    const push = async () => {
      const people = useOrgRoster.getState().people;
      const attendance = Object.values(useAttendance.getState().records);
      const curPersonIds = new Set(people.map((p) => p.id));
      const curAttKeys = new Set(attendance.map(attKey));
      const deletePersonIds = [...lastRef.current.personIds].filter((id) => !curPersonIds.has(id));
      const deleteAttendanceKeys = [...lastRef.current.attKeys]
        .filter((k) => !curAttKeys.has(k))
        .map((k) => {
          const [date, personId] = k.split("|");
          return { personId: personId!, date: date! };
        });
      try {
        const res = await fetch("/api/roster", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ people, attendance, deletePersonIds, deleteAttendanceKeys }),
        });
        if (!res.ok) return; // keep local; a later change retries
        applyServer(await res.json());
      } catch {
        /* offline — keep local, resync on next change */
      }
    };

    const schedulePush = () => {
      if (!ready.current || suppress.current) return;
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(push, 800);
    };

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/roster");
        if (!cancelled && res.ok) applyServer(await res.json());
        else snapshotLast();
      } catch {
        snapshotLast(); // offline — sync from local on the first change
      }
      if (cancelled) return;
      ready.current = true;
      // Upload any local-only records the server didn't have.
      void push();
    })();

    const unsubRoster = useOrgRoster.subscribe(schedulePush);
    const unsubAttendance = useAttendance.subscribe(schedulePush);

    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
      unsubRoster();
      unsubAttendance();
    };
  }, [mergeServerPeople, mergeServerAttendance]);

  return null;
}
