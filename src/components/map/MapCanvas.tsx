"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

import type { FeatureCollection, Position } from "geojson";

import {
  circleFeatureCollection,
  distanceMeters,
  emptyFeatureCollection,
  polygonFeature,
} from "@/lib/maps/geo-utils";
import { mapStyleForTheme, type MapBasemapTheme } from "@/lib/maps/basemap-theme";
import { MAP_VIEW_MAX_ZOOM, MAP_VIEW_MIN_ZOOM } from "@/lib/maps/osm-style";

const DEFAULT_CENTER: [number, number] = [-40, 45];
const DEFAULT_ZOOM = 2;
const MIN_VERTEX_GAP_M = 2;

const SOURCE_OVERLAYS = "ic-map-overlays";
const SOURCE_PREVIEW = "ic-map-preview";

const OVERLAY_LAYER_IDS = [
  "ic-map-fill",
  "ic-map-line",
  "ic-map-route-lines",
  "ic-map-route-points",
  "ic-map-preview-fill",
  "ic-map-preview-line",
  "ic-map-preview-verts",
  "ic-map-preview-center",
] as const;

type MaplibreMap = import("maplibre-gl").Map;
type MaplibreMarker = import("maplibre-gl").Marker;
type MaplibreModule = Awaited<ReturnType<typeof loadMapLibre>>;

async function loadMapLibre() {
  const mod = await import("maplibre-gl");
  const lib = mod.default ?? mod;
  if (!lib?.Map) throw new Error("MapLibre GL failed to load");
  return lib;
}

export type MapDrawMode = "none" | "point" | "polygon" | "circle";

export type MapDrawResult =
  | { kind: "polygon"; geojson: FeatureCollection }
  | { kind: "circle"; geojson: FeatureCollection; radiusMeters: number };

export type MapCanvasHandle = {
  finishPolygon: () => boolean;
  cancelDraw: () => void;
  undoPolygonVertex: () => void;
  setCircleRadiusMeters: (meters: number) => void;
  applyCircle: () => boolean;
  fitBounds: (
    bounds: [[number, number], [number, number]],
    padding?: number,
    maxZoom?: number,
  ) => void;
};

export type MapCanvasProps = {
  center?: [number, number] | null;
  zoom?: number;
  className?: string;
  overlays?: FeatureCollection;
  incidentMarker?: [number, number] | null;
  drawMode?: MapDrawMode;
  onDrawComplete?: (result: MapDrawResult) => void;
  onDrawStateChange?: (state: {
    polygonVertexCount: number;
    circleCenterSet: boolean;
    circleRadiusMeters: number;
  }) => void;
  onMapClick?: (lng: number, lat: number) => void;
  /** Fired when the user clicks a saved or draft route line on the map. */
  onRouteLineClick?: (payload: { routeId?: string; variantId: string }) => void;
  basemapTheme?: MapBasemapTheme;
};

function removeOverlayLayers(map: MaplibreMap) {
  for (const id of OVERLAY_LAYER_IDS) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  for (const sourceId of [SOURCE_OVERLAYS, SOURCE_PREVIEW]) {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  }
}

function installOverlayLayers(map: MaplibreMap) {
  map.addSource(SOURCE_OVERLAYS, { type: "geojson", data: emptyFeatureCollection() });
  map.addSource(SOURCE_PREVIEW, { type: "geojson", data: emptyFeatureCollection() });

  map.addLayer({
    id: "ic-map-fill",
    type: "fill",
    source: SOURCE_OVERLAYS,
    paint: {
      "fill-color": ["coalesce", ["get", "fillColor"], "#0d9488"],
      "fill-opacity": 0.22,
    },
    filter: ["==", ["geometry-type"], "Polygon"],
  });

  map.addLayer({
    id: "ic-map-line",
    type: "line",
    source: SOURCE_OVERLAYS,
    paint: {
      "line-color": ["coalesce", ["get", "strokeColor"], "#0d9488"],
      "line-width": ["coalesce", ["get", "lineWidth"], 2],
      "line-opacity": ["coalesce", ["get", "lineOpacity"], 1],
    },
    filter: [
      "any",
      ["==", ["geometry-type"], "Polygon"],
      [
        "all",
        ["==", ["geometry-type"], "LineString"],
        ["!", ["has", "variantId"]],
      ],
    ],
  });

  map.addLayer({
    id: "ic-map-route-lines",
    type: "line",
    source: SOURCE_OVERLAYS,
    paint: {
      "line-color": ["coalesce", ["get", "strokeColor"], "#0284c7"],
      "line-width": ["coalesce", ["get", "lineWidth"], 5],
      "line-opacity": ["coalesce", ["get", "lineOpacity"], 0.88],
      "line-dasharray": [
        "case",
        ["==", ["get", "intersectsHazard"], true],
        ["literal", [2, 1.5]],
        ["literal", [1, 0]],
      ],
    },
    filter: [
      "all",
      ["==", ["geometry-type"], "LineString"],
      ["has", "variantId"],
    ],
  });

  map.addLayer({
    id: "ic-map-route-points",
    type: "circle",
    source: SOURCE_OVERLAYS,
    filter: ["==", ["geometry-type"], "Point"],
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "dimmed"], true],
        5,
        7,
      ],
      "circle-color": [
        "match",
        ["get", "kind"],
        "route-origin",
        "#16a34a",
        "route-destination",
        "#e11d48",
        "route-via",
        "#d97706",
        "#0284c7",
      ],
      "circle-opacity": [
        "case",
        ["==", ["get", "dimmed"], true],
        0.45,
        1,
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });

  map.addLayer({
    id: "ic-map-preview-fill",
    type: "fill",
    source: SOURCE_PREVIEW,
    paint: { "fill-color": "#e11d48", "fill-opacity": 0.2 },
    filter: ["==", ["geometry-type"], "Polygon"],
  });

  map.addLayer({
    id: "ic-map-preview-line",
    type: "line",
    source: SOURCE_PREVIEW,
    paint: {
      "line-color": "#e11d48",
      "line-width": 2.5,
      "line-dasharray": ["literal", [2, 1]],
    },
  });

  map.addLayer({
    id: "ic-map-preview-verts",
    type: "circle",
    source: SOURCE_PREVIEW,
    filter: ["==", ["get", "vertex"], true],
    paint: {
      "circle-radius": 7,
      "circle-color": "#fff",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#e11d48",
    },
  });

  map.addLayer({
    id: "ic-map-preview-center",
    type: "circle",
    source: SOURCE_PREVIEW,
    filter: ["==", ["get", "circleCenter"], true],
    paint: {
      "circle-radius": 6,
      "circle-color": "#e11d48",
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });
}

function setSourceData(map: MaplibreMap, sourceId: string, data: FeatureCollection) {
  const source = map.getSource(sourceId) as import("maplibre-gl").GeoJSONSource | undefined;
  source?.setData(data);
}

function tooCloseToLastVertex(
  verts: [number, number][],
  lng: number,
  lat: number,
): boolean {
  if (verts.length === 0) return false;
  const [plng, plat] = verts[verts.length - 1]!;
  return distanceMeters(plng, plat, lng, lat) < MIN_VERTEX_GAP_M;
}

const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  {
    center,
    zoom = DEFAULT_ZOOM,
    className = "map-canvas-host--widget",
    overlays,
    incidentMarker,
    drawMode = "none",
    onDrawComplete,
    onDrawStateChange,
    onMapClick,
    onRouteLineClick,
    basemapTheme = "light",
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onRouteLineClickRef = useRef(onRouteLineClick);
  const onDrawCompleteRef = useRef(onDrawComplete);
  const onDrawStateChangeRef = useRef(onDrawStateChange);
  const drawModeRef = useRef(drawMode);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const polygonVerticesRef = useRef<[number, number][]>([]);
  const circleCenterRef = useRef<[number, number] | null>(null);
  const circleRadiusRef = useRef(500);
  const cursorRef = useRef<Position | null>(null);
  const maplibreRef = useRef<MaplibreModule | null>(null);
  const incidentPinRef = useRef<MaplibreMarker | null>(null);
  const overlaysRef = useRef(overlays);
  const incidentMarkerRef = useRef(incidentMarker);

  overlaysRef.current = overlays;
  incidentMarkerRef.current = incidentMarker;

  onMapClickRef.current = onMapClick;
  onRouteLineClickRef.current = onRouteLineClick;
  onDrawCompleteRef.current = onDrawComplete;
  onDrawStateChangeRef.current = onDrawStateChange;
  drawModeRef.current = drawMode;

  const syncIncidentPin = useCallback((map: MaplibreMap) => {
    const ml = maplibreRef.current;
    if (!ml) return;
    const coords = incidentMarkerRef.current;
    if (coords && coords[0] != null && coords[1] != null) {
      if (!incidentPinRef.current) {
        incidentPinRef.current = new ml.Marker({ color: "#e11d48", scale: 1.15 }).setLngLat(coords);
      } else {
        incidentPinRef.current.setLngLat(coords);
      }
      incidentPinRef.current.addTo(map);
      return;
    }
    incidentPinRef.current?.remove();
    incidentPinRef.current = null;
  }, []);

  const notifyDrawState = useCallback(() => {
    onDrawStateChangeRef.current?.({
      polygonVertexCount: polygonVerticesRef.current.length,
      circleCenterSet: circleCenterRef.current != null,
      circleRadiusMeters: circleRadiusRef.current,
    });
  }, []);

  const updatePreview = useCallback(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;

    const mode = drawModeRef.current;
    const features: FeatureCollection["features"] = [];

    if (mode === "polygon") {
      const verts = polygonVerticesRef.current;
      const cursor = cursorRef.current;

      verts.forEach((coord, index) => {
        features.push({
          type: "Feature",
          properties: { vertex: true, index: index + 1 },
          geometry: { type: "Point", coordinates: coord },
        });
      });

      if (verts.length >= 1 && cursor) {
        const last = verts[verts.length - 1]!;
        features.push({
          type: "Feature",
          properties: { preview: true, rubberBand: true },
          geometry: {
            type: "LineString",
            coordinates: [last, cursor],
          },
        });
      }

      if (verts.length >= 2) {
        const ring: Position[] = [...verts];
        if (cursor) ring.push(cursor);
        if (ring.length >= 3) {
          features.push(polygonFeature(ring, { preview: true }));
        } else if (ring.length === 2) {
          features.push({
            type: "Feature",
            properties: { preview: true },
            geometry: { type: "LineString", coordinates: ring },
          });
        }
      } else if (verts.length === 2) {
        features.push({
          type: "Feature",
          properties: { preview: true },
          geometry: { type: "LineString", coordinates: verts },
        });
      }
    }

    if (mode === "circle" && circleCenterRef.current) {
      const [lng, lat] = circleCenterRef.current;
      const r = Math.max(circleRadiusRef.current, 5);
      features.push({
        type: "Feature",
        properties: { circleCenter: true },
        geometry: { type: "Point", coordinates: [lng, lat] },
      });
      features.push(...circleFeatureCollection(lng, lat, r, { preview: true }).features);
    }

    setSourceData(map, SOURCE_PREVIEW, { type: "FeatureCollection", features });
  }, [status]);

  const reapplyMapState = useCallback(
    (map: MaplibreMap) => {
      removeOverlayLayers(map);
      installOverlayLayers(map);
      setSourceData(map, SOURCE_OVERLAYS, overlaysRef.current ?? emptyFeatureCollection());
      syncIncidentPin(map);
      updatePreview();
    },
    [syncIncidentPin, updatePreview],
  );

  const clearDraw = useCallback(() => {
    polygonVerticesRef.current = [];
    circleCenterRef.current = null;
    circleRadiusRef.current = 500;
    cursorRef.current = null;
    const map = mapRef.current;
    if (map?.getSource(SOURCE_PREVIEW)) {
      setSourceData(map, SOURCE_PREVIEW, emptyFeatureCollection());
    }
    notifyDrawState();
    updatePreview();
  }, [notifyDrawState, updatePreview]);

  const finishPolygon = useCallback((): boolean => {
    const verts = polygonVerticesRef.current;
    if (verts.length < 3) return false;
    const geojson: FeatureCollection = {
      type: "FeatureCollection",
      features: [polygonFeature(verts, { kind: "polygon" })],
    };
    onDrawCompleteRef.current?.({ kind: "polygon", geojson });
    clearDraw();
    return true;
  }, [clearDraw]);

  const undoPolygonVertex = useCallback(() => {
    if (polygonVerticesRef.current.length === 0) return;
    polygonVerticesRef.current.pop();
    notifyDrawState();
    updatePreview();
  }, [notifyDrawState, updatePreview]);

  const setCircleRadiusMeters = useCallback(
    (meters: number) => {
      if (!Number.isFinite(meters) || meters < 5) return;
      circleRadiusRef.current = meters;
      notifyDrawState();
      updatePreview();
    },
    [notifyDrawState, updatePreview],
  );

  const applyCircle = useCallback((): boolean => {
    if (!circleCenterRef.current) return false;
    const [lng, lat] = circleCenterRef.current;
    const radiusMeters = Math.max(circleRadiusRef.current, 5);
    const geojson = circleFeatureCollection(lng, lat, radiusMeters, { kind: "circle" });
    onDrawCompleteRef.current?.({ kind: "circle", geojson, radiusMeters });
    clearDraw();
    return true;
  }, [clearDraw]);

  const finishPolygonRef = useRef(finishPolygon);
  finishPolygonRef.current = finishPolygon;

  const fitBounds = useCallback(
    (
      bounds: [[number, number], [number, number]],
      padding = 56,
      maxZoom = 15,
    ) => {
      const map = mapRef.current;
      if (!map || status !== "ready") return;
      map.fitBounds(bounds, { padding, duration: 900, maxZoom });
    },
    [status],
  );

  useImperativeHandle(
    ref,
    () => ({
      finishPolygon,
      cancelDraw: clearDraw,
      undoPolygonVertex,
      setCircleRadiusMeters,
      applyCircle,
      fitBounds,
    }),
    [finishPolygon, clearDraw, undoPolygonVertex, setCircleRadiusMeters, applyCircle, fitBounds],
  );

  useEffect(() => {
    clearDraw();
    const map = mapRef.current;
    if (map && status === "ready") {
      if (drawMode === "polygon") {
        map.doubleClickZoom.disable();
        map.getCanvas().style.cursor = "crosshair";
      } else {
        map.doubleClickZoom.enable();
        map.getCanvas().style.cursor = drawMode === "circle" || drawMode === "point" ? "crosshair" : "";
      }
    }
  }, [drawMode, clearDraw, status]);

  const initialCenter =
    center && center[0] != null && center[1] != null ? center : DEFAULT_CENTER;
  const initialZoom =
    center && center[0] != null && center[1] != null ? Math.max(zoom, 10) : DEFAULT_ZOOM;

  useEffect(() => {
    let map: MaplibreMap | null = null;
    let disposed = false;
    let removeResizeListener: (() => void) | undefined;

    async function init() {
      try {
        setStatus("loading");
        const maplibregl = await loadMapLibre();
        maplibreRef.current = maplibregl;
        if (disposed || !containerRef.current) return;

        map = new maplibregl.Map({
          container: containerRef.current,
          style: mapStyleForTheme("light"),
          center: initialCenter,
          zoom: initialZoom,
          minZoom: MAP_VIEW_MIN_ZOOM,
          maxZoom: MAP_VIEW_MAX_ZOOM,
          attributionControl: { compact: true },
        });

        map.addControl(
          new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }),
          "top-right",
        );

        map.on("load", () => {
          if (!map || disposed) return;
          reapplyMapState(map);
          map.resize();
          setStatus("ready");
        });

        map.on("click", (e) => {
          const lng = e.lngLat.lng;
          const lat = e.lngLat.lat;
          const mode = drawModeRef.current;

          if (mode === "polygon") {
            if (tooCloseToLastVertex(polygonVerticesRef.current, lng, lat)) return;
            polygonVerticesRef.current.push([lng, lat]);
            notifyDrawState();
            updatePreview();
            return;
          }

          if (mode === "circle") {
            if (!circleCenterRef.current) {
              circleCenterRef.current = [lng, lat];
              circleRadiusRef.current = 500;
              notifyDrawState();
              updatePreview();
              return;
            }
            const [clng, clat] = circleCenterRef.current;
            const radiusMeters = distanceMeters(clng, clat, lng, lat);
            if (radiusMeters < 5) return;
            circleRadiusRef.current = radiusMeters;
            notifyDrawState();
            updatePreview();
            return;
          }

          if (mode === "none" || mode === "point") {
            const m = mapRef.current;
            if (!m) return;
            const routeHits = m.queryRenderedFeatures(e.point, {
              layers: ["ic-map-route-lines"],
            });
            const top = routeHits[0];
            const variantId = top?.properties?.variantId;
            if (typeof variantId === "string" && onRouteLineClickRef.current) {
              const routeId = top.properties?.routeId;
              onRouteLineClickRef.current({
                routeId: typeof routeId === "string" ? routeId : undefined,
                variantId,
              });
              return;
            }
            onMapClickRef.current?.(lng, lat);
          }
        });

        map.on("mouseenter", "ic-map-route-lines", () => {
          const m = mapRef.current;
          if (!m) return;
          if (drawModeRef.current === "none" || drawModeRef.current === "point") {
            m.getCanvas().style.cursor = "pointer";
          }
        });
        map.on("mouseleave", "ic-map-route-lines", () => {
          const m = mapRef.current;
          if (!m) return;
          if (drawModeRef.current === "none") {
            m.getCanvas().style.cursor = "";
          }
        });

        map.on("mousemove", (e) => {
          const mode = drawModeRef.current;
          if (mode === "polygon" || (mode === "circle" && circleCenterRef.current)) {
            cursorRef.current = [e.lngLat.lng, e.lngLat.lat];
            if (mode === "circle" && circleCenterRef.current) {
              const [clng, clat] = circleCenterRef.current;
              circleRadiusRef.current = distanceMeters(clng, clat, e.lngLat.lng, e.lngLat.lat);
              notifyDrawState();
            }
            updatePreview();
          }
        });

        map.on("dblclick", (e) => {
          if (drawModeRef.current === "polygon") {
            e.preventDefault();
            finishPolygonRef.current();
          }
        });

        mapRef.current = map;
        const onResize = () => map?.resize();
        window.addEventListener("resize", onResize);
        removeResizeListener = () => window.removeEventListener("resize", onResize);
        requestAnimationFrame(() => map?.resize());
      } catch (err) {
        if (!disposed) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "Could not start map");
        }
      }
    }

    void init();

    return () => {
      disposed = true;
      removeResizeListener?.();
      incidentPinRef.current?.remove();
      incidentPinRef.current = null;
      map?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per mount
  }, []);

  const centerLng = center?.[0] ?? null;
  const centerLat = center?.[1] ?? null;

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready" || centerLng == null || centerLat == null) return;
    map.flyTo({
      center: [centerLng, centerLat],
      zoom: Math.max(zoom, 10),
      duration: 800,
    });
  }, [centerLng, centerLat, zoom, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    setSourceData(map, SOURCE_OVERLAYS, overlays ?? emptyFeatureCollection());
  }, [overlays, status]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    syncIncidentPin(map);
  }, [incidentMarker, status, syncIncidentPin]);

  useEffect(() => {
    updatePreview();
  }, [drawMode, updatePreview]);

  const appliedBasemapRef = useRef<MapBasemapTheme | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    if (appliedBasemapRef.current === basemapTheme) return;

    const isInitial = appliedBasemapRef.current === null;
    appliedBasemapRef.current = basemapTheme;

    map.setMaxZoom(MAP_VIEW_MAX_ZOOM);
    map.setMinZoom(MAP_VIEW_MIN_ZOOM);

    if (isInitial && basemapTheme === "light") return;

    const onStyleLoad = () => {
      if (!mapRef.current) return;
      mapRef.current.setMaxZoom(MAP_VIEW_MAX_ZOOM);
      reapplyMapState(mapRef.current);
    };

    map.once("style.load", onStyleLoad);
    map.setStyle(mapStyleForTheme(basemapTheme));
  }, [basemapTheme, status, reapplyMapState]);

  return (
    <section className={`map-canvas-host ${className}`}>
      {status !== "ready" ? (
        <p
          className={`map-canvas-status ${status === "error" ? "map-canvas-status--error" : ""}`}
          aria-live="polite"
        >
          {status === "loading" ? "Loading map…" : (errorMessage ?? "Map unavailable")}
        </p>
      ) : null}
      <section ref={containerRef} className="map-canvas-inner" />
    </section>
  );
});

export default MapCanvas;
