"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

import { useIncidentStore } from "@/context/EventContext";
import { describeFieldChange } from "@/lib/incident/activity-log";
import { getStoredFormActorName } from "@/lib/incident/form-actor";

function shouldIgnoreTarget(el: Element): boolean {
  if (el.closest("[data-activity-ignore]")) return true;
  const tag = el.tagName.toLowerCase();
  return tag === "html" || tag === "body";
}

/**
 * Account-attributed activity logging.
 *
 * - Sets the incident store's `currentActor` from the signed-in account, so every
 *   logged action (store data changes, form saves, map edits, …) is recorded
 *   against the real person.
 * - Logs meaningful DATA EDITS: a field's value committed (native `change`, which
 *   fires on blur for text inputs and immediately for checkboxes/selects).
 * - Does NOT log clicks, focus or page views — that's negligent bloat. Creates and
 *   removals are already captured by the store's data-change logger. Mark any
 *   UI-only input (search, filters) with `data-activity-ignore` to skip it.
 */
export function ActivityTracker() {
  const { data: session } = useSession();
  const recordActivity = useIncidentStore((s) => s.recordActivity);
  const setCurrentActor = useIncidentStore((s) => s.setCurrentActor);

  useEffect(() => {
    const name =
      session?.user?.name?.trim() || session?.user?.email?.trim() || getStoredFormActorName();
    if (name) setCurrentActor(name);
  }, [session, setCurrentActor]);

  useEffect(() => {
    const onChange = (event: Event) => {
      const t = event.target;
      if (!(t instanceof Element) || shouldIgnoreTarget(t)) return;
      const described = describeFieldChange(t);
      if (!described) return;
      recordActivity({
        message: "Edited",
        tags: ["edit"],
        kind: "data",
        target: described.target,
        detail: described.detail,
      });
    };

    document.addEventListener("change", onChange, true);
    return () => document.removeEventListener("change", onChange, true);
  }, [recordActivity]);

  return null;
}
