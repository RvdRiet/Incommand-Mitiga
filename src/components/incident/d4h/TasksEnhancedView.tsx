"use client";

import { useMemo, useState } from "react";

import { useIncidentStore } from "@/context/EventContext";
import type { TaskItemStatus } from "@/lib/incident/types";

import { InlineInput, InlineSelect, RowDelete, useSearchFilter } from "../shared";

type ViewProps = { searchActive?: boolean };

const TASK_STATUS_OPTS: { value: TaskItemStatus; label: string }[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_progress", label: "In progress" },
  { value: "complete", label: "Complete" },
  { value: "canceled", label: "Canceled" },
];

const KANBAN_COLUMNS: { status: TaskItemStatus; label: string }[] = [
  { status: "not_started", label: "Not started" },
  { status: "in_progress", label: "In progress" },
  { status: "complete", label: "Complete" },
  { status: "canceled", label: "Canceled" },
];

export function TasksEnhancedView({ searchActive }: ViewProps) {
  const taskLists = useIncidentStore((s) => s.taskLists);
  const updateTaskList = useIncidentStore((s) => s.updateTaskList);
  const removeTaskList = useIncidentStore((s) => s.removeTaskList);
  const addTaskItem = useIncidentStore((s) => s.addTaskItem);
  const updateTaskItem = useIncidentStore((s) => s.updateTaskItem);
  const addTaskChecklistItem = useIncidentStore((s) => s.addTaskChecklistItem);
  const toggleTaskChecklistItem = useIncidentStore((s) => s.toggleTaskChecklistItem);
  const removeTaskChecklistItem = useIncidentStore((s) => s.removeTaskChecklistItem);
  const personnel = useIncidentStore((s) => s.personnel);

  // Suggest the incident's personnel as assignees (free text still allowed, so you
  // can type an account name that will match a person's "My tasks" on the dashboard).
  const assigneeOptions = useMemo(
    () => [...new Set(personnel.map((p) => p.name.trim()).filter(Boolean))].sort(),
    [personnel],
  );

  const [view, setView] = useState<"list" | "board">("board");
  const { query, setQuery, filtered } = useSearchFilter(taskLists, (l, q) =>
    l.name.toLowerCase().includes(q),
  );

  return (
    <section className="ic-tasks-enhanced">
      <header className="ic-d4h-header">
        <div className="ic-d4h-header__row">
          <h2 className="ic-d4h-header__title">Task boards</h2>
          <div className="ic-d4h-view-toggle">
            <button
              type="button"
              className={view === "board" ? "ic-d4h-tabs__active" : ""}
              onClick={() => setView("board")}
            >
              Board
            </button>
            <button
              type="button"
              className={view === "list" ? "ic-d4h-tabs__active" : ""}
              onClick={() => setView("list")}
            >
              List
            </button>
          </div>
        </div>
        <p className="ic-d4h-header__sub">
          Task boards with checklists — use Plays to spawn pre-built task collections.
        </p>
      </header>

      {searchActive ? (
        <div className="ic-search-panel">
          <input
            type="search"
            className="ic-search-panel__input"
            placeholder="Search task lists…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="ic-table-empty">No task lists. Use + Add list in the toolbar or start a Play.</p>
      ) : (
        filtered.map((list) =>
          view === "board" ? (
            <article key={list.id} className="ic-task-board">
              <header className="ic-task-list__head">
                <InlineInput
                  value={list.name}
                  onChange={(v) => updateTaskList(list.id, { name: v })}
                />
                <button type="button" className="ic-link-btn" onClick={() => addTaskItem(list.id)}>
                  + Task
                </button>
                <RowDelete onClick={() => removeTaskList(list.id)} />
              </header>
              <div className="ic-task-board__columns">
                {KANBAN_COLUMNS.map((col) => (
                  <div key={col.status} className="ic-task-board__col">
                    <h4>{col.label}</h4>
                    {list.items
                      .filter((i) => i.status === col.status)
                      .map((item) => (
                        <TaskCard
                          key={item.id}
                          listId={list.id}
                          item={item}
                          assigneeOptions={assigneeOptions}
                          onUpdate={(patch) => updateTaskItem(list.id, item.id, patch)}
                          onAddCheck={() => addTaskChecklistItem(list.id, item.id)}
                          onToggleCheck={(cid) =>
                            toggleTaskChecklistItem(list.id, item.id, cid)
                          }
                          onRemoveCheck={(cid) =>
                            removeTaskChecklistItem(list.id, item.id, cid)
                          }
                        />
                      ))}
                  </div>
                ))}
              </div>
            </article>
          ) : (
            <article key={list.id} className="ic-task-list">
              <header className="ic-task-list__head">
                <InlineInput
                  value={list.name}
                  onChange={(v) => updateTaskList(list.id, { name: v })}
                />
                <button type="button" className="ic-link-btn" onClick={() => addTaskItem(list.id)}>
                  + Task
                </button>
                <RowDelete onClick={() => removeTaskList(list.id)} />
              </header>
              <table className="ic-table">
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <TaskCard
                          listId={list.id}
                          item={item}
                          compact
                          assigneeOptions={assigneeOptions}
                          onUpdate={(patch) => updateTaskItem(list.id, item.id, patch)}
                          onAddCheck={() => addTaskChecklistItem(list.id, item.id)}
                          onToggleCheck={(cid) =>
                            toggleTaskChecklistItem(list.id, item.id, cid)
                          }
                          onRemoveCheck={(cid) =>
                            removeTaskChecklistItem(list.id, item.id, cid)
                          }
                        />
                      </td>
                      <td>
                        <InlineSelect
                          value={item.status}
                          onChange={(v) =>
                            updateTaskItem(list.id, item.id, {
                              status: v as TaskItemStatus,
                            })
                          }
                          options={TASK_STATUS_OPTS}
                        />
                      </td>
                      <td>
                        <select
                          value={item.priority ?? "normal"}
                          onChange={(e) =>
                            updateTaskItem(list.id, item.id, {
                              priority: e.target.value as NonNullable<typeof item.priority>,
                            })
                          }
                        >
                          <option value="low">Low</option>
                          <option value="normal">Normal</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
          ),
        )
      )}
    </section>
  );
}

function TaskCard({
  listId,
  item,
  compact,
  assigneeOptions,
  onUpdate,
  onAddCheck,
  onToggleCheck,
  onRemoveCheck,
}: {
  listId: string;
  item: import("@/lib/incident/types").TaskItem;
  compact?: boolean;
  assigneeOptions: string[];
  onUpdate: (patch: Partial<import("@/lib/incident/types").TaskItem>) => void;
  onAddCheck: () => void;
  onToggleCheck: (id: string) => void;
  onRemoveCheck: (id: string) => void;
}) {
  const checks = item.checklist ?? [];
  const done = checks.filter((c) => c.done).length;
  const listId8 = `assignees-${listId.slice(0, 8)}`;

  return (
    <div className={`ic-task-card${compact ? " ic-task-card--compact" : ""}`}>
      <InlineInput value={item.title} onChange={(v) => onUpdate({ title: v })} />
      {!compact ? (
        <InlineSelect
          value={item.status}
          onChange={(v) => onUpdate({ status: v as TaskItemStatus })}
          options={TASK_STATUS_OPTS}
        />
      ) : null}
      <label className="ic-task-card__assignee">
        <span className="ic-task-card__assignee-icon" aria-hidden>
          @
        </span>
        <input
          list={listId8}
          value={item.assignee ?? ""}
          onChange={(e) => onUpdate({ assignee: e.target.value || undefined })}
          placeholder="Assign to…"
          aria-label="Assign task to"
        />
        <datalist id={listId8}>
          {assigneeOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </label>
      <div className="ic-task-card__checklist">
        <div className="ic-task-card__checklist-head">
          <span>
            Checklist {checks.length > 0 ? `(${done}/${checks.length})` : ""}
          </span>
          <button type="button" className="ic-link-btn" onClick={onAddCheck}>
            + Item
          </button>
        </div>
        <ul>
          {checks.map((c) => (
            <li key={c.id}>
              <label>
                <input
                  type="checkbox"
                  checked={c.done}
                  onChange={() => onToggleCheck(c.id)}
                />
                <input
                  className="ic-task-check-label"
                  value={c.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    onUpdate({
                      checklist: checks.map((x) =>
                        x.id === c.id ? { ...x, label } : x,
                      ),
                    });
                  }}
                />
              </label>
              <button
                type="button"
                className="ic-task-check-remove"
                onClick={() => onRemoveCheck(c.id)}
                aria-label="Remove checklist item"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
