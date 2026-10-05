"use client";

import { useMemo } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { useNow } from "@/lib/devices/presence";
import { dashboardStats } from "@/lib/incident/stats";
import {
  crewReadinessSummary,
  type ReadinessData,
} from "@/lib/incident/readiness";
import {
  DEFAULT_INVENTORY_REMINDER_DAYS,
  inventorySummary,
} from "@/lib/incident/inventory";
import { IconAlertTriangle } from "@/components/ui/icons";

type Posture = "green" | "amber" | "red";

const POSTURE_LABEL: Record<Posture, string> = {
  green: "Operational",
  amber: "Strained",
  red: "Critical",
};

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/**
 * Analytics — the incident-wide read-out that fuses every module into one command
 * picture: crew readiness (fatigue + certs + assignment), task/resource progress,
 * population impact and infrastructure status. This is the reporting seam on top of
 * the same readiness engine Roles and Personnel use, so the numbers agree everywhere.
 */
export function AnalyticsView() {
  const state = useIncidentStore((s) => s);
  const settings = useIncidentStore((s) => s.settings);
  const now = useNow(60000);

  const stats = dashboardStats(state);

  const crew = useMemo(() => {
    const data: ReadinessData = {
      shifts: state.shifts,
      certifications: state.certifications,
      roleGroups: state.roleGroups,
      fieldUnits: state.fieldUnits,
    };
    return crewReadinessSummary(
      state.personnel,
      data,
      {
        maxShiftHours: settings.maxShiftHours ?? 12,
        maxOnDuty24h: settings.maxOnDuty24h ?? 16,
        minRestHours: settings.minRestHours ?? 8,
      },
      settings.certReminderDays ?? 30,
      now,
    );
  }, [
    state.shifts,
    state.certifications,
    state.roleGroups,
    state.fieldUnits,
    state.personnel,
    settings,
    now,
  ]);

  const inv = useMemo(
    () =>
      inventorySummary(
        state.inventory,
        now,
        settings.inventoryReminderDays ?? DEFAULT_INVENTORY_REMINDER_DAYS,
      ),
    [state.inventory, settings.inventoryReminderDays, now],
  );

  const tasksTotal =
    stats.taskCounts.complete +
    stats.taskCounts.in_progress +
    stats.taskCounts.not_started +
    stats.taskCounts.canceled;
  const tasksDone = stats.taskCounts.complete;
  const openResources = stats.resourceRequests.requested + stats.resourceRequests.enroute;
  const renewalsDue = crew.expiredCerts + crew.expiringCerts;

  // Overall posture: worst signal wins. A blocked crew member or an unmet severe
  // situation pushes to critical; softer strain (caution crew, open requests) to amber.
  const posture: Posture = (() => {
    if (crew.blocked > 0 || stats.severeDamage > 0 || stats.roadClosed > 0) return "red";
    if (
      crew.caution > 0 ||
      openResources > 0 ||
      renewalsDue > 0 ||
      stats.taskCounts.not_started > 0 ||
      inv.attention > 0
    )
      return "amber";
    return "green";
  })();

  const plur = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const postureNotes: string[] = [];
  if (crew.blocked > 0) postureNotes.push(`${plur(crew.blocked, "crew member", "crew")} not deployable`);
  if (stats.severeDamage > 0) postureNotes.push(`${plur(stats.severeDamage, "severe damage site", "severe damage sites")}`);
  if (stats.roadClosed > 0) postureNotes.push(`${plur(stats.roadClosed, "road closed", "roads closed")}`);
  if (crew.caution > 0) postureNotes.push(`${plur(crew.caution, "crew member", "crew")} flagged`);
  if (openResources > 0) postureNotes.push(`${plur(openResources, "resource request", "resource requests")} open`);
  if (renewalsDue > 0) postureNotes.push(`${plur(renewalsDue, "cert needs", "certs need")} renewal`);
  if (inv.lowOut > 0) postureNotes.push(`${plur(inv.lowOut, "stock item low/out", "stock items low/out")}`);
  if (inv.expiryFlagged > 0) postureNotes.push(`${plur(inv.expiryFlagged, "supply item expiring", "supply items expiring")}`);
  if (inv.maintFlagged > 0) postureNotes.push(`${plur(inv.maintFlagged, "gear check due", "gear checks due")}`);

  return (
    <section className="ic-analytics">
      <header className="ic-analytics__head">
        <div>
          <h2 className="ic-page-heading" style={{ padding: 0, border: 0 }}>
            Analytics &amp; reporting
          </h2>
          <p className="ic-analytics__sub">
            One command picture across every module — crew readiness, operational progress,
            population impact and infrastructure — refreshed live.
          </p>
        </div>
      </header>

      {/* Command posture banner */}
      <div className={`ic-posture ic-posture--${posture}`}>
        <div className="ic-posture__badge">
          <span className="ic-posture__dot" />
          <div>
            <span className="ic-posture__label">Command posture</span>
            <strong className="ic-posture__value">{POSTURE_LABEL[posture]}</strong>
          </div>
        </div>
        <div className="ic-posture__notes">
          {postureNotes.length > 0 ? (
            postureNotes.map((n) => (
              <span key={n} className="ic-posture__note">
                <IconAlertTriangle size={12} /> {n}
              </span>
            ))
          ) : (
            <span className="ic-posture__note ic-posture__note--clear">
              No active flags — all tracked signals nominal.
            </span>
          )}
        </div>
      </div>

      <div className="ic-analytics__grid">
        {/* Crew readiness */}
        <div className="ic-analytics-card">
          <h3 className="ic-analytics-card__title">Crew readiness</h3>
          <div className="ic-analytics-card__bar">
            <span
              className="ic-readiness-bar ic-readiness-bar--ready"
              style={{ flexGrow: crew.ready || 0.001 }}
              title={`${crew.ready} ready`}
            />
            <span
              className="ic-readiness-bar ic-readiness-bar--caution"
              style={{ flexGrow: crew.caution || 0.001 }}
              title={`${crew.caution} caution`}
            />
            <span
              className="ic-readiness-bar ic-readiness-bar--blocked"
              style={{ flexGrow: crew.blocked || 0.001 }}
              title={`${crew.blocked} not deployable`}
            />
          </div>
          <div className="ic-metric-row">
            <Metric label="Ready" value={crew.ready} tone="ready" />
            <Metric label="Caution" value={crew.caution} tone="caution" />
            <Metric label="Not deployable" value={crew.blocked} tone="blocked" />
          </div>
          <div className="ic-metric-row ic-metric-row--sub">
            <Metric label="On duty now" value={crew.onDuty} />
            <Metric label="Fatigue flags" value={crew.fatigued} />
            <Metric label="Total crew" value={crew.total} />
          </div>
        </div>

        {/* Certifications */}
        <div className="ic-analytics-card">
          <h3 className="ic-analytics-card__title">Qualifications</h3>
          <div className="ic-metric-row">
            <Metric label="Expired" value={crew.expiredCerts} tone={crew.expiredCerts ? "blocked" : undefined} />
            <Metric label="Expiring" value={crew.expiringCerts} tone={crew.expiringCerts ? "caution" : undefined} />
            <Metric label="Renewals due" value={renewalsDue} />
          </div>
          <p className="ic-analytics-card__foot">
            {renewalsDue > 0
              ? "Action renewals before deploying affected crew."
              : "All tracked certifications current."}
          </p>
        </div>

        {/* Task progress */}
        <div className="ic-analytics-card">
          <h3 className="ic-analytics-card__title">Task progress</h3>
          <div className="ic-analytics-card__bar">
            <span
              className="ic-readiness-bar ic-readiness-bar--ready"
              style={{ flexGrow: stats.taskCounts.complete || 0.001 }}
              title={`${stats.taskCounts.complete} complete`}
            />
            <span
              className="ic-readiness-bar ic-readiness-bar--caution"
              style={{ flexGrow: stats.taskCounts.in_progress || 0.001 }}
              title={`${stats.taskCounts.in_progress} in progress`}
            />
            <span
              className="ic-readiness-bar ic-readiness-bar--idle"
              style={{ flexGrow: stats.taskCounts.not_started || 0.001 }}
              title={`${stats.taskCounts.not_started} not started`}
            />
          </div>
          <div className="ic-metric-row">
            <Metric label="Complete" value={stats.taskCounts.complete} tone="ready" />
            <Metric label="In progress" value={stats.taskCounts.in_progress} />
            <Metric label="Not started" value={stats.taskCounts.not_started} />
          </div>
          <p className="ic-analytics-card__foot">
            {tasksTotal > 0 ? `${pct(tasksDone, tasksTotal)}% of ${tasksTotal} tasks complete` : "No tasks logged yet."}
          </p>
        </div>

        {/* Resource requests */}
        <div className="ic-analytics-card">
          <h3 className="ic-analytics-card__title">Resource requests</h3>
          <div className="ic-metric-row">
            <Metric label="Requested" value={stats.resourceRequests.requested} tone={stats.resourceRequests.requested ? "caution" : undefined} />
            <Metric label="En route" value={stats.resourceRequests.enroute} />
            <Metric label="Assigned" value={stats.resourceRequests.assigned} />
            <Metric label="Ready" value={stats.resourceRequests.ready} tone="ready" />
          </div>
          <p className="ic-analytics-card__foot">
            {openResources > 0 ? `${openResources} still to fulfil` : "All requests fulfilled."}
          </p>
        </div>

        {/* Inventory & equipment */}
        <div className="ic-analytics-card">
          <h3 className="ic-analytics-card__title">Inventory &amp; equipment</h3>
          <div className="ic-metric-row">
            <Metric
              label="Low / out"
              value={inv.lowOut}
              tone={inv.out ? "blocked" : inv.low ? "caution" : undefined}
            />
            <Metric
              label="Expiring"
              value={inv.expiryFlagged}
              tone={inv.expired ? "blocked" : inv.expiring ? "caution" : undefined}
            />
            <Metric
              label="Service due"
              value={inv.maintFlagged}
              tone={inv.maintOverdue ? "blocked" : inv.maintDue ? "caution" : undefined}
            />
          </div>
          <p className="ic-analytics-card__foot">
            {inv.total === 0
              ? "No inventory logged yet."
              : inv.attention > 0
                ? `${inv.attention} of ${inv.total} items need attention.`
                : `All ${inv.total} items stocked and in date.`}
          </p>
        </div>

        {/* Population impact */}
        <div className="ic-analytics-card">
          <h3 className="ic-analytics-card__title">Population impact</h3>
          <div className="ic-metric-row">
            <Metric label="Est. affected" value={stats.estimatedAffectedTotal.toLocaleString()} />
            <Metric label="Census pop." value={stats.censusPopulationTotal.toLocaleString()} />
            <Metric label="Impact areas" value={stats.residentAreasTotal} />
          </div>
          <div className="ic-metric-row ic-metric-row--sub">
            <Metric label="Shelters" value={stats.sheltersTotal} />
            <Metric label="Sheltered" value={stats.shelterOccupancy.toLocaleString()} />
            <Metric label="Without power" value={stats.electricityOutages.toLocaleString()} tone={stats.electricityOutages ? "caution" : undefined} />
          </div>
        </div>

        {/* Infrastructure */}
        <div className="ic-analytics-card">
          <h3 className="ic-analytics-card__title">Infrastructure</h3>
          <div className="ic-metric-row">
            <Metric label="Severe damage" value={stats.severeDamage} tone={stats.severeDamage ? "blocked" : undefined} />
            <Metric label="Minor damage" value={stats.minorDamage} />
          </div>
          <div className="ic-metric-row ic-metric-row--sub">
            <Metric label="Roads closed" value={stats.roadClosed} tone={stats.roadClosed ? "blocked" : undefined} />
            <Metric label="One lane" value={stats.roadOneLane} tone={stats.roadOneLane ? "caution" : undefined} />
            <Metric label="Open" value={stats.roadOpen} tone="ready" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ready" | "caution" | "blocked";
}) {
  return (
    <div className={`ic-metric${tone ? ` ic-metric--${tone}` : ""}`}>
      <span className="ic-metric__value">{value}</span>
      <span className="ic-metric__label">{label}</span>
    </div>
  );
}
