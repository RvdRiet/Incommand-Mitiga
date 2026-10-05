"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import { StageToggle } from "@/components/dashboard/StageToggle";
import { WeatherWidget } from "@/components/dashboard/WeatherWidget";
import { useSession } from "next-auth/react";

import { useSituationReport } from "../useSituationReport";
import {
  IconActivity,
  IconCheckSquare,
  IconHome,
  IconPackage,
  IconRoad,
  IconTent,
  IconTriangleAlert,
  IconUsers,
  IconZap,
} from "@/components/dashboard/icons";
import { IconRadio, IconBell, IconBoxes } from "@/components/dashboard/icons";
import { useEventId, useIncidentStore } from "@/context/EventContext";
import { useNow } from "@/lib/devices/presence";
import { dashboardStats } from "@/lib/incident/stats";
import {
  DEFAULT_INVENTORY_REMINDER_DAYS,
  inventorySummary,
} from "@/lib/incident/inventory";
import { annotationsToFeatureCollection, DEFAULT_ANNOTATION_COLOR } from "@/lib/maps/map-annotations";
import { buildCopFeatures, COP_LAYERS } from "@/lib/maps/cop-features";
import { mergeFeatureCollections } from "@/lib/maps/geo-utils";
import { moduleHref } from "@/lib/navigation/modules";

const MapCanvasLazy = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => <p className="ic-empty-hint">Loading map…</p>,
});

type Tone = "critical" | "warn" | "ok" | "neutral";

function formatElapsed(startIso: string, now: number): string {
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return "—";
  const ms = Math.max(0, now - start);
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatRadius(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

function timeAgo(iso: string, now: number): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const ACTIVATION_LABEL: Record<string, string> = {
  planning: "Planning",
  activated: "Activated",
  closed: "Resolved",
};

export function DashboardHomeView() {
  const eventId = useEventId();
  const state = useIncidentStore((s) => s);
  const now = useNow(30_000);
  const report = useSituationReport();
  const { data: session } = useSession();
  const stats = dashboardStats(state);
  const inv = inventorySummary(
    state.inventory,
    now,
    state.settings.inventoryReminderDays ?? DEFAULT_INVENTORY_REMINDER_DAYS,
  );

  const { situation, fieldUnits, distressEvents, shelters } = state;
  const hasCoords = situation.lat != null && situation.lng != null;
  const mapCenter = hasCoords
    ? ([situation.lng!, situation.lat!] as [number, number])
    : null;

  // ── Live operational picture derived from the whole incident state ──────────
  const derived = useMemo(() => {
    const activeDistress = distressEvents.filter(
      (d) => d.status === "active" || d.status === "acknowledged",
    );
    const offlineUnits = fieldUnits.filter((u) => u.status === "offline").length;
    const liveUnits = fieldUnits.length - offlineUnits;
    const bedsTotal = shelters.reduce((n, s) => n + Math.max(0, s.capacity), 0);
    const bedsUsed = shelters.reduce((n, s) => n + Math.max(0, s.occupancy), 0);
    const sheltersOver = shelters.filter((s) => s.capacity > 0 && s.occupancy > s.capacity).length;
    const openTasks = stats.taskCounts.not_started + stats.taskCounts.in_progress;
    const totalTasks =
      openTasks + stats.taskCounts.complete + stats.taskCounts.canceled;
    const pendingRequests =
      stats.resourceRequests.requested +
      stats.resourceRequests.enroute +
      stats.resourceRequests.assigned;
    return {
      activeDistress,
      offlineUnits,
      liveUnits,
      bedsTotal,
      bedsUsed,
      sheltersOver,
      openTasks,
      totalTasks,
      pendingRequests,
    };
  }, [distressEvents, fieldUnits, shelters, stats]);

  // Full common-operating-picture map overlays: every locatable record + drawn shapes.
  const overlays = useMemo(() => {
    const cop = buildCopFeatures(
      {
        fieldUnits,
        personnel: state.personnel,
        shelters,
        damages: state.damages,
        roadDamages: state.roadDamages,
        resourceRequests: state.resourceRequests,
      },
      new Set(COP_LAYERS.map((l) => l.key)),
    );
    return mergeFeatureCollections(cop, annotationsToFeatureCollection(state.mapAnnotations));
  }, [fieldUnits, state.personnel, shelters, state.damages, state.roadDamages, state.resourceRequests, state.mapAnnotations]);

  const distressPoint = useMemo(() => {
    const d = derived.activeDistress.find((x) => x.lat != null && x.lng != null);
    return d ? ([d.lng!, d.lat!] as [number, number]) : null;
  }, [derived.activeDistress]);

  // Alerts: only surface things that actually need command attention right now.
  const alerts: { tone: Tone; icon: ReactNode; label: string; href: string }[] = [];
  if (derived.activeDistress.length)
    alerts.push({
      tone: "critical",
      icon: <IconBell />,
      label: `${derived.activeDistress.length} active distress ${derived.activeDistress.length === 1 ? "signal" : "signals"}`,
      href: moduleHref(eventId, "comms"),
    });
  if (derived.sheltersOver)
    alerts.push({
      tone: "critical",
      icon: <IconTent />,
      label: `${derived.sheltersOver} shelter${derived.sheltersOver === 1 ? "" : "s"} over capacity`,
      href: moduleHref(eventId, "shelters"),
    });
  if (stats.severeDamage)
    alerts.push({
      tone: "warn",
      icon: <IconTriangleAlert />,
      label: `${stats.severeDamage} severe damage ${stats.severeDamage === 1 ? "site" : "sites"}`,
      href: moduleHref(eventId, "damage-assessment"),
    });
  if (stats.roadClosed)
    alerts.push({
      tone: "warn",
      icon: <IconRoad />,
      label: `${stats.roadClosed} road${stats.roadClosed === 1 ? "" : "s"} closed`,
      href: moduleHref(eventId, "road-damages"),
    });
  if (derived.offlineUnits)
    alerts.push({
      tone: "warn",
      icon: <IconRadio />,
      label: `${derived.offlineUnits} field unit${derived.offlineUnits === 1 ? "" : "s"} offline`,
      href: moduleHref(eventId, "comms"),
    });
  if (stats.electricityOutages > 0)
    alerts.push({
      tone: "warn",
      icon: <IconZap />,
      label: `${stats.electricityOutages.toLocaleString()} without power`,
      href: moduleHref(eventId, "utilities-electricity"),
    });

  const kpis = [
    { label: "Personnel online", value: stats.personnelOnline, sub: `of ${stats.personnelTotal}`, tone: "neutral" as Tone },
    {
      label: "Units live",
      value: derived.liveUnits,
      sub: derived.offlineUnits ? `${derived.offlineUnits} offline` : "all up",
      tone: (derived.offlineUnits ? "warn" : "ok") as Tone,
    },
    { label: "Open tasks", value: derived.openTasks, sub: `of ${derived.totalTasks}`, tone: "neutral" as Tone },
    {
      label: "Requests pending",
      value: derived.pendingRequests,
      sub: `${stats.resourceRequests.ready} ready`,
      tone: (derived.pendingRequests ? "warn" : "ok") as Tone,
    },
    {
      label: "Active distress",
      value: derived.activeDistress.length,
      sub: derived.activeDistress.length ? "responding" : "clear",
      tone: (derived.activeDistress.length ? "critical" : "ok") as Tone,
    },
  ];

  return (
    <div className="ic-cop">
      {/* ── Command status bar ── */}
      <header className="ic-cop__status">
        <div className="ic-cop__ident">
          <span className={`ic-cop__activation ic-cop__activation--${situation.activationLevel}`}>
            {ACTIVATION_LABEL[situation.activationLevel] ?? situation.activationLevel}
          </span>
          <div className="ic-cop__ident-text">
            <h1 className="ic-cop__name">{situation.name || "Untitled incident"}</h1>
            <p className="ic-cop__where">
              {situation.location || "No location set"}
              {situation.startDate ? (
                <>
                  {" · "}
                  <span title="Time since incident start">
                    {formatElapsed(situation.startDate, now)} elapsed
                  </span>
                </>
              ) : null}
              {stats.operationalPeriodCount > 0 ? (
                <>
                  {" · "}
                  {stats.operationalPeriodCount} op period
                  {stats.operationalPeriodCount === 1 ? "" : "s"}
                </>
              ) : null}
            </p>
          </div>
          <div className="ic-cop__stage">
            <StageToggle />
            <button
              type="button"
              className="ic-cop__sitrep-btn"
              disabled={report.busy}
              title="Export the whole situation as a PDF (map, weather, status, personnel, forms)"
              onClick={() => report.run(session?.user?.name || session?.user?.email || "Operator")}
            >
              {report.busy ? "Generating…" : "Export SITREP"}
            </button>
          </div>
        </div>
        <div className="ic-cop__kpis">
          {kpis.map((k) => (
            <div key={k.label} className={`ic-cop__kpi ic-cop__kpi--${k.tone}`}>
              <span className="ic-cop__kpi-value">{k.value}</span>
              <span className="ic-cop__kpi-label">{k.label}</span>
              <span className="ic-cop__kpi-sub">{k.sub}</span>
            </div>
          ))}
        </div>
      </header>

      {report.notice ? (
        <p className="ic-cop__sitrep-notice" role="status">
          {report.notice}
        </p>
      ) : null}

      {/* ── Alert strip (attention required) ── */}
      {alerts.length > 0 ? (
        <div className="ic-cop__alerts" role="alert">
          <span className="ic-cop__alerts-label">Needs attention</span>
          {alerts.map((a, i) => (
            <Link key={i} href={a.href} className={`ic-cop__alert ic-cop__alert--${a.tone}`}>
              <span className="ic-cop__alert-icon">{a.icon}</span>
              {a.label}
            </Link>
          ))}
        </div>
      ) : (
        <div className="ic-cop__allclear">
          <span className="ic-cop__allclear-dot" aria-hidden />
          All clear — no distress signals, over-capacity shelters, or closed roads.
        </div>
      )}

      {/* ── The picture: map (where) + live feed (what) ── */}
      <div className="ic-cop__main">
        <section className="ic-cop__map-wrap" aria-label="Common operating picture">
          <div className="ic-cop__map-head">
            <h2>
              <IconActivity /> Common operating picture
            </h2>
            <Link href={moduleHref(eventId, "map")} className="ic-accent-link">
              Full map →
            </Link>
          </div>
          <div className="ic-cop__map">
            {hasCoords ? (
              <MapCanvasLazy
                center={mapCenter}
                zoom={12}
                incidentMarker={mapCenter}
                distressPoint={distressPoint}
                overlays={overlays}
              />
            ) : (
              <div className="ic-cop__map-empty">
                <IconTriangleAlert />
                <p>No incident location set yet.</p>
                <Link href={moduleHref(eventId, "situation")} className="ic-accent-link">
                  Set the location in Situation →
                </Link>
              </div>
            )}
          </div>
          <div className="ic-cop__legend">
            {COP_LAYERS.map((l) => (
              <span key={l.key} className="ic-cop__legend-item">
                <span className="ic-cop__legend-dot" style={{ background: l.color }} aria-hidden />
                {l.label}
              </span>
            ))}
          </div>
          {state.mapAnnotations.length > 0 ? (
            <div className="ic-cop__zones">
              <span className="ic-cop__zones-label">Zones &amp; areas</span>
              {state.mapAnnotations.map((a) => (
                <Link
                  key={a.id}
                  href={moduleHref(eventId, "map")}
                  className="ic-cop__zone"
                  title={a.kind === "circle" && a.radiusMeters ? `${Math.round(a.radiusMeters)} m radius` : a.kind}
                >
                  <span
                    className="ic-cop__zone-dot"
                    style={{ background: a.color ?? DEFAULT_ANNOTATION_COLOR }}
                    aria-hidden
                  />
                  <span className="ic-cop__zone-name">{a.name || "Unnamed"}</span>
                  {a.kind === "circle" && a.radiusMeters ? (
                    <span className="ic-cop__zone-meta">{formatRadius(a.radiusMeters)}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        <section className="ic-cop__feed" aria-label="Live activity">
          <div className="ic-cop__feed-head">
            <h2>
              <IconActivity /> Live activity
            </h2>
            <Link href={moduleHref(eventId, "logs")} className="ic-accent-link">
              Log →
            </Link>
          </div>
          {state.logs.length === 0 ? (
            <p className="ic-empty-hint">No activity logged yet.</p>
          ) : (
            <ul className="ic-cop__feed-list">
              {state.logs.slice(0, 14).map((e) => (
                <li key={e.id} className="ic-cop__feed-item">
                  <span className="ic-cop__feed-time">{timeAgo(e.createdAt, now)}</span>
                  <span className="ic-cop__feed-body">
                    <strong>{e.author}</strong> {e.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="ic-cop__feed-weather">
            <WeatherWidget lat={situation.lat ?? null} lng={situation.lng ?? null} />
          </div>
        </section>
      </div>

      {/* ── Status deck: every angle, grouped + severity-coded ── */}
      <section className="ic-cop__deck" aria-label="Status by area">
        <MetricTile
          href={moduleHref(eventId, "roles")}
          icon={<IconUsers />}
          title="Personnel"
          value={stats.personnelOnline}
          unit={`/ ${stats.personnelTotal} online`}
          tone="neutral"
          rows={[
            { label: "Total", value: stats.personnelTotal },
            { label: "Online", value: stats.personnelOnline },
          ]}
        />
        <MetricTile
          href={moduleHref(eventId, "comms")}
          icon={<IconRadio />}
          title="Field units"
          value={derived.liveUnits}
          unit={`/ ${fieldUnits.length} live`}
          tone={derived.offlineUnits ? "warn" : "ok"}
          rows={[
            { label: "Live", value: derived.liveUnits, tone: "ok" },
            { label: "Offline", value: derived.offlineUnits, tone: derived.offlineUnits ? "warn" : "neutral" },
          ]}
        />
        <MetricTile
          href={moduleHref(eventId, "tasks")}
          icon={<IconCheckSquare />}
          title="Tasks"
          value={derived.openTasks}
          unit="open"
          tone="neutral"
          progress={derived.totalTasks ? stats.taskCounts.complete / derived.totalTasks : 0}
          progressLabel={`${stats.taskCounts.complete}/${derived.totalTasks} done`}
          rows={[
            { label: "In progress", value: stats.taskCounts.in_progress },
            { label: "Not started", value: stats.taskCounts.not_started },
          ]}
        />
        <MetricTile
          href={moduleHref(eventId, "resource-requests")}
          icon={<IconPackage />}
          title="Resource requests"
          value={derived.pendingRequests}
          unit="pending"
          tone={derived.pendingRequests ? "warn" : "ok"}
          rows={[
            { label: "Requested", value: stats.resourceRequests.requested },
            { label: "Enroute", value: stats.resourceRequests.enroute },
            { label: "Assigned", value: stats.resourceRequests.assigned },
            { label: "Ready", value: stats.resourceRequests.ready, tone: "ok" },
          ]}
        />
        <MetricTile
          href={moduleHref(eventId, "shelters")}
          icon={<IconTent />}
          title="Shelters"
          value={derived.bedsUsed}
          unit={derived.bedsTotal ? `/ ${derived.bedsTotal} beds` : "occupants"}
          tone={derived.sheltersOver ? "critical" : "ok"}
          progress={derived.bedsTotal ? derived.bedsUsed / derived.bedsTotal : 0}
          progressLabel={
            derived.bedsTotal
              ? `${Math.round((derived.bedsUsed / derived.bedsTotal) * 100)}% full`
              : `${shelters.length} shelters`
          }
          rows={[
            { label: "Shelters", value: shelters.length },
            { label: "Over capacity", value: derived.sheltersOver, tone: derived.sheltersOver ? "critical" : "neutral" },
          ]}
        />
        <MetricTile
          href={moduleHref(eventId, "damage-assessment")}
          icon={<IconTriangleAlert />}
          title="Damage"
          value={stats.severeDamage + stats.minorDamage}
          unit="sites"
          tone={stats.severeDamage ? "critical" : stats.minorDamage ? "warn" : "ok"}
          rows={[
            { label: "Severe", value: stats.severeDamage, tone: stats.severeDamage ? "critical" : "neutral" },
            { label: "Minor", value: stats.minorDamage },
          ]}
        />
        <MetricTile
          href={moduleHref(eventId, "road-damages")}
          icon={<IconRoad />}
          title="Roads"
          value={stats.roadClosed}
          unit="closed"
          tone={stats.roadClosed ? "warn" : "ok"}
          rows={[
            { label: "Closed", value: stats.roadClosed, tone: stats.roadClosed ? "warn" : "neutral" },
            { label: "One lane", value: stats.roadOneLane },
            { label: "Open", value: stats.roadOpen, tone: "ok" },
          ]}
        />
        <MetricTile
          href={moduleHref(eventId, "utilities-electricity")}
          icon={<IconZap />}
          title="Power"
          value={stats.electricityOutages.toLocaleString()}
          unit="without power"
          tone={stats.electricityOutages ? "warn" : "ok"}
        />
        <MetricTile
          href={moduleHref(eventId, "residents")}
          icon={<IconHome />}
          title="Residents"
          value={stats.estimatedAffectedTotal.toLocaleString()}
          unit="affected"
          tone="neutral"
          rows={[
            { label: "Areas", value: stats.residentAreasTotal },
            { label: "Population", value: stats.censusPopulationTotal.toLocaleString() },
          ]}
        />
        <MetricTile
          href={moduleHref(eventId, "inventory")}
          icon={<IconBoxes />}
          title="Inventory"
          value={inv.total}
          unit="line items"
          tone={inv.lowOut || inv.expiryFlagged ? "warn" : "ok"}
          rows={[
            { label: "Low / out", value: inv.lowOut, tone: inv.lowOut ? "warn" : "neutral" },
            { label: "Expiring", value: inv.expiryFlagged, tone: inv.expiryFlagged ? "warn" : "neutral" },
            { label: "Service due", value: inv.maintFlagged },
          ]}
        />
      </section>
    </div>
  );
}

/* ── A single status tile: headline value + severity tone + optional progress + breakdown rows ── */
function MetricTile({
  href,
  icon,
  title,
  value,
  unit,
  tone,
  progress,
  progressLabel,
  rows,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  value: ReactNode;
  unit?: string;
  tone: Tone;
  progress?: number;
  progressLabel?: string;
  rows?: { label: string; value: ReactNode; tone?: Tone }[];
}) {
  return (
    <Link href={href} className={`ic-cop__tile ic-cop__tile--${tone}`}>
      <div className="ic-cop__tile-head">
        <span className="ic-cop__tile-icon">{icon}</span>
        <span className="ic-cop__tile-title">{title}</span>
      </div>
      <div className="ic-cop__tile-headline">
        <span className="ic-cop__tile-value">{value}</span>
        {unit ? <span className="ic-cop__tile-unit">{unit}</span> : null}
      </div>
      {progress != null ? (
        <div className="ic-cop__tile-progress" title={progressLabel}>
          <span
            className="ic-cop__tile-progress-fill"
            style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }}
          />
        </div>
      ) : null}
      {progressLabel && progress != null ? (
        <span className="ic-cop__tile-progress-label">{progressLabel}</span>
      ) : null}
      {rows && rows.length ? (
        <dl className="ic-cop__tile-rows">
          {rows.map((r) => (
            <div key={r.label} className={`ic-cop__tile-row${r.tone ? ` ic-cop__tile-row--${r.tone}` : ""}`}>
              <dt>{r.label}</dt>
              <dd>{r.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Link>
  );
}
