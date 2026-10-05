"use client";

import { useIncidentStore } from "@/context/EventContext";
import type { ActivationLevel } from "@/lib/incident/types";

export const INCIDENT_STAGES: {
  value: ActivationLevel;
  label: string;
  desc: string;
}[] = [
  { value: "planning", label: "Planning", desc: "Preparing the response — standing up the team" },
  { value: "activated", label: "Activated", desc: "Full command posture — response underway" },
  { value: "closed", label: "Resolved", desc: "Demobilised — incident complete" },
];

/**
 * Segmented control for the incident's operational stage (planning → activated → resolved).
 * Backed by `situation.activationLevel`; used on the dashboard and the Situation screen.
 */
export function StageToggle({ compact = false }: { compact?: boolean }) {
  const level = useIncidentStore((s) => s.situation.activationLevel);
  const setActivationLevel = useIncidentStore((s) => s.setActivationLevel);

  return (
    <div
      className={`ic-stage-toggle${compact ? " ic-stage-toggle--compact" : ""}`}
      role="group"
      aria-label="Incident stage"
    >
      {INCIDENT_STAGES.map((s) => {
        const active = level === s.value;
        return (
          <button
            key={s.value}
            type="button"
            className={`ic-stage-toggle__btn ic-stage-toggle__btn--${s.value}${active ? " ic-stage-toggle__btn--active" : ""}`}
            onClick={() => setActivationLevel(s.value)}
            aria-pressed={active}
            title={s.desc}
          >
            <span className="ic-stage-toggle__dot" aria-hidden />
            <span className="ic-stage-toggle__label">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
