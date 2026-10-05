"use client";

import type { Feature, FeatureCollection } from "geojson";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { useMapBasemapTheme } from "@/lib/maps/basemap-theme";
import { emptyFeatureCollection, mergeFeatureCollections } from "@/lib/maps/geo-utils";
import { annotationsToFeatureCollection, DEFAULT_ANNOTATION_COLOR } from "@/lib/maps/map-annotations";
import type { RouteVariant, RouteWaypoint } from "@/lib/maps/routing-types";
import {
  boundsForVariants,
  routesToFeatureCollection,
  supplyRoutesWaypointMarkers,
  waypointMarkersCollection,
} from "@/lib/maps/routes-geojson";
import {
  COP_LAYERS,
  buildCopFeatures,
  copCounts,
  type CopLayerKey,
} from "@/lib/maps/cop-features";
import { useDeviceRegistry } from "@/lib/devices/store";
import { devicePresence, offlineThresholdMs, useNow } from "@/lib/devices/presence";
import { IconTarget } from "@/components/ui/icons";
import { useUnitTelemetry } from "./useUnitTelemetry";

import MapCanvas, {
  type MapCanvasHandle,
  type MapDrawMode,
  type MapDrawResult,
} from "./MapCanvas";
import { MapDrawingToolbar, type MapTool } from "./MapDrawingToolbar";
import { MapRouteFloatingPanel } from "./MapRouteFloatingPanel";
import { MapRouteInfoPanel } from "./MapRouteInfoPanel";
import {
  MapRoutePlanner,
  type MapRoutePlannerHandle,
  type RoutePickMode,
} from "./MapRoutePlanner";

export function EventMapView() {
  const situation = useIncidentStore((s) => s.situation);
  const mapAnnotations = useIncidentStore((s) => s.mapAnnotations);
  const supplyRoutes = useIncidentStore((s) => s.supplyRoutes);
  const fieldUnits = useIncidentStore((s) => s.fieldUnits);
  const distressEvents = useIncidentStore((s) => s.distressEvents);
  const personnel = useIncidentStore((s) => s.personnel);
  const shelters = useIncidentStore((s) => s.shelters);
  const damages = useIncidentStore((s) => s.damages);
  const roadDamages = useIncidentStore((s) => s.roadDamages);
  const resourceRequests = useIncidentStore((s) => s.resourceRequests);
  const updateSituation = useIncidentStore((s) => s.updateSituation);
  const addRoadDamage = useIncidentStore((s) => s.addRoadDamage);
  const addMapAnnotation = useIncidentStore((s) => s.addMapAnnotation);
  const updateMapAnnotation = useIncidentStore((s) => s.updateMapAnnotation);
  const removeMapAnnotation = useIncidentStore((s) => s.removeMapAnnotation);
  const removeSupplyRoute = useIncidentStore((s) => s.removeSupplyRoute);

  const mapRef = useRef<MapCanvasHandle>(null);
  const routePlannerRef = useRef<MapRoutePlannerHandle>(null);
  const [tool, setTool] = useState<MapTool>("none");
  const [routePickMode, setRoutePickMode] = useState<RoutePickMode>("none");
  const [draftVariants, setDraftVariants] = useState<RouteVariant[]>([]);
  const [previewVariantId, setPreviewVariantId] = useState<string | null>(null);
  const [routeOrigin, setRouteOrigin] = useState<RouteWaypoint | null>(null);
  const [routeDestination, setRouteDestination] = useState<RouteWaypoint | null>(null);
  const [routeVia, setRouteVia] = useState<RouteWaypoint[]>([]);
  const [polygonVerts, setPolygonVerts] = useState(0);
  const [circleCenterSet, setCircleCenterSet] = useState(false);
  const [circleRadiusMeters, setCircleRadiusMeters] = useState(500);
  const [roadDamagePlotted, setRoadDamagePlotted] = useState(0);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [canSaveRoute, setCanSaveRoute] = useState(false);
  const [copEnabled, setCopEnabled] = useState<Set<CopLayerKey>>(
    () => new Set(COP_LAYERS.map((l) => l.key)),
  );
  const { theme: basemapTheme, toggleTheme: toggleBasemapTheme } = useMapBasemapTheme();

  // The "Field Units (live)" layer toggle drives the live telemetry feed directly: enabling the
  // layer streams live bodycam positions (the real feed when NEXT_PUBLIC_TELEMETRY_WS_URL is set,
  // otherwise the local demo sim). One switch — no separate "live feed" control.
  const unitsLayerOn = copEnabled.has("units");
  const telemetry = useUnitTelemetry(fieldUnits, unitsLayerOn);

  /** Field units with live telemetry positions applied (falls back to last-set). */
  const liveUnits = useMemo(
    () =>
      fieldUnits.map((u) => {
        const fix = telemetry.positions.get(u.id);
        return fix ? { ...u, lat: fix.lat, lng: fix.lng } : u;
      }),
    [fieldUnits, telemetry],
  );

  // Offline bodycams: a unit is offline if manually set offline, or its linked device
  // has stopped checking in. Recomputed on a timer so it decays with wall-clock time.
  const now = useNow();
  const offlineMs = offlineThresholdMs(useIncidentStore((s) => s.settings.deviceOfflineAfterSec));
  const registeredDevices = useDeviceRegistry((s) => s.devices);
  const offlineUnitIds = useMemo(() => {
    const byId = new Map(registeredDevices.map((d) => [d.id, d]));
    return new Set(
      fieldUnits
        .filter((u) => {
          if (u.status === "offline") return true;
          const dev = u.deviceId ? byId.get(u.deviceId) : undefined;
          return dev ? devicePresence(dev.lastSeenAt, now, offlineMs) === "offline" : false;
        })
        .map((u) => u.id),
    );
  }, [fieldUnits, registeredDevices, now, offlineMs]);

  const copData = useMemo(
    () => ({ fieldUnits: liveUnits, personnel, shelters, damages, roadDamages, resourceRequests, offlineUnitIds }),
    [liveUnits, personnel, shelters, damages, roadDamages, resourceRequests, offlineUnitIds],
  );
  // Count field units by whether they *can* appear on the map (a bodycam/deviceId or a set
  // position) — NOT by whether a live fix is currently applied. Otherwise turning the layer off
  // stops telemetry, drops the live count to 0, and the toggle would vanish (can't re-enable).
  const unitsLocatable = useMemo(
    () => fieldUnits.filter((u) => u.deviceId != null || (u.lat != null && u.lng != null)).length,
    [fieldUnits],
  );
  const copCountsMap = useMemo(
    () => ({ ...copCounts(copData), units: unitsLocatable }),
    [copData, unitsLocatable],
  );
  const totalCopRecords = useMemo(
    () => COP_LAYERS.reduce((n, l) => n + copCountsMap[l.key], 0),
    [copCountsMap],
  );
  const copFeatures = useMemo(
    () => buildCopFeatures(copData, copEnabled),
    [copData, copEnabled],
  );

  const unitLayerColor = COP_LAYERS.find((l) => l.key === "units")?.color ?? "#16a34a";

  /** Breadcrumb trails for live units (only while telemetry is streaming). */
  const trailFeatures = useMemo((): FeatureCollection => {
    const features: Feature[] = [];
    telemetry.trails.forEach((coords) => {
      if (coords.length < 2) return;
      features.push({
        type: "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: { strokeColor: unitLayerColor, lineWidth: 2.5, lineOpacity: 0.55 },
      });
    });
    return { type: "FeatureCollection", features };
  }, [telemetry, unitLayerColor]);

  /** Short heading vector from each live (non-stale) unit in its direction of travel. */
  const headingFeatures = useMemo((): FeatureCollection => {
    const features: Feature[] = [];
    const len = 0.0011; // ~110 m
    telemetry.positions.forEach((pos, id) => {
      const m = telemetry.meta.get(id);
      if (!m || m.stale || m.heading == null) return;
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [pos.lng, pos.lat],
            [pos.lng + Math.cos(m.heading) * len, pos.lat + Math.sin(m.heading) * len],
          ],
        },
        properties: { strokeColor: unitLayerColor, lineWidth: 3.5, lineOpacity: 0.95 },
      });
    });
    return { type: "FeatureCollection", features };
  }, [telemetry, unitLayerColor]);

  /** Newest unresolved distress signal that has a position — the map focuses on it. */
  const focusDistress = useMemo(
    () =>
      distressEvents.find(
        (d) =>
          (d.status === "active" || d.status === "acknowledged") &&
          d.lat != null &&
          d.lng != null,
      ) ?? null,
    [distressEvents],
  );
  const distressPoint = useMemo<[number, number] | null>(
    () =>
      focusDistress && focusDistress.lat != null && focusDistress.lng != null
        ? [focusDistress.lng, focusDistress.lat]
        : null,
    [focusDistress],
  );


  /** Fly the map to a unit's live position (units can be far from the incident). */
  const locateUnit = useCallback((lat: number, lng: number) => {
    const d = 0.004; // ~400 m box → centers + zooms in on the unit
    mapRef.current?.fitBounds(
      [
        [lng - d, lat - d],
        [lng + d, lat + d],
      ],
      80,
      15,
    );
  }, []);

  /** Frame the incident + every live unit at once (units may be far from the incident). */
  const fitAllUnits = useCallback(() => {
    const pts: [number, number][] = [];
    if (situation.lat != null && situation.lng != null) pts.push([situation.lng, situation.lat]);
    telemetry.positions.forEach((p) => pts.push([p.lng, p.lat]));
    if (pts.length === 0) return;
    const lngs = pts.map((p) => p[0]);
    const lats = pts.map((p) => p[1]);
    mapRef.current?.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      72,
      14,
    );
  }, [situation.lat, situation.lng, telemetry]);

  // Auto-fit to frame the incident + units the first time the layer is enabled and a live
  // position exists (units can be far from the incident — e.g. a bodycam in another town). Fits
  // once per enable; re-enabling fits again. A distress focus takes priority.
  const didAutoFitRef = useRef(false);
  useEffect(() => {
    if (!unitsLayerOn) {
      didAutoFitRef.current = false;
      return;
    }
    if (didAutoFitRef.current || focusDistress) return;
    if (telemetry.positions.size === 0) return;
    didAutoFitRef.current = true;
    fitAllUnits();
  }, [unitsLayerOn, telemetry, focusDistress, fitAllUnits]);

  const toggleCopLayer = useCallback((key: CopLayerKey) => {
    setCopEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectedRoute = useMemo(
    () => supplyRoutes.find((r) => r.id === selectedRouteId) ?? null,
    [supplyRoutes, selectedRouteId],
  );

  const center = useMemo((): [number, number] | null => {
    if (situation.lat == null || situation.lng == null) return null;
    return [situation.lng, situation.lat];
  }, [situation.lat, situation.lng]);

  // When a distress is active, the map recenters on it (MapCanvas flyTo is ready-aware).
  const mapCenter = distressPoint ?? center;

  const annotationOverlays = useMemo(
    () => annotationsToFeatureCollection(mapAnnotations),
    [mapAnnotations],
  );

  const routeOverlays = useMemo(() => {
    const savedLines = routesToFeatureCollection(supplyRoutes, {
      focusedRouteId: selectedRouteId,
    });
    const draftLines =
      tool === "route" && draftVariants.length > 0
        ? routesToFeatureCollection([], {
            draftVariants,
            previewVariantId,
          })
        : emptyFeatureCollection();
    const savedMarkers = supplyRoutesWaypointMarkers(supplyRoutes, {
      highlightRouteId: selectedRouteId,
    });
    const plannerMarkers = waypointMarkersCollection(
      tool === "route" ? routeOrigin : null,
      tool === "route" ? routeDestination : null,
      tool === "route" ? routeVia : [],
    );
    return mergeFeatureCollections(savedLines, draftLines, savedMarkers, plannerMarkers);
  }, [
    supplyRoutes,
    draftVariants,
    previewVariantId,
    selectedRouteId,
    tool,
    routeOrigin,
    routeDestination,
    routeVia,
  ]);

  const overlays = useMemo(
    () =>
      mergeFeatureCollections(
        annotationOverlays,
        routeOverlays,
        trailFeatures,
        headingFeatures,
        copFeatures,
      ),
    [annotationOverlays, routeOverlays, trailFeatures, headingFeatures, copFeatures],
  );

  const drawMode: MapDrawMode =
    tool === "polygon"
      ? "polygon"
      : tool === "circle"
        ? "circle"
        : tool === "road-damage"
          ? "point"
          : "none";

  const clearRouteDrafts = useCallback(() => {
    setDraftVariants([]);
    setPreviewVariantId(null);
    setRouteOrigin(null);
    setRouteDestination(null);
    setRouteVia([]);
  }, []);

  const selectTool = (next: MapTool) => {
    mapRef.current?.cancelDraw();
    if (tool === "route" && next !== "route") {
      clearRouteDrafts();
      setCanSaveRoute(false);
    }
    setTool(next);
    setRoutePickMode("none");
    setPolygonVerts(0);
    setCircleCenterSet(false);
    setCircleRadiusMeters(500);
    if (next !== "road-damage") setRoadDamagePlotted(0);
  };

  const cancelDraw = () => {
    mapRef.current?.cancelDraw();
    setPolygonVerts(0);
    setCircleCenterSet(false);
    setCircleRadiusMeters(500);
  };

  const saveDrawResult = (result: MapDrawResult) => {
    const n = mapAnnotations.length + 1;
    if (result.kind === "polygon") {
      addMapAnnotation({
        name: `Area ${n}`,
        kind: "polygon",
        geojson: result.geojson,
      });
    } else {
      addMapAnnotation({
        name: `Radius ${Math.round(result.radiusMeters)} m`,
        kind: "circle",
        radiusMeters: result.radiusMeters,
        geojson: result.geojson,
      });
    }
    cancelDraw();
    setTool("none");
  };

  const handleWaypointsChange = useCallback(
    (origin: RouteWaypoint | null, destination: RouteWaypoint | null, via: RouteWaypoint[]) => {
      setRouteOrigin(origin);
      setRouteDestination(destination);
      setRouteVia(via);
    },
    [],
  );

  const handleRoutesCalculated = useCallback((variants: RouteVariant[]) => {
    const bounds = boundsForVariants(variants);
    if (bounds) mapRef.current?.fitBounds(bounds, 64);
  }, []);

  const handleVariantFocus = useCallback((variant: RouteVariant) => {
    setPreviewVariantId(variant.id);
    const bounds = boundsForVariants([variant]);
    if (!bounds) return;
    // Run after React commit so incident flyTo does not override route bounds.
    requestAnimationFrame(() => {
      mapRef.current?.fitBounds(bounds, 72, 17);
    });
  }, []);

  const focusSavedRoute = useCallback((routeId: string) => {
    const route = supplyRoutes.find((r) => r.id === routeId);
    if (!route) return;
    setSelectedRouteId(routeId);
    const variant =
      route.variants.find((v) => v.id === route.selectedVariantId) ?? route.variants[0];
    if (variant) handleVariantFocus(variant);
  }, [supplyRoutes, handleVariantFocus]);

  const handleRouteLineClick = useCallback(
    (payload: { routeId?: string; variantId: string }) => {
      if (payload.routeId) {
        focusSavedRoute(payload.routeId);
        return;
      }
      const match = supplyRoutes.find((r) =>
        r.variants.some((v) => v.id === payload.variantId),
      );
      if (match) focusSavedRoute(match.id);
    },
    [focusSavedRoute, supplyRoutes],
  );

  const handleRouteSaved = useCallback(
    (routeId: string) => {
      clearRouteDrafts();
      focusSavedRoute(routeId);
    },
    [clearRouteDrafts, focusSavedRoute],
  );

  const handleMapClick = useCallback(
    (lng: number, lat: number) => {
      if (tool === "route" && routePickMode !== "none") {
        routePlannerRef.current?.handleMapClick(lng, lat);
        return;
      }
      if (tool === "location") {
        updateSituation({ lat, lng });
        setTool("none");
        return;
      }
      if (tool === "road-damage") {
        // Plot a road-damage marker straight from the map — captures the coordinates
        // so the operator never types a lat/lng. It lands on the Road damages tab
        // (and the map) ready to be named. Tool stays active to plot several in a row.
        addRoadDamage({ lat, lng });
        setRoadDamagePlotted((n) => n + 1);
      }
    },
    [tool, routePickMode, updateSituation, addRoadDamage],
  );

  return (
    <section className={`ic-map-view${basemapTheme === "dark" ? " ic-map-view--dark" : ""}`}>
      <MapDrawingToolbar
        basemapTheme={basemapTheme}
        onBasemapThemeToggle={toggleBasemapTheme}
        tool={tool}
        onToolChange={selectTool}
        polygonVertexCount={polygonVerts}
        onFinishPolygon={() => {
          if (mapRef.current?.finishPolygon()) setTool("none");
        }}
        onUndoVertex={() => mapRef.current?.undoPolygonVertex()}
        onCancelDraw={() => {
          cancelDraw();
          setTool("none");
        }}
        circleCenterSet={circleCenterSet}
        circleRadiusMeters={circleRadiusMeters}
        onCircleRadiusChange={(meters) => {
          setCircleRadiusMeters(meters);
          mapRef.current?.setCircleRadiusMeters(meters);
        }}
        onApplyCircle={() => {
          if (mapRef.current?.applyCircle()) setTool("none");
        }}
        roadDamagePlotted={roadDamagePlotted}
        onFinishRoadDamage={() => selectTool("none")}
      />

      <div className="ic-map-view__body">
        {mapAnnotations.length > 0 || supplyRoutes.length > 0 || totalCopRecords > 0 ? (
          <aside className="ic-map-layers" aria-label="Map layers">
            <h3 className="ic-map-layers__title">Layers</h3>
            {totalCopRecords > 0 ? (
              <div className="ic-map-layers__cop">
                <h4 className="ic-map-layers__subtitle">Operational picture</h4>
                <ul className="ic-map-layers__toggles">
                  {COP_LAYERS.map((l) => {
                    const count = copCountsMap[l.key];
                    return (
                      <li key={l.key}>
                        <label
                          className={`ic-map-toggle${count === 0 ? " ic-map-toggle--empty" : ""}`}
                        >
                          <input
                            type="checkbox"
                            checked={copEnabled.has(l.key)}
                            disabled={count === 0}
                            onChange={() => toggleCopLayer(l.key)}
                          />
                          <span
                            className="ic-map-toggle__dot"
                            style={{ background: l.color }}
                            aria-hidden
                          />
                          <span className="ic-map-toggle__label">{l.label}</span>
                          <span className="ic-map-toggle__count">{count}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {unitsLayerOn && liveUnits.some((u) => telemetry.positions.has(u.id)) ? (
                  <>
                  <button type="button" className="ic-map-telemetry-btn ic-btn-icon" onClick={fitAllUnits}>
                    <IconTarget size={14} /> Show all units
                  </button>
                  <ul className="ic-map-units-roster">
                    {liveUnits
                      .filter((u) => telemetry.positions.has(u.id))
                      .map((u) => {
                        const m = telemetry.meta.get(u.id);
                        const offline = offlineUnitIds.has(u.id);
                        const stale = m?.stale ?? false;
                        const age = m ? Math.max(0, Math.round((Date.now() - m.lastFixAt) / 1000)) : 0;
                        const pos = telemetry.positions.get(u.id);
                        return (
                          <li key={u.id}>
                            <button
                              type="button"
                              className={`ic-map-unit-row${offline || stale ? " ic-map-unit-row--stale" : ""}`}
                              onClick={() => pos && locateUnit(pos.lat, pos.lng)}
                              title="Locate on the map"
                            >
                              <span
                                className="ic-map-unit-row__dot"
                                style={{ background: offline ? "#94a3b8" : stale ? "#9ca3af" : unitLayerColor }}
                                aria-hidden
                              />
                              <span className="ic-map-unit-row__cs">{u.callsign}</span>
                              <span className="ic-map-unit-row__status">
                                {offline ? "offline" : stale ? `stale ${age}s` : "live"}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                  </ul>
                  </>
                ) : null}
              </div>
            ) : null}
            <ul className="ic-map-layers__list">
              {supplyRoutes.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className={`ic-map-layers__name ic-map-layers__name--btn${selectedRouteId === r.id ? " ic-map-layers__name--active" : ""}`}
                    onClick={() => focusSavedRoute(r.id)}
                  >
                    {r.name}
                  </button>
                  <span className="ic-map-layers__meta">route</span>
                  <button
                    type="button"
                    className="ic-map-layers__remove"
                    aria-label={`Remove ${r.name}`}
                    onClick={() => {
                      removeSupplyRoute(r.id);
                      if (selectedRouteId === r.id) setSelectedRouteId(null);
                    }}
                  >
                    ×
                  </button>
                </li>
              ))}
              {mapAnnotations.map((a) => (
                <li key={a.id} className="ic-map-layers__row--shape">
                  <label
                    className="ic-map-layers__swatch"
                    title="Change colour"
                    style={{ background: a.color ?? DEFAULT_ANNOTATION_COLOR }}
                  >
                    <input
                      type="color"
                      value={a.color ?? DEFAULT_ANNOTATION_COLOR}
                      onChange={(e) => updateMapAnnotation(a.id, { color: e.target.value })}
                      aria-label={`Colour for ${a.name}`}
                    />
                  </label>
                  <input
                    className="ic-map-layers__name-input"
                    value={a.name}
                    onChange={(e) => updateMapAnnotation(a.id, { name: e.target.value })}
                    placeholder={a.kind === "circle" ? "Radius name" : "Area name"}
                    aria-label="Name"
                  />
                  <span className="ic-map-layers__meta">
                    {a.kind === "circle" && a.radiusMeters
                      ? `${Math.round(a.radiusMeters)} m`
                      : a.kind}
                  </span>
                  <button
                    type="button"
                    className="ic-map-layers__remove"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => removeMapAnnotation(a.id)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}

        <MapCanvas
          ref={mapRef}
          className="map-canvas-host--full"
          basemapTheme={basemapTheme}
          center={mapCenter}
          zoom={14}
          incidentMarker={center}
          distressPoint={distressPoint}
          overlays={overlays}
          drawMode={drawMode}
          onDrawStateChange={(s) => {
            setPolygonVerts(s.polygonVertexCount);
            setCircleCenterSet(s.circleCenterSet);
            setCircleRadiusMeters(Math.round(s.circleRadiusMeters));
          }}
          onDrawComplete={saveDrawResult}
          onMapClick={
            tool === "location" || tool === "route" || tool === "road-damage"
              ? handleMapClick
              : undefined
          }
          onRouteLineClick={handleRouteLineClick}
        />

        {selectedRoute && tool !== "route" ? (
          <MapRouteInfoPanel
            route={selectedRoute}
            onClose={() => setSelectedRouteId(null)}
            onDelete={() => {
              removeSupplyRoute(selectedRoute.id);
              setSelectedRouteId(null);
            }}
            onEdit={() => {
              setSelectedRouteId(null);
              setTool("route");
              requestAnimationFrame(() => routePlannerRef.current?.loadRoute(selectedRoute));
            }}
          />
        ) : null}

        <MapRouteFloatingPanel
          open={tool === "route"}
          title="Route planner"
          onClose={() => selectTool("none")}
          onSave={() => routePlannerRef.current?.saveRoute()}
          saveDisabled={!canSaveRoute}
          saveHint={
            canSaveRoute
              ? "Save this route on the map"
              : "Set start and end, then calculate routes before saving"
          }
        >
          <MapRoutePlanner
            ref={routePlannerRef}
            pickMode={routePickMode}
            onPickModeChange={setRoutePickMode}
            onVariantsChange={setDraftVariants}
            onPreviewVariantId={setPreviewVariantId}
            onWaypointsChange={handleWaypointsChange}
            onRoutesCalculated={handleRoutesCalculated}
            onVariantFocus={handleVariantFocus}
            onRouteSaved={handleRouteSaved}
            onCanSaveChange={setCanSaveRoute}
          />
        </MapRouteFloatingPanel>
      </div>
    </section>
  );
}
