"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { routeIntersectsAnnotations } from "@/lib/maps/route-intersections";
import type { RouteVariant, RouteWaypoint, SupplyRoute } from "@/lib/maps/routing-types";
import { ROUTE_SCENARIO_META } from "@/lib/maps/routing-types";
import {
  enrichVariantsWithHazards,
  ROUTE_ALT_COLORS,
} from "@/lib/maps/routes-geojson";
import type { RouteVerificationRow } from "@/lib/maps/route-verify";

export type RoutePickMode = "none" | "origin" | "destination" | "via" | "driver";

type MapRoutePlannerProps = {
  pickMode: RoutePickMode;
  onPickModeChange: (mode: RoutePickMode) => void;
  onVariantsChange: (variants: RouteVariant[]) => void;
  onPreviewVariantId: (id: string | null) => void;
  onWaypointsChange: (
    origin: RouteWaypoint | null,
    destination: RouteWaypoint | null,
    via: RouteWaypoint[],
  ) => void;
  onRoutesCalculated?: (variants: RouteVariant[]) => void;
  onVariantFocus?: (variant: RouteVariant) => void;
  onRouteSaved?: (routeId: string) => void;
  /** True when start, end, and calculated routes are ready to persist. */
  onCanSaveChange?: (canSave: boolean) => void;
};

type EnrichedVariant = RouteVariant & { intersectsHazard?: boolean; hazardHits?: string[] };

function formatKm(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatDuration(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function GeocodeField({
  label,
  value,
  onChange,
  onPickMap,
}: {
  label: string;
  value: RouteWaypoint | null;
  onChange: (w: RouteWaypoint | null) => void;
  onPickMap: () => void;
}) {
  const [query, setQuery] = useState(value?.label ?? "");
  const [suggestions, setSuggestions] = useState<RouteWaypoint[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setQuery(value?.label ?? "");
  }, [value?.label]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || (value && q === value.label)) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/map/geocode?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data: { results?: RouteWaypoint[] }) => setSuggestions(data.results ?? []))
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query, value]);

  return (
    <div className="ic-route-field">
      <span className="ic-route-field__label">{label}</span>
      <div className="ic-route-field__row">
        <input
          type="search"
          className="ic-route-field__input"
          value={query}
          placeholder="Search OpenStreetMap…"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="ic-map-navbar__btn ic-map-navbar__btn--secondary" onClick={onPickMap}>
          Map
        </button>
      </div>
      {loading ? <p className="ic-route-field__hint">Searching…</p> : null}
      {suggestions.length > 0 ? (
        <ul className="ic-route-suggestions">
          {suggestions.map((s, i) => (
            <li key={`${s.lat}-${s.lng}-${i}`}>
              <button
                type="button"
                onClick={() => {
                  onChange(s);
                  setQuery(s.label);
                  setSuggestions([]);
                }}
              >
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value ? (
        <p className="ic-route-field__coords">
          {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      ) : null}
    </div>
  );
}

export type MapRoutePlannerHandle = {
  handleMapClick: (lng: number, lat: number) => void;
  loadRoute: (route: SupplyRoute) => void;
  saveRoute: () => boolean;
};

export const MapRoutePlanner = forwardRef<MapRoutePlannerHandle, MapRoutePlannerProps>(
  function MapRoutePlanner(
    {
      pickMode,
      onPickModeChange,
      onVariantsChange,
      onPreviewVariantId,
      onWaypointsChange,
      onRoutesCalculated,
      onVariantFocus,
      onRouteSaved,
      onCanSaveChange,
    },
    ref,
  ) {
  const mapAnnotations = useIncidentStore((s) => s.mapAnnotations);
  const supplyRoutes = useIncidentStore((s) => s.supplyRoutes);
  const addSupplyRoute = useIncidentStore((s) => s.addSupplyRoute);
  const updateSupplyRoute = useIncidentStore((s) => s.updateSupplyRoute);
  const removeSupplyRoute = useIncidentStore((s) => s.removeSupplyRoute);
  const selectSupplyRouteVariant = useIncidentStore((s) => s.selectSupplyRouteVariant);
  const setSupplyRouteStatus = useIncidentStore((s) => s.setSupplyRouteStatus);

  const [origin, setOrigin] = useState<RouteWaypoint | null>(null);
  const [destination, setDestination] = useState<RouteWaypoint | null>(null);
  const [viaPoints, setViaPoints] = useState<RouteWaypoint[]>([]);
  const [driverPosition, setDriverPosition] = useState<RouteWaypoint | null>(null);
  const [avoidAnnotationId, setAvoidAnnotationId] = useState("");
  const [variants, setVariants] = useState<EnrichedVariant[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routeName, setRouteName] = useState("Supply route");
  const [purpose, setPurpose] = useState("Supply truck");
  const [briefing, setBriefing] = useState("");
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [verifyRows, setVerifyRows] = useState<RouteVerificationRow[] | null>(null);
  const [verifying, setVerifying] = useState(false);

  const polygonOptions = useMemo(
    () =>
      mapAnnotations.filter((a) => a.kind === "polygon" || a.kind === "circle"),
    [mapAnnotations],
  );

  useEffect(() => {
    onWaypointsChange(origin, destination, viaPoints);
  }, [origin, destination, viaPoints, onWaypointsChange]);

  useEffect(() => {
    onVariantsChange(variants);
  }, [variants, onVariantsChange]);

  useEffect(() => {
    onPreviewVariantId(previewId);
  }, [previewId, onPreviewVariantId]);

  const avoidPolygon = useMemo(() => {
    if (!avoidAnnotationId) return undefined;
    const ann = mapAnnotations.find((a) => a.id === avoidAnnotationId);
    const feat = ann?.geojson.features[0];
    if (!feat?.geometry) return undefined;
    if (feat.geometry.type === "Polygon") {
      return feat.geometry.coordinates[0] as [number, number][];
    }
    return undefined;
  }, [avoidAnnotationId, mapAnnotations]);

  const runVerification = useCallback(
    async (variantList: RouteVariant[]) => {
      if (!origin || !destination || variantList.length === 0) {
        setVerifyRows(null);
        return;
      }
      setVerifying(true);
      try {
        const res = await fetch("/api/map/verify-routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ origin, destination, variants: variantList }),
        });
        const data = (await res.json()) as {
          rows?: RouteVerificationRow[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Verification failed");
        setVerifyRows(data.rows ?? []);
      } catch {
        setVerifyRows(null);
      } finally {
        setVerifying(false);
      }
    },
    [origin, destination],
  );

  const planRoutes = useCallback(async () => {
    if (!origin || !destination) {
      setError("Set a start and end location first.");
      return;
    }
    setPlanning(true);
    setError(null);
    setVerifyRows(null);
    try {
      const res = await fetch("/api/map/plan-routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin,
          destination,
          viaPoints,
          avoidPolygon,
          midJourneyOrigin: driverPosition,
        }),
      });
      const data = (await res.json()) as { variants?: RouteVariant[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Planning failed");
      const raw = data.variants ?? [];
      const hazards = mapAnnotations.filter((a) => a.kind === "polygon" || a.kind === "circle");
      const next = enrichVariantsWithHazards(raw, (geometry) =>
        routeIntersectsAnnotations(geometry, hazards),
      );
      setVariants(next);
      setPreviewId(next[0]?.id ?? null);
      onRoutesCalculated?.(next);
      if (next.length === 0) {
        setError("No routes found for these points.");
      } else {
        void runVerification(next);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not plan routes");
      setVariants([]);
      setVerifyRows(null);
    } finally {
      setPlanning(false);
    }
  }, [
    origin,
    destination,
    viaPoints,
    avoidPolygon,
    driverPosition,
    mapAnnotations,
    onRoutesCalculated,
    runVerification,
  ]);

  const loadRoute = useCallback((route: SupplyRoute) => {
    setEditingRouteId(route.id);
    setRouteName(route.name);
    setPurpose(route.purpose);
    setOrigin(route.origin);
    setDestination(route.destination);
    setDriverPosition(route.midJourneyOrigin);
    setViaPoints(route.viaPoints);
    setAvoidAnnotationId(route.avoidAnnotationId ?? "");
    setVariants(route.variants);
    const focus = route.variants.find((v) => v.id === route.selectedVariantId) ?? route.variants[0];
    setPreviewId(focus?.id ?? null);
    if (focus) onVariantFocus?.(focus);
    setBriefing(route.briefingNotes);
  }, [onVariantFocus]);

  const canSaveRoute = Boolean(origin && destination && variants.length > 0);

  useEffect(() => {
    onCanSaveChange?.(canSaveRoute);
  }, [canSaveRoute, onCanSaveChange]);

  const saveRoute = useCallback(() => {
    if (!origin || !destination || variants.length === 0) return false;
    const selected = previewId ?? variants[0]?.id ?? null;
    if (editingRouteId) {
      updateSupplyRoute(editingRouteId, {
        name: routeName,
        purpose,
        origin,
        destination,
        midJourneyOrigin: driverPosition,
        viaPoints,
        avoidAnnotationId: avoidAnnotationId || null,
        variants,
        selectedVariantId: selected,
        briefingNotes: briefing,
      });
      onRouteSaved?.(editingRouteId);
    } else {
      const id = addSupplyRoute({
        name: routeName,
        purpose,
        origin,
        destination,
        midJourneyOrigin: driverPosition,
        viaPoints,
        avoidAnnotationId: avoidAnnotationId || null,
        variants,
        selectedVariantId: selected,
        briefingNotes: briefing,
        status: "planning",
      });
      setEditingRouteId(id);
      onRouteSaved?.(id);
    }
    return true;
  }, [
    origin,
    destination,
    variants,
    previewId,
    editingRouteId,
    routeName,
    purpose,
    driverPosition,
    viaPoints,
    avoidAnnotationId,
    briefing,
    updateSupplyRoute,
    addSupplyRoute,
    onRouteSaved,
  ]);

  useImperativeHandle(
    ref,
    () => ({
      loadRoute,
      saveRoute,
      handleMapClick: (lng: number, lat: number) => {
        if (pickMode === "none") return;
        const point: RouteWaypoint = {
          lat,
          lng,
          label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
        };
        if (pickMode === "origin") setOrigin(point);
        else if (pickMode === "destination") setDestination(point);
        else if (pickMode === "via") {
          setViaPoints((pts) => [...pts, { ...point, label: `Via ${pts.length + 1}` }]);
        } else if (pickMode === "driver") setDriverPosition(point);
        onPickModeChange("none");
      },
    }),
    [pickMode, onPickModeChange, loadRoute, saveRoute],
  );

  const pickHint =
    pickMode === "origin"
      ? "Click the map to set the start."
      : pickMode === "destination"
        ? "Click the map to set the end."
        : pickMode === "via"
          ? "Click the map to add a via / diversion point."
          : pickMode === "driver"
            ? "Click the map for the driver's current position (mid-journey reroute)."
            : null;

  return (
    <div className="ic-route-planner">
      <p className="ic-map-navbar__hint">
        Plan OSM driving routes with alternates for traffic, unrest, and emergencies. Save a
        briefing and send the driver a Google Maps link.
      </p>
      {pickHint ? <p className="ic-route-planner__pick-hint">{pickHint}</p> : null}

      <GeocodeField
        label="Start"
        value={origin}
        onChange={setOrigin}
        onPickMap={() => onPickModeChange("origin")}
      />
      <GeocodeField
        label="End"
        value={destination}
        onChange={setDestination}
        onPickMap={() => onPickModeChange("destination")}
      />

      <div className="ic-route-field">
        <span className="ic-route-field__label">Avoid area (optional)</span>
        <select
          className="ic-route-field__input"
          value={avoidAnnotationId}
          onChange={(e) => setAvoidAnnotationId(e.target.value)}
        >
          <option value="">None — no cordon</option>
          {polygonOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="ic-map-navbar__btn-row">
        <button
          type="button"
          className="ic-map-navbar__btn ic-map-navbar__btn--secondary"
          onClick={() => onPickModeChange("via")}
        >
          + Via on map
        </button>
        <button
          type="button"
          className="ic-map-navbar__btn ic-map-navbar__btn--secondary"
          onClick={() => onPickModeChange("driver")}
        >
          Driver position
        </button>
        {viaPoints.length > 0 ? (
          <button
            type="button"
            className="ic-map-navbar__btn ic-map-navbar__btn--ghost"
            onClick={() => setViaPoints([])}
          >
            Clear vias
          </button>
        ) : null}
      </div>

      {viaPoints.length > 0 ? (
        <ul className="ic-route-via-list">
          {viaPoints.map((v, i) => (
            <li key={`${v.lat}-${i}`}>
              {v.label || `Via ${i + 1}`}
              <button type="button" onClick={() => setViaPoints((pts) => pts.filter((_, j) => j !== i))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {driverPosition ? (
        <p className="ic-route-field__hint">
          Mid-journey from: {driverPosition.label || `${driverPosition.lat.toFixed(4)}, ${driverPosition.lng.toFixed(4)}`}
        </p>
      ) : null}

      <div className="ic-map-navbar__btn-row">
        <button
          type="button"
          className="ic-map-navbar__btn ic-map-navbar__btn--primary"
          disabled={planning}
          onClick={() => void planRoutes()}
        >
          {planning ? "Calculating…" : "Calculate routes"}
        </button>
      </div>

      {error ? <p className="ic-route-planner__error">{error}</p> : null}

      {variants.length > 0 ? (
        <section className="ic-route-accuracy" aria-label="Route accuracy check">
          <h4 className="ic-route-variants__title">Accuracy check</h4>
          <p className="ic-route-field__hint">
            Cross-checked against OpenStreetMap roads (OSRM, no API keys). Compare km and time in
            Google Maps using the links below — typical difference is 0–15% on long trips.
          </p>
          {verifying ? (
            <p className="ic-route-field__hint">Verifying routes…</p>
          ) : verifyRows && verifyRows.length > 0 ? (
            <ul className="ic-route-accuracy__list">
              {verifyRows.map((row) => {
                const osrmOk =
                  row.distanceVsOsrmPct != null && Math.abs(row.distanceVsOsrmPct) <= 2;
                return (
                  <li key={row.label} className="ic-route-accuracy__item">
                    <div className="ic-route-accuracy__head">
                      <strong>{row.label}</strong>
                      <span
                        className={`ic-route-accuracy__badge${osrmOk ? " ic-route-accuracy__badge--ok" : row.distanceVsOsrmPct != null ? " ic-route-accuracy__badge--warn" : ""}`}
                      >
                        {row.distanceVsOsrmPct != null
                          ? `OSRM ${row.distanceVsOsrmPct >= 0 ? "+" : ""}${row.distanceVsOsrmPct}%`
                          : "OSRM n/a"}
                      </span>
                    </div>
                    <p className="ic-route-accuracy__stats">
                      App {row.appDistanceKm} km · {row.appDurationMin} min
                      {row.osrmReferenceKm != null ? ` · Ref ${row.osrmReferenceKm} km` : ""}
                      {row.geometryOk ? " · On-road OK" : ` · ${row.geometryIssue ?? "geometry issue"}`}
                    </p>
                    <a
                      href={row.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ic-route-accuracy__gmaps"
                    >
                      Compare in Google Maps
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      {variants.length > 0 ? (
        <section className="ic-route-variants" aria-label="Route options">
          <h4 className="ic-route-variants__title">
            {variants.length} routes on map — click to highlight
          </h4>
          <p className="ic-route-field__hint">
            All alternatives are drawn together. Red dashed lines cross an affected polygon or
            radius.
          </p>
          <ul className="ic-route-legend" aria-label="Route colors">
            {variants.map((v, i) => (
              <li key={`legend-${v.id}`}>
                <span
                  className="ic-route-legend__swatch"
                  style={{ background: ROUTE_ALT_COLORS[i % ROUTE_ALT_COLORS.length] }}
                />
                <span>{v.label}</span>
              </li>
            ))}
          </ul>
          <ul>
            {variants.map((v, i) => (
              <li
                key={v.id}
                className={`ic-route-variant${previewId === v.id ? " ic-route-variant--active" : ""}`}
              >
                <button
                  type="button"
                  className="ic-route-variant__select"
                  onClick={() => {
                    setPreviewId(v.id);
                    onVariantFocus?.(v);
                  }}
                >
                  <span className="ic-route-variant__color-row">
                    <span
                      className="ic-route-legend__swatch"
                      style={{ background: ROUTE_ALT_COLORS[i % ROUTE_ALT_COLORS.length] }}
                    />
                    <strong>{v.label}</strong>
                  </span>
                  <span>{v.description}</span>
                  <span className="ic-route-variant__meta">
                    {formatKm(v.distanceMeters)} · {formatDuration(v.durationSeconds)}
                  </span>
                  {v.intersectsHazard ? (
                    <span className="ic-route-variant__hazard">
                      Crosses affected area: {v.hazardHits?.join(", ") ?? "hazard zone"}
                    </span>
                  ) : null}
                </button>
                <a
                  href={v.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ic-route-variant__gmaps"
                >
                  Open in Google Maps
                </a>
              </li>
            ))}
          </ul>

          <label className="ic-route-field">
            <span className="ic-route-field__label">Route name</span>
            <input
              className="ic-route-field__input"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
            />
          </label>
          <label className="ic-route-field">
            <span className="ic-route-field__label">Purpose</span>
            <input
              className="ic-route-field__input"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
            />
          </label>
          <label className="ic-route-field">
            <span className="ic-route-field__label">Driver briefing</span>
            <textarea
              className="ic-route-field__input ic-route-field__textarea"
              rows={3}
              value={briefing}
              onChange={(e) => setBriefing(e.target.value)}
              placeholder="Instructions for the driver…"
            />
          </label>

          <div className="ic-map-navbar__btn-row">
            <button
              type="button"
              className="ic-map-navbar__btn ic-map-navbar__btn--primary"
              onClick={saveRoute}
              disabled={!canSaveRoute}
            >
              Save route
            </button>
            {previewId ? (
              <a
                className="ic-map-navbar__btn ic-map-navbar__btn--secondary"
                href={variants.find((v) => v.id === previewId)?.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Copy driver link
              </a>
            ) : null}
          </div>
        </section>
      ) : null}

      {supplyRoutes.length > 0 ? (
        <section className="ic-route-saved" aria-label="Saved routes">
          <h4 className="ic-route-variants__title">Saved routes</h4>
          <ul>
            {supplyRoutes.map((r) => {
              const selected = r.variants.find((v) => v.id === r.selectedVariantId);
              return (
                <li key={r.id} className="ic-route-saved__item">
                  <div className="ic-route-saved__head">
                    <strong>{r.name}</strong>
                    <span className={`ic-route-status ic-route-status--${r.status}`}>{r.status}</span>
                  </div>
                  <p className="ic-route-saved__meta">
                    {r.purpose} · {r.origin.label || "Start"} → {r.destination.label || "End"}
                  </p>
                  <div className="ic-map-navbar__btn-row">
                    <button type="button" className="ic-map-navbar__btn ic-map-navbar__btn--ghost" onClick={() => loadRoute(r)}>
                      Edit
                    </button>
                    {r.status !== "active" ? (
                      <button
                        type="button"
                        className="ic-map-navbar__btn ic-map-navbar__btn--secondary"
                        onClick={() => setSupplyRouteStatus(r.id, "active")}
                      >
                        Activate
                      </button>
                    ) : null}
                    {selected ? (
                      <a
                        href={selected.googleMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ic-map-navbar__btn ic-map-navbar__btn--primary"
                      >
                        Driver Google Maps
                      </a>
                    ) : null}
                    <button type="button" className="ic-map-navbar__btn ic-map-navbar__btn--ghost" onClick={() => removeSupplyRoute(r.id)}>
                      Remove
                    </button>
                  </div>
                  {r.variants.length > 1 ? (
                    <select
                      className="ic-route-field__input"
                      value={r.selectedVariantId ?? ""}
                    onChange={(e) => {
                      const vid = e.target.value || null;
                      selectSupplyRouteVariant(r.id, vid);
                      const variant = r.variants.find((x) => x.id === vid);
                      if (variant) {
                        setPreviewId(variant.id);
                        onVariantFocus?.(variant);
                      }
                    }}
                  >
                      {r.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label} ({formatKm(v.distanceMeters)})
                        </option>
                      ))}
                    </select>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
  },
);
