"use client";

import type { Feature, FeatureCollection } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";

import MapCanvas, { type MapCanvasHandle } from "@/components/map/MapCanvas";
import { useEventId, useIncidentStore } from "@/context/EventContext";
import { useTracks, useTracksHydrated, type TrackPoint } from "@/lib/tracks/store";
import { IconPlay, IconPause } from "@/components/ui/icons";

const TRACK_COLOR = "#2563eb";

function metersBetween(a: TrackPoint, b: TrackPoint): number {
  const dLat = (b.lat - a.lat) * 111_000;
  const dLng = (b.lng - a.lng) * 111_000 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dLat, dLng);
}

function fmtTime(t: number): string {
  return new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m` : m ? `${m}m ${sec}s` : `${sec}s`;
}

export function TrackHistoryView() {
  const eventId = useEventId();
  const fieldUnits = useIncidentStore((s) => s.fieldUnits);
  const hydrated = useTracksHydrated(eventId);
  const tracks = useTracks(eventId, (s) => s.tracks);
  const mapRef = useRef<MapCanvasHandle>(null);

  const trackedUnits = useMemo(
    () => fieldUnits.filter((u) => (tracks[u.id]?.length ?? 0) > 0),
    [fieldUnits, tracks],
  );

  const [unitId, setUnitId] = useState<string | null>(null);
  useEffect(() => {
    if ((!unitId || !trackedUnits.some((u) => u.id === unitId)) && trackedUnits.length) {
      setUnitId(trackedUnits[0].id);
    }
  }, [trackedUnits, unitId]);

  const selectedUnit = fieldUnits.find((u) => u.id === unitId) ?? null;
  const points = useMemo<TrackPoint[]>(
    () => (unitId ? tracks[unitId] ?? [] : []),
    [tracks, unitId],
  );

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Reset scrubber to the latest point whenever the unit or track length changes.
  useEffect(() => {
    setIdx(points.length ? points.length - 1 : 0);
    setPlaying(false);
  }, [unitId, points.length]);

  // Playback advances the scrubber; stops at the end.
  useEffect(() => {
    if (!playing || points.length < 2) return;
    const iv = window.setInterval(() => {
      setIdx((i) => {
        if (i >= points.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, 280);
    return () => window.clearInterval(iv);
  }, [playing, points.length]);

  const safeIdx = Math.min(idx, Math.max(0, points.length - 1));
  const cur = points[safeIdx];

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    let dist = 0;
    for (let i = 1; i < points.length; i++) dist += metersBetween(points[i - 1], points[i]);
    return {
      points: points.length,
      distanceKm: (dist / 1000).toFixed(2),
      duration: fmtDuration(points[points.length - 1].t - points[0].t),
      start: points[0].t,
      end: points[points.length - 1].t,
    };
  }, [points]);

  const overlays = useMemo<FeatureCollection>(() => {
    if (points.length === 0) return { type: "FeatureCollection", features: [] };
    const full = points.map((p) => [p.lng, p.lat]);
    const traveled = points.slice(0, safeIdx + 1).map((p) => [p.lng, p.lat]);
    const features: Feature[] = [
      {
        type: "Feature",
        geometry: { type: "LineString", coordinates: full },
        properties: { strokeColor: TRACK_COLOR, lineWidth: 2, lineOpacity: 0.25 },
      },
    ];
    if (traveled.length >= 2) {
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: traveled },
        properties: { strokeColor: TRACK_COLOR, lineWidth: 3.5, lineOpacity: 0.95 },
      });
    }
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: full[0] },
      properties: { kind: "cop", markerColor: "#9ca3af", label: "start" },
    });
    if (cur) {
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [cur.lng, cur.lat] },
        properties: {
          kind: "cop",
          copLayer: "units",
          markerColor: TRACK_COLOR,
          label: selectedUnit?.callsign ?? "unit",
        },
      });
    }
    return { type: "FeatureCollection", features };
  }, [points, safeIdx, cur, selectedUnit]);

  // Frame the whole path when the selected unit changes.
  useEffect(() => {
    if (points.length === 0) return;
    let minLng = Infinity;
    let minLat = Infinity;
    let maxLng = -Infinity;
    let maxLat = -Infinity;
    for (const p of points) {
      minLng = Math.min(minLng, p.lng);
      minLat = Math.min(minLat, p.lat);
      maxLng = Math.max(maxLng, p.lng);
      maxLat = Math.max(maxLat, p.lat);
    }
    const t = window.setTimeout(
      () =>
        mapRef.current?.fitBounds(
          [
            [minLng, minLat],
            [maxLng, maxLat],
          ],
          60,
          16,
        ),
      350,
    );
    return () => window.clearTimeout(t);
  }, [unitId, points.length]);

  // Stable initial center (per unit) so scrubbing doesn't re-fly the map.
  const center = points.length ? ([points[0].lng, points[0].lat] as [number, number]) : null;

  return (
    <div className="ic-track-history">
      <header className="ic-track-history__head">
        <div>
          <h1 className="ic-main__title">Track History</h1>
          <p className="ic-dashboard-header__sub">
            Replay how each bodycam moved through the incident — full recorded path with playback.
          </p>
        </div>
        {trackedUnits.length > 0 ? (
          <label className="ic-track-history__unit">
            <span>Unit</span>
            <select value={unitId ?? ""} onChange={(e) => setUnitId(e.target.value || null)}>
              {trackedUnits.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.callsign} · {tracks[u.id]?.length ?? 0} pts
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      {!hydrated ? (
        <p className="ic-empty-hint">Loading…</p>
      ) : trackedUnits.length === 0 ? (
        <p className="ic-empty-hint">
          No movement recorded yet. Once a bodycam streams GPS on this incident, its track builds
          here automatically — come back to replay where it went.
        </p>
      ) : (
        <>
          <div className="ic-track-history__map">
            <MapCanvas ref={mapRef} center={center} zoom={13} overlays={overlays} />
          </div>

          {cur ? (
            <div className="ic-track-history__controls">
              <button
                type="button"
                className="ic-track-history__play ic-btn-icon"
                onClick={() => setPlaying((p) => !p)}
                disabled={points.length < 2}
              >
                {playing ? <><IconPause size={14} /> Pause</> : <><IconPlay size={14} /> Play</>}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, points.length - 1)}
                value={safeIdx}
                onChange={(e) => {
                  setPlaying(false);
                  setIdx(Number(e.target.value));
                }}
                className="ic-track-history__scrubber"
                aria-label="Scrub track"
              />
              <div className="ic-track-history__readout">
                <strong>{fmtTime(cur.t)}</strong>
                <span className="ic-track-history__muted">
                  {safeIdx + 1} / {points.length}
                </span>
              </div>
            </div>
          ) : null}

          {stats ? (
            <div className="ic-track-history__stats">
              <span>
                <strong>{stats.points}</strong> points
              </span>
              <span>
                <strong>{stats.distanceKm}</strong> km traveled
              </span>
              <span>
                <strong>{stats.duration}</strong> tracked
              </span>
              <span className="ic-track-history__muted">
                {fmtTime(stats.start)} → {fmtTime(stats.end)}
              </span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
