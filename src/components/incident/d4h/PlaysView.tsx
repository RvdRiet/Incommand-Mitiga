"use client";

import { useState } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { PLAY_TEMPLATES } from "@/lib/incident/plays-catalog";

export function PlaysView() {
  const startPlay = useIncidentStore((s) => s.startPlay);
  const [category, setCategory] = useState<string>("all");
  const [started, setStarted] = useState<string | null>(null);

  const categories = ["all", ...new Set(PLAY_TEMPLATES.map((p) => p.category))];
  const filtered =
    category === "all"
      ? PLAY_TEMPLATES
      : PLAY_TEMPLATES.filter((p) => p.category === category);

  return (
    <section className="ic-plays">
      <header className="ic-d4h-header">
        <h2 className="ic-d4h-header__title">Operational plays</h2>
        <p className="ic-d4h-header__sub">
          Operational playbooks — one click creates a task list with checklists and logs the
          activation. Expand with your own plays over time.
        </p>
        <div className="ic-d4h-tabs">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              className={category === c ? "ic-d4h-tabs__active" : ""}
              onClick={() => setCategory(c)}
            >
              {c === "all" ? "All" : c}
            </button>
          ))}
        </div>
      </header>

      {started ? (
        <p className="ic-d4h-banner" role="status">
          Play applied — open <strong>Tasks</strong> to work the checklist.
        </p>
      ) : null}

      <ul className="ic-plays__grid">
        {filtered.map((play) => (
          <li key={play.id} className="ic-play-card">
            <span className="ic-play-card__category">{play.category}</span>
            <h3>{play.name}</h3>
            <p>{play.description}</p>
            <ol className="ic-play-card__steps">
              {play.steps.map((step) => (
                <li key={step.title}>
                  <strong>{step.title}</strong>
                  <span>{step.description}</span>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="ic-btn-add"
              onClick={() => {
                if (startPlay(play.id)) setStarted(play.name);
              }}
            >
              Start play
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
