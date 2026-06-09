"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { useMapBasemapTheme } from "@/lib/maps/basemap-theme";
import { emptyFeatureCollection, mergeFeatureCollections } from "@/lib/maps/geo-utils";
import { annotationsToFeatureCollection } from "@/lib/maps/map-annotations";
import type { RouteVariant, RouteWaypoint } from "@/lib/maps/routing-types";
import {
  boundsForVariants,
  routesToFeatureCollection,
  supplyRoutesWaypointMarkers,
  waypointMarkersCollection,
} from "@/lib/maps/routes-geojson";

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
  const updateSituation = useIncidentStore((s) => s.updateSituation);
  const addMapAnnotation = useIncidentStore((s) => s.addMapAnnotation);
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
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [canSaveRoute, setCanSaveRoute] = useState(false);
  const { theme: basemapTheme, toggleTheme: toggleBasemapTheme } = useMapBasemapTheme();

  const selectedRoute = useMemo(
    () => supplyRoutes.find((r) => r.id === selectedRouteId) ?? null,
    [supplyRoutes, selectedRouteId],
  );

  const center = useMemo((): [number, number] | null => {
    if (situation.lat == null || situation.lng == null) return null;
    return [situation.lng, situation.lat];
  }, [situation.lat, situation.lng]);

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
    () => mergeFeatureCollections(annotationOverlays, routeOverlays),
    [annotationOverlays, routeOverlays],
  );

  const drawMode: MapDrawMode =
    tool === "polygon" ? "polygon" : tool === "circle" ? "circle" : "none";

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
      }
    },
    [tool, routePickMode, updateSituation],
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
      />

      <div className="ic-map-view__body">
        {mapAnnotations.length > 0 || supplyRoutes.length > 0 ? (
          <aside className="ic-map-layers" aria-label="Map layers">
            <h3 className="ic-map-layers__title">Layers</h3>
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
                <li key={a.id}>
                  <span className="ic-map-layers__name">{a.name}</span>
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
          center={center}
          zoom={14}
          incidentMarker={center}
          overlays={overlays}
          drawMode={drawMode}
          onDrawStateChange={(s) => {
            setPolygonVerts(s.polygonVertexCount);
            setCircleCenterSet(s.circleCenterSet);
            setCircleRadiusMeters(Math.round(s.circleRadiusMeters));
          }}
          onDrawComplete={saveDrawResult}
          onMapClick={tool === "location" || tool === "route" ? handleMapClick : undefined}
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
