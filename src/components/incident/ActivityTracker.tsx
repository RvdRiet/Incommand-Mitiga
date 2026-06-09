"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { describeClickTarget, describeFieldChange } from "@/lib/incident/activity-log";
import { getStoredFormActorName } from "@/lib/incident/form-actor";

const INPUT_DEBOUNCE_MS = 700;
const CLICK_DEBOUNCE_MS = 120;

function actorName() {
  return getStoredFormActorName() || "Operator";
}

function shouldIgnoreTarget(el: Element): boolean {
  if (el.closest("[data-activity-ignore]")) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === "html" || tag === "body") return true;
  return false;
}

export function ActivityTracker() {
  const recordActivity = useIncidentStore((s) => s.recordActivity);
  const pathname = usePathname();
  const lastPath = useRef<string | null>(null);
  const lastClick = useRef<{ target: string; at: number } | null>(null);
  const inputTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!pathname || pathname === lastPath.current) return;
    lastPath.current = pathname;
    recordActivity({
      message: "Page viewed",
      tags: ["navigation"],
      kind: "navigation",
      target: pathname,
      author: actorName(),
    });
  }, [pathname, recordActivity]);

  useEffect(() => {
    const logClick = (event: MouseEvent) => {
      const raw = event.target;
      if (!(raw instanceof Element) || shouldIgnoreTarget(raw)) return;

      const { target, detail } = describeClickTarget(raw);
      const now = Date.now();
      if (
        lastClick.current &&
        lastClick.current.target === target &&
        now - lastClick.current.at < CLICK_DEBOUNCE_MS
      ) {
        return;
      }
      lastClick.current = { target, at: now };

      recordActivity({
        message: "Click",
        tags: ["ui", "click"],
        kind: "ui",
        target,
        detail,
        author: actorName(),
      });
    };

    const scheduleFieldLog = (el: Element) => {
      const described = describeFieldChange(el);
      if (!described) return;

      const key =
        el instanceof HTMLElement && el.id
          ? el.id
          : `${described.target}-${el.tagName}`;

      const existing = inputTimers.current.get(key);
      if (existing) clearTimeout(existing);

      inputTimers.current.set(
        key,
        setTimeout(() => {
          inputTimers.current.delete(key);
          recordActivity({
            message: "Field updated",
            tags: ["ui", "field"],
            kind: "ui",
            target: described.target,
            detail: described.detail,
            author: actorName(),
          });
        }, INPUT_DEBOUNCE_MS),
      );
    };

    const onInput = (event: Event) => {
      const t = event.target;
      if (t instanceof Element) scheduleFieldLog(t);
    };

    const onChange = (event: Event) => {
      const t = event.target;
      if (!(t instanceof Element) || shouldIgnoreTarget(t)) return;
      const described = describeFieldChange(t);
      if (!described) return;
      recordActivity({
        message: "Field changed",
        tags: ["ui", "field"],
        kind: "ui",
        target: described.target,
        detail: described.detail,
        author: actorName(),
      });
    };

    const onFocus = (event: FocusEvent) => {
      const t = event.target;
      if (!(t instanceof Element) || shouldIgnoreTarget(t)) return;
      const described = describeFieldChange(t);
      if (!described) return;
      recordActivity({
        message: "Field focused",
        tags: ["ui", "focus"],
        kind: "ui",
        target: described.target,
        author: actorName(),
      });
    };

    document.addEventListener("click", logClick, true);
    document.addEventListener("input", onInput, true);
    document.addEventListener("change", onChange, true);
    document.addEventListener("focusin", onFocus, true);

    return () => {
      document.removeEventListener("click", logClick, true);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("change", onChange, true);
      document.removeEventListener("focusin", onFocus, true);
      for (const t of inputTimers.current.values()) clearTimeout(t);
      inputTimers.current.clear();
    };
  }, [recordActivity]);

  return null;
}
