"use client";

import { useState } from "react";

import { useIncidentStore } from "@/context/EventContext";

import { InlineInput } from "../shared";

export function StatusBoardsView() {
  const boards = useIncidentStore((s) => s.statusBoards);
  const addStatusBoard = useIncidentStore((s) => s.addStatusBoard);
  const updateStatusBoard = useIncidentStore((s) => s.updateStatusBoard);
  const addStatusBoardItem = useIncidentStore((s) => s.addStatusBoardItem);
  const updateStatusBoardItem = useIncidentStore((s) => s.updateStatusBoardItem);
  const removeStatusBoardItem = useIncidentStore((s) => s.removeStatusBoardItem);
  const moveStatusBoardItem = useIncidentStore((s) => s.moveStatusBoardItem);

  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");

  const board = boards.find((b) => b.id === boardId) ?? boards[0];

  if (!board) {
    return (
      <section className="ic-d4h-empty">
        <p>No status boards yet.</p>
        <button type="button" className="ic-btn-add" onClick={() => setBoardId(addStatusBoard())}>
          Create status board
        </button>
      </section>
    );
  }

  return (
    <section className="ic-status-boards">
      <header className="ic-d4h-header">
        <div className="ic-d4h-header__row">
          <label className="ic-d4h-field-inline">
            <span>Board</span>
            <select value={board.id} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <InlineInput
            value={board.name}
            onChange={(v) => updateStatusBoard(board.id, { name: v })}
          />
          <button
            type="button"
            className="ic-btn-secondary"
            onClick={() => {
              const id = addStatusBoard();
              setBoardId(id);
            }}
          >
            + Board
          </button>
        </div>
        <p className="ic-d4h-header__sub">
          Status board — track operational items across columns. Drag workflow via
          column selector on each card.
        </p>
      </header>

      <div className="ic-status-boards__columns">
        {board.columns.map((col) => {
          const items = board.items.filter((i) => i.columnId === col.id);
          return (
            <article key={col.id} className="ic-status-column">
              <header
                className="ic-status-column__head"
                style={{ borderTopColor: col.color ?? "var(--ic-border)" }}
              >
                <h3>{col.title}</h3>
                <span className="ic-status-column__count">{items.length}</span>
                <button
                  type="button"
                  className="ic-status-column__add"
                  onClick={() => addStatusBoardItem(board.id, col.id)}
                  aria-label={`Add item to ${col.title}`}
                >
                  +
                </button>
              </header>
              <ul className="ic-status-column__list">
                {items.map((item) => (
                  <li key={item.id} className="ic-status-card">
                    <InlineInput
                      value={item.title}
                      onChange={(v) =>
                        updateStatusBoardItem(board.id, item.id, { title: v })
                      }
                    />
                    <textarea
                      className="ic-status-card__notes"
                      placeholder="Notes"
                      rows={2}
                      value={item.notes}
                      onChange={(e) =>
                        updateStatusBoardItem(board.id, item.id, { notes: e.target.value })
                      }
                    />
                    <div className="ic-status-card__meta">
                      <select
                        value={item.columnId}
                        onChange={(e) =>
                          moveStatusBoardItem(board.id, item.id, e.target.value)
                        }
                        aria-label="Column"
                      >
                        {board.columns.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                      <select
                        value={item.priority}
                        onChange={(e) =>
                          updateStatusBoardItem(board.id, item.id, {
                            priority: e.target.value as typeof item.priority,
                          })
                        }
                      >
                        <option value="low">Low</option>
                        <option value="normal">Normal</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                      <button
                        type="button"
                        className="ic-status-card__remove"
                        onClick={() => removeStatusBoardItem(board.id, item.id)}
                        aria-label="Remove"
                      >
                        ×
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
