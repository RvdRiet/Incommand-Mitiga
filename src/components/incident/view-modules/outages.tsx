"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import MapCanvas, {
  type MapCanvasHandle,
  type MapDrawMode,
  type MapDrawResult,
} from "@/components/map/MapCanvas";
import { useEventId, useIncidentStore } from "@/context/EventContext";
import type { OutageStatus, OutageType } from "@/lib/incident/types";
import type { LoadSheddingSnapshot } from "@/lib/loadshedding/types";
import { circleRing, OUTAGE_TYPES, outagesToFeatures } from "@/lib/maps/outage-features";
import { IconBolt, IconDroplet, IconPin } from "@/components/ui/icons";

const TYPE_ICON: Record<OutageType, React.ComponentType<{ size?: number }>> = {
  electricity: IconBolt,
  water: IconDroplet,
};

function OutageTypeIcon({ type, size = 14 }: { type: OutageType; size?: number }) {
  const Icon = TYPE_ICON[type];
  return <Icon size={size} />;
}
const STATUSES: OutageStatus[] = ["reported", "confirmed", "restoring", "resolved"];

function fmtEta(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Convert an ISO string to the value a datetime-local input expects (local time, no seconds). */
function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function OutageMapView() {
  const eventId = useEventId();
  const situation = useIncidentStore((s) => s.situation);
  const outages = useIncidentStore((s) => s.outages);
  const addOutage = useIncidentStore((s) => s.addOutage);
  const updateOutage = useIncidentStore((s) => s.updateOutage);
  const removeOutage = useIncidentStore((s) => s.removeOutage);
  const mapRef = useRef<MapCanvasHandle>(null);

  const [enabled, setEnabled] = useState<Set<OutageType>>(new Set(["electricity", "water"]));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [ls, setLs] = useState<LoadSheddingSnapshot | null>(null);
  const [lsState, setLsState] = useState<"idle" | "loading" | "error">("idle");
  // Interactive draw (same live circle as the map's Radius tool): click centre → move to size → click to lock → Confirm.
  const [drawType, setDrawType] = useState<OutageType | null>(null);
  const [circleCenterSet, setCircleCenterSet] = useState(false);
  const [circleRadiusM, setCircleRadiusM] = useState(0);

  const center = useMemo<[number, number] | null>(
    () => (situation.lat != null && situation.lng != null ? [situation.lng, situation.lat] : null),
    [situation.lat, situation.lng],
  );

  const selected = outages.find((o) => o.id === selectedId) ?? null;

  const counts = useMemo(
    () => ({
      electricity: outages.filter((o) => o.type === "electricity").length,
      water: outages.filter((o) => o.type === "water").length,
    }),
    [outages],
  );

  const overlays = useMemo(
    () => outagesToFeatures(outages, enabled, selectedId),
    [outages, enabled, selectedId],
  );

  // Load-shedding snapshot for the incident location.
  useEffect(() => {
    if (situation.lat == null || situation.lng == null) return;
    let cancelled = false;
    setLsState("loading");
    fetch(`/api/loadshedding?lat=${situation.lat}&lng=${situation.lng}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: LoadSheddingSnapshot) => {
        if (!cancelled) {
          setLs(j);
          setLsState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setLsState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [situation.lat, situation.lng]);

  const toggleLayer = (key: OutageType) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const flyToOutage = (id: string) => {
    const o = outages.find((x) => x.id === id);
    if (!o) return;
    const ring = circleRing(o.lat, o.lng, o.radiusM * 1.3);
    const lngs = ring.map((p) => p[0]);
    const lats = ring.map((p) => p[1]);
    mapRef.current?.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      60,
      15,
    );
  };

  // Draw flow: pick a type → click centre → move to size (live) → click to lock → Confirm.
  const startDraw = (type: OutageType) => {
    setDrawType(type);
    setCircleCenterSet(false);
    setCircleRadiusM(0);
    setPlacing(false);
    setSelectedId(null);
  };

  const cancelDraw = () => {
    mapRef.current?.cancelDraw();
    setDrawType(null);
    setCircleCenterSet(false);
    setCircleRadiusM(0);
  };

  const confirmDraw = () => {
    mapRef.current?.applyCircle(); // → onDrawComplete creates the outage
  };

  const onDrawComplete = (result: MapDrawResult) => {
    if (result.kind !== "circle" || !drawType) return;
    const id = addOutage({
      type: drawType,
      title: `${drawType === "electricity" ? "Power" : "Water"} outage`,
      lng: result.center[0],
      lat: result.center[1],
      radiusM: Math.max(100, Math.round(result.radiusMeters)),
    });
    setSelectedId(id);
    setDrawType(null);
    setCircleCenterSet(false);
    setCircleRadiusM(0);
  };

  // Single click (when not drawing) moves an existing selected outage's centre.
  const onMapClick = (lng: number, lat: number) => {
    if (placing && selectedId) {
      updateOutage(selectedId, { lat, lng });
      setPlacing(false);
    }
  };

  return (
    <div className="ic-outages">
      <aside className="ic-outages__panel">
        <header className="ic-outages__head">
          <h1 className="ic-main__title">Outage Map</h1>
          <p className="ic-outages__sub">
            Mark electricity &amp; water outages and their affected areas. Live load‑shedding status
            is shown below for the incident area.
          </p>
        </header>

        <div className="ic-outages__layers">
          {OUTAGE_TYPES.map((t) => (
            <label key={t.key} className="ic-outages__layer">
              <input
                type="checkbox"
                checked={enabled.has(t.key)}
                onChange={() => toggleLayer(t.key)}
              />
              <span className="ic-outages__swatch" style={{ background: t.color }} aria-hidden />
              <span className="ic-outages__layer-label ic-btn-icon">
                <OutageTypeIcon type={t.key} size={13} /> {t.label}
              </span>
              <span className="ic-outages__layer-count">{counts[t.key]}</span>
            </label>
          ))}
        </div>

        <div className="ic-outages__report">
          <button type="button" className="ic-btn-add ic-btn-icon" onClick={() => startDraw("electricity")}>
            <IconBolt size={14} /> Report power outage
          </button>
          <button type="button" className="ic-btn-add ic-btn-icon" onClick={() => startDraw("water")}>
            <IconDroplet size={14} /> Report water outage
          </button>
        </div>

        {drawType ? (
          <div className="ic-outages__hint ic-outages__hint--draw">
            {!circleCenterSet ? (
              <span className="ic-btn-icon"><IconPin size={14} /> Click the map to drop the {drawType === "electricity" ? "power" : "water"} outage centre.</span>
            ) : (
              <span>
                Move to size — <strong>{(circleRadiusM / 1000).toFixed(2)} km</strong> — click to lock, then Confirm.
              </span>
            )}
            <span className="ic-outages__draw-actions">
              {circleCenterSet ? (
                <button type="button" className="ic-outages__confirm-draw" onClick={confirmDraw}>
                  Confirm
                </button>
              ) : null}
              <button type="button" className="ic-outages__cancel-draw" onClick={cancelDraw}>
                Cancel
              </button>
            </span>
          </div>
        ) : placing ? (
          <p className="ic-outages__hint ic-btn-icon"><IconPin size={14} /> Click the map to move the outage location.</p>
        ) : null}

        {/* Load-shedding (EskomSePush) */}
        <section className="ic-outages__ls">
          <h2 className="ic-outages__section-title">Load shedding</h2>
          {lsState === "loading" && !ls ? (
            <p className="ic-empty-hint">Checking status…</p>
          ) : lsState === "error" ? (
            <p className="ic-empty-hint">Load‑shedding status unavailable.</p>
          ) : ls ? (
            <div className="ic-outages__ls-body">
              <div
                className={`ic-outages__stage ic-outages__stage--${ls.national.stage > 0 ? "on" : "off"}`}
              >
                <strong>Stage {ls.national.stage}</strong>
                <span>{ls.national.label}</span>
              </div>
              {ls.area ? (
                <div className="ic-outages__ls-area">
                  <div className="ic-outages__ls-area-name">
                    {ls.area.name}
                    {ls.area.region ? ` · ${ls.area.region}` : ""}
                  </div>
                  {ls.area.events.length ? (
                    <ul className="ic-outages__ls-events">
                      {ls.area.events.slice(0, 3).map((e, i) => (
                        <li key={i}>
                          <span>{e.note}</span>
                          <span className="ic-outages__muted">
                            {new Date(e.start).toLocaleString(undefined, {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                            {" – "}
                            {new Date(e.end).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="ic-outages__muted">No scheduled slots in range.</p>
                  )}
                </div>
              ) : ls.configureAreaSchedule ? (
                <p className="ic-outages__muted">
                  Set <code>ESP_API_TOKEN</code> to show this area&apos;s schedule.
                </p>
              ) : (
                <p className="ic-outages__muted">
                  National stage only. Add an EskomSePush token for area schedules.
                </p>
              )}
            </div>
          ) : (
            <p className="ic-empty-hint">
              Set the incident location in Situation for load‑shedding status.
            </p>
          )}
        </section>

        {/* Outage list */}
        <section className="ic-outages__list-wrap">
          <h2 className="ic-outages__section-title">
            Outages <span className="ic-outages__muted">({outages.length})</span>
          </h2>
          {outages.length === 0 ? (
            <p className="ic-empty-hint">No outages logged. Use the buttons above to add one.</p>
          ) : (
            <ul className="ic-outages__list">
              {outages.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    className={`ic-outages__item${selectedId === o.id ? " ic-outages__item--selected" : ""}`}
                    onClick={() => {
                      setSelectedId(o.id);
                      setPlacing(false);
                      flyToOutage(o.id);
                    }}
                  >
                    <span className="ic-outages__item-icon"><OutageTypeIcon type={o.type} size={16} /></span>
                    <span className="ic-outages__item-body">
                      <span className="ic-outages__item-title">{o.title}</span>
                      <span className="ic-outages__muted">
                        {o.status} · {(o.radiusM / 1000).toFixed(1)} km
                        {o.affected ? ` · ${o.affected.toLocaleString()} affected` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Selected outage editor */}
        {selected ? (
          <section className="ic-outages__editor">
            <h2 className="ic-outages__section-title">Edit outage</h2>
            <label className="ic-outages__field">
              <span>Title</span>
              <input
                value={selected.title}
                onChange={(e) => updateOutage(selected.id, { title: e.target.value })}
              />
            </label>
            <div className="ic-outages__grid2">
              <label className="ic-outages__field">
                <span>Type</span>
                <select
                  value={selected.type}
                  onChange={(e) => updateOutage(selected.id, { type: e.target.value as OutageType })}
                >
                  {OUTAGE_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ic-outages__field">
                <span>Status</span>
                <select
                  value={selected.status}
                  onChange={(e) =>
                    updateOutage(selected.id, { status: e.target.value as OutageStatus })
                  }
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="ic-outages__field">
              <span>Affected area — {(selected.radiusM / 1000).toFixed(1)} km radius</span>
              <input
                type="range"
                min={100}
                max={10000}
                step={100}
                value={selected.radiusM}
                onChange={(e) => updateOutage(selected.id, { radiusM: Number(e.target.value) })}
              />
            </label>
            <div className="ic-outages__grid2">
              <label className="ic-outages__field">
                <span>Cause</span>
                <input
                  value={selected.cause ?? ""}
                  onChange={(e) => updateOutage(selected.id, { cause: e.target.value })}
                  placeholder="e.g. cable fault"
                />
              </label>
              <label className="ic-outages__field">
                <span>Affected (people)</span>
                <input
                  type="number"
                  min={0}
                  value={selected.affected ?? ""}
                  onChange={(e) =>
                    updateOutage(selected.id, {
                      affected: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </label>
            </div>
            <label className="ic-outages__field">
              <span>Estimated restoration</span>
              <input
                type="datetime-local"
                value={toLocalInput(selected.etaAt)}
                onChange={(e) =>
                  updateOutage(selected.id, {
                    etaAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  })
                }
              />
            </label>
            <p className="ic-outages__muted">ETA: {fmtEta(selected.etaAt)}</p>
            <div className="ic-outages__editor-actions">
              <button
                type="button"
                className={`ic-btn-secondary ic-btn-secondary--sm ic-btn-icon${placing ? " ic-outages__place--on" : ""}`}
                onClick={() => setPlacing((v) => !v)}
              >
                <IconPin size={13} /> {placing ? "Click map…" : "Set location on map"}
              </button>
              <button
                type="button"
                className="ic-outages__delete"
                onClick={() => {
                  removeOutage(selected.id);
                  setSelectedId(null);
                  setPlacing(false);
                }}
              >
                Delete
              </button>
            </div>
          </section>
        ) : null}
      </aside>

      <div className="ic-outages__map">
        <MapCanvas
          ref={mapRef}
          center={center}
          zoom={11}
          incidentMarker={center}
          overlays={overlays}
          drawMode={(drawType ? "circle" : "none") as MapDrawMode}
          onDrawStateChange={(s) => {
            setCircleCenterSet(s.circleCenterSet);
            setCircleRadiusM(Math.round(s.circleRadiusMeters));
          }}
          onDrawComplete={onDrawComplete}
          onMapClick={onMapClick}
        />
      </div>
    </div>
  );
}
