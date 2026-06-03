"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { useMapBasemapTheme } from "@/lib/maps/basemap-theme";
import { mergeFeatureCollections } from "@/lib/maps/geo-utils";
import { annotationsToFeatureCollection } from "@/lib/maps/map-annotations";
import type { RouteVariant, RouteWaypoint } from "@/lib/maps/routing-types";
import {
  boundsForVariants,
  routesToFeatureCollection,
  waypointMarkersCollection,
} from "@/lib/maps/routes-geojson";

import MapCanvas, {
  type MapCanvasHandle,
  type MapDrawMode,
  type MapDrawResult,
} from "./MapCanvas";
import { MapDrawingToolbar, type MapTool } from "./MapDrawingToolbar";
import { MapRouteFloatingPanel } from "./MapRouteFloatingPanel";
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
  const { theme: basemapTheme, toggleTheme: toggleBasemapTheme } = useMapBasemapTheme();

  const center = useMemo((): [number, number] | null => {
    if (situation.lat == null || situation.lng == null) return null;
    return [situation.lng, situation.lat];
  }, [situation.lat, situation.lng]);

  const annotationOverlays = useMemo(
    () => annotationsToFeatureCollection(mapAnnotations),
    [mapAnnotations],
  );

  const routeOverlays = useMemo(() => {
    const lines = routesToFeatureCollection(supplyRoutes, {
      draftVariants: draftVariants.length > 0 ? draftVariants : undefined,
      previewVariantId,
    });
    const markers = waypointMarkersCollection(
      tool === "route" ? routeOrigin : null,
      tool === "route" ? routeDestination : null,
      tool === "route" ? routeVia : [],
    );
    return mergeFeatureCollections(lines, markers);
  }, [
    supplyRoutes,
    draftVariants,
    previewVariantId,
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

  const selectTool = (next: MapTool) => {
    mapRef.current?.cancelDraw();
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
        {mapAnnotations.length > 0 ? (
          <aside className="ic-map-layers" aria-label="Saved map shapes">
            <h3 className="ic-map-layers__title">Layers</h3>
            <ul className="ic-map-layers__list">
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
        />

        <MapRouteFloatingPanel
          open={tool === "route"}
          title="Route planner"
          onClose={() => selectTool("none")}
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
          />
        </MapRouteFloatingPanel>
      </div>
    </section>
  );
}
