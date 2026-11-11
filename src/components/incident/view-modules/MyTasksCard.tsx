"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useEventId, useIncidentStore } from "@/context/EventContext";
import { moduleHref } from "@/lib/navigation/modules";
import type { TaskItemStatus } from "@/lib/incident/types";

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const STATUS_LABEL: Record<TaskItemStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
  canceled: "Canceled",
};

/**
 * "My tasks" — the tasks assigned to the signed-in person, shown on their event
 * dashboard. Matches the task's `assignee` against the current account name
 * (`currentActor`, set from the session). Hidden when nothing is assigned so it
 * never clutters the dashboard.
 */
export function MyTasksCard() {
  const eventId = useEventId();
  const taskLists = useIncidentStore((s) => s.taskLists);
  const me = useIncidentStore((s) => s.currentActor);

  const myTasks = useMemo(() => {
    const meNorm = me.trim().toLowerCase();
    if (!meNorm || meNorm === "system") return [];
    const rows: { id: string; title: string; status: TaskItemStatus; priority: string; listName: string }[] = [];
    for (const list of taskLists) {
      for (const item of list.items) {
        if ((item.assignee ?? "").trim().toLowerCase() !== meNorm) continue;
        if (item.status === "complete" || item.status === "canceled") continue;
        rows.push({
          id: item.id,
          title: item.title,
          status: item.status,
          priority: item.priority ?? "normal",
          listName: list.name,
        });
      }
    }
    rows.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2));
    return rows;
  }, [taskLists, me]);

  if (myTasks.length === 0) return null;

  return (
    <section className="ic-mytasks" aria-label="My tasks">
      <div className="ic-mytasks__head">
        <h3>
          My tasks <span className="ic-mytasks__count">{myTasks.length}</span>
        </h3>
        <Link href={moduleHref(eventId, "tasks")} className="ic-accent-link">
          All tasks →
        </Link>
      </div>
      <ul className="ic-mytasks__list">
        {myTasks.map((t) => (
          <li key={t.id} className="ic-mytasks__item">
            <span
              className={`ic-mytasks__pri ic-mytasks__pri--${t.priority}`}
              title={`${t.priority} priority`}
              aria-hidden
            />
            <span className="ic-mytasks__title">{t.title || "Untitled task"}</span>
            <span className="ic-mytasks__meta">
              {t.listName} · {STATUS_LABEL[t.status]}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
