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
import {
  mapStyleFor,
  persistMapLayer,
  readStoredMapLayer,
  type MapBasemapLayer,
  type MapBasemapTheme,
} from "@/lib/maps/basemap-theme";
import { MAP_VIEW_MAX_ZOOM, MAP_VIEW_MIN_ZOOM } from "@/lib/maps/osm-style";

const BASEMAP_LAYER_OPTIONS: { id: MapBasemapLayer; label: string }[] = [
  { id: "streets", label: "Map" },
  { id: "satellite", label: "Satellite" },
  { id: "hybrid", label: "Hybrid" },
];

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
  | { kind: "circle"; geojson: FeatureCollection; radiusMeters: number; center: [number, number] };

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
  /** [lng, lat] of an active distress signal — renders a pulsing marker. */
  distressPoint?: [number, number] | null;
  drawMode?: MapDrawMode;
  onDrawComplete?: (result: MapDrawResult) => void;
  onDrawStateChange?: (state: {
    polygonVertexCount: number;
    circleCenterSet: boolean;
    circleRadiusMeters: number;
  }) => void;
  onMapClick?: (lng: number, lat: number) => void;
  /** Fired on every mouse move over the map (browse mode) — for live draw previews. */
  onMapMouseMove?: (lng: number, lat: number) => void;
  /** Fired when the user clicks a saved or draft route line on the map. */
  onRouteLineClick?: (payload: { routeId?: string; variantId: string }) => void;
  basemapTheme?: MapBasemapTheme;
  /** Show the Map/Satellite/Hybrid layer switcher (default true; hide on tiny maps). */
  layerSwitcher?: boolean;
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
        "case",
        ["has", "markerColor"],
        ["get", "markerColor"],
        [
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
    distressPoint,
    drawMode = "none",
    onDrawComplete,
    onDrawStateChange,
    onMapClick,
    onMapMouseMove,
    onRouteLineClick,
    basemapTheme = "light",
    layerSwitcher = true,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const onMapClickRef = useRef(onMapClick);
  const onMapMouseMoveRef = useRef(onMapMouseMove);
  const onRouteLineClickRef = useRef(onRouteLineClick);
  const onDrawCompleteRef = useRef(onDrawComplete);
  const onDrawStateChangeRef = useRef(onDrawStateChange);
  const drawModeRef = useRef(drawMode);

  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [basemapLayer, setBasemapLayer] = useState<MapBasemapLayer>("streets");

  // Restore the last chosen imagery layer (streets/satellite/hybrid) after mount.
  useEffect(() => {
    setBasemapLayer(readStoredMapLayer());
  }, []);

  const selectLayer = useCallback((next: MapBasemapLayer) => {
    setBasemapLayer(next);
    persistMapLayer(next);
  }, []);

  const polygonVerticesRef = useRef<[number, number][]>([]);
  const circleCenterRef = useRef<[number, number] | null>(null);
  const circleRadiusRef = useRef(500);
  /** True while the circle radius is following the mouse (after the centre click, before it's locked). */
  const circleLiveRef = useRef(false);
  const cursorRef = useRef<Position | null>(null);
  const maplibreRef = useRef<MaplibreModule | null>(null);
  const radiusLabelRef = useRef<MaplibreMarker | null>(null);
  const incidentPinRef = useRef<MaplibreMarker | null>(null);
  const distressPinRef = useRef<MaplibreMarker | null>(null);
  const unitLabelsRef = useRef<Map<string, MaplibreMarker>>(new Map());
  const overlaysRef = useRef(overlays);
  const incidentMarkerRef = useRef(incidentMarker);
  const distressPointRef = useRef(distressPoint);

  overlaysRef.current = overlays;
  incidentMarkerRef.current = incidentMarker;
  distressPointRef.current = distressPoint;

  onMapClickRef.current = onMapClick;
  onMapMouseMoveRef.current = onMapMouseMove;
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

  const syncDistressPin = useCallback((map: MaplibreMap) => {
    const ml = maplibreRef.current;
    if (!ml) return;
    const coords = distressPointRef.current;
    if (coords && coords[0] != null && coords[1] != null) {
      if (!distressPinRef.current) {
        const el = document.createElement("div");
        el.className = "ic-map-distress-marker";
        el.innerHTML = '<span class="ic-map-distress-marker__ring"></span><span class="ic-map-distress-marker__dot"></span>';
        distressPinRef.current = new ml.Marker({ element: el }).setLngLat(coords);
      } else {
        distressPinRef.current.setLngLat(coords);
      }
      distressPinRef.current.addTo(map);
      return;
    }
    distressPinRef.current?.remove();
    distressPinRef.current = null;
  }, []);

  /**
   * Text labels (callsigns) beside each field-unit dot. Rendered as DOM markers rather than a
   * GL symbol layer so they need no font glyphs. Keyed by callsign; diffed each overlay update.
   */
  const syncUnitLabels = useCallback((map: MaplibreMap) => {
    const ml = maplibreRef.current;
    if (!ml) return;
    const desired = new Map<string, { coords: [number, number]; color: string }>();
    for (const f of overlaysRef.current?.features ?? []) {
      const p = (f.properties ?? {}) as Record<string, unknown>;
      if (p.copLayer !== "units" || f.geometry?.type !== "Point") continue;
      const label = String(p.label ?? "").trim();
      if (!label) continue;
      desired.set(label, {
        coords: f.geometry.coordinates as [number, number],
        color: typeof p.markerColor === "string" ? p.markerColor : "#16a34a",
      });
    }
    const markers = unitLabelsRef.current;
    for (const [label, marker] of markers) {
      if (!desired.has(label)) {
        marker.remove();
        markers.delete(label);
      }
    }
    for (const [label, { coords, color }] of desired) {
      let marker = markers.get(label);
      if (!marker) {
        const el = document.createElement("div");
        el.className = "ic-map-unit-label";
        marker = new ml.Marker({ element: el, anchor: "left", offset: [9, 0] }).setLngLat(coords);
        markers.set(label, marker);
      } else {
        marker.setLngLat(coords);
      }
      const el = marker.getElement();
      el.textContent = label;
      el.style.setProperty("--ic-unit-color", color);
      marker.addTo(map);
    }
  }, []);

  const notifyDrawState = useCallback(() => {
    onDrawStateChangeRef.current?.({
      polygonVertexCount: polygonVerticesRef.current.length,
      circleCenterSet: circleCenterRef.current != null,
      circleRadiusMeters: circleRadiusRef.current,
    });
  }, []);

  /**
   * Live radius readout pinned to the circle centre so the operator sees the size
   * as they draw. A DOM marker (not a GL symbol layer) so it needs no font glyphs.
   */
  const syncRadiusLabel = useCallback(
    (map: MaplibreMap, center: [number, number] | null, radiusMeters: number) => {
      const ml = maplibreRef.current;
      if (!ml) return;
      if (!center) {
        radiusLabelRef.current?.remove();
        radiusLabelRef.current = null;
        return;
      }
      const text =
        radiusMeters >= 1000
          ? `${(radiusMeters / 1000).toFixed(radiusMeters >= 10000 ? 0 : 1)} km`
          : `${Math.round(radiusMeters)} m`;
      if (!radiusLabelRef.current) {
        const el = document.createElement("div");
        el.className = "ic-map-radius-label";
        radiusLabelRef.current = new ml.Marker({
          element: el,
          anchor: "bottom",
          offset: [0, -12],
        }).setLngLat(center);
      } else {
        radiusLabelRef.current.setLngLat(center);
      }
      radiusLabelRef.current.getElement().textContent = `r ${text}`;
      radiusLabelRef.current.addTo(map);
    },
    [],
  );

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
      syncRadiusLabel(map, [lng, lat], r);
    } else {
      syncRadiusLabel(map, null, 0);
    }

    setSourceData(map, SOURCE_PREVIEW, { type: "FeatureCollection", features });
  }, [status, syncRadiusLabel]);

  const reapplyMapState = useCallback(
    (map: MaplibreMap) => {
      removeOverlayLayers(map);
      installOverlayLayers(map);
      setSourceData(map, SOURCE_OVERLAYS, overlaysRef.current ?? emptyFeatureCollection());
      syncIncidentPin(map);
      syncUnitLabels(map);
      updatePreview();
    },
    [syncIncidentPin, syncUnitLabels, updatePreview],
  );

  const clearDraw = useCallback(() => {
    polygonVerticesRef.current = [];
    circleCenterRef.current = null;
    circleRadiusRef.current = 500;
    circleLiveRef.current = false;
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
      circleLiveRef.current = false; // manual control takes over from the mouse
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
    onDrawCompleteRef.current?.({ kind: "circle", geojson, radiusMeters, center: [lng, lat] });
    clearDraw();
    return true;
  }, [clearDraw]);

  const finishPolygonRef = useRef(finishPolygon);
  finishPolygonRef.current = finishPolygon;

  // The map event handlers are registered once at mount (init effect), so they
  // capture the FIRST updatePreview closure — where `status` is still "loading" and
  // it early-returns. Call it through a live ref so the handlers always run the
  // current version (this is what makes the draw preview + radius label update live).
  const updatePreviewRef = useRef(updatePreview);
  updatePreviewRef.current = updatePreview;

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
          style: mapStyleFor("streets", "light"),
          center: initialCenter,
          zoom: initialZoom,
          minZoom: MAP_VIEW_MIN_ZOOM,
          maxZoom: MAP_VIEW_MAX_ZOOM,
          attributionControl: { compact: true },
        });

        // Bottom-left keeps zoom + compass clear of the top-left basemap switcher,
        // the left tool palette (vertically centered) and the top-right layers panel.
        map.addControl(
          new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }),
          "bottom-left",
        );

        // Readiness is driven by the poll effect below (which watches the live map
        // ref), not the "load" event — under React's dev double-mount the event can
        // fire on an already-disposed instance and leave status stuck on "loading",
        // which would kill every overlay + the draw preview.

        map.on("click", (e) => {
          const lng = e.lngLat.lng;
          const lat = e.lngLat.lat;
          const mode = drawModeRef.current;

          if (mode === "polygon") {
            if (tooCloseToLastVertex(polygonVerticesRef.current, lng, lat)) return;
            polygonVerticesRef.current.push([lng, lat]);
            notifyDrawState();
            updatePreviewRef.current();
            return;
          }

          if (mode === "circle") {
            if (!circleCenterRef.current) {
              // First click: drop the centre and start sizing the radius with the mouse.
              circleCenterRef.current = [lng, lat];
              circleRadiusRef.current = 100;
              circleLiveRef.current = true;
              notifyDrawState();
              updatePreviewRef.current();
              return;
            }
            // Second click: lock the radius at the current size (mouse stops resizing it).
            const [clng, clat] = circleCenterRef.current;
            const radiusMeters = distanceMeters(clng, clat, lng, lat);
            if (radiusMeters < 5) return;
            circleRadiusRef.current = radiusMeters;
            circleLiveRef.current = false;
            notifyDrawState();
            updatePreviewRef.current();
            return;
          }

          if (mode === "none" || mode === "point") {
            const m = mapRef.current;
            if (!m) return;
            // Guard: querying a layer that isn't in the style throws. The route line
            // layer only exists when routes are drawn — skip the hit-test otherwise.
            const routeHits = m.getLayer("ic-map-route-lines")
              ? m.queryRenderedFeatures(e.point, { layers: ["ic-map-route-lines"] })
              : [];
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

        map.on("mousemove", (e) => {
          const lng = e.lngLat.lng;
          const lat = e.lngLat.lat;
          const mode = drawModeRef.current;

          // Live radius preview: while ACTIVELY sizing a circle (after the centre
          // click, before it's locked by the second click or the slider), grow it to
          // the cursor. Once locked (circleLiveRef=false) the mouse must NOT resize it.
          if (mode === "circle" && circleCenterRef.current && circleLiveRef.current) {
            const [clng, clat] = circleCenterRef.current;
            const r = distanceMeters(clng, clat, lng, lat);
            if (r >= 5) {
              circleRadiusRef.current = r;
              notifyDrawState();
              updatePreviewRef.current();
            }
          }

          // Polygon rubber-band: track the cursor for the live edge/fill preview.
          if (mode === "polygon") {
            cursorRef.current = [lng, lat];
            updatePreviewRef.current();
          }

          onMapMouseMoveRef.current?.(lng, lat);
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
      distressPinRef.current?.remove();
      distressPinRef.current = null;
      map?.remove();
      mapRef.current = null;
      maplibreRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per mount
  }, []);

  // Mark the map ready by polling the LIVE map ref, not the async init's "load"
  // event. React's dev double-mount can fire "load" on a disposed instance, leaving
  // status stuck on "loading" (dead overlays + no draw preview). Polling the current
  // mapRef sidesteps that: whichever map instance actually survives gets readied.
  useEffect(() => {
    if (status === "ready") return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const check = () => {
      if (cancelled) return;
      const map = mapRef.current;
      // isStyleLoaded() is the precondition for adding our overlay sources/layers —
      // it's true once the style is applied, without waiting on every tile fetch.
      if (map && map.isStyleLoaded()) {
        reapplyMapState(map);
        map.resize();
        setStatus("ready");
        return;
      }
      timer = setTimeout(check, 100);
    };
    timer = setTimeout(check, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, reapplyMapState]);

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
    syncUnitLabels(map);
  }, [overlays, status, syncUnitLabels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    syncIncidentPin(map);
  }, [incidentMarker, status, syncIncidentPin]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    syncDistressPin(map);
  }, [distressPoint, status, syncDistressPin]);

  useEffect(() => {
    updatePreview();
  }, [drawMode, updatePreview]);

  // Applied basemap = imagery layer + light/dark theme. Keyed as one string so a
  // change to EITHER re-styles the map (and re-installs overlays on style.load).
  const appliedBasemapRef = useRef<string | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || status !== "ready") return;
    const key = `${basemapLayer}:${basemapTheme}`;
    if (appliedBasemapRef.current === key) return;

    const isInitial = appliedBasemapRef.current === null;
    appliedBasemapRef.current = key;

    map.setMaxZoom(MAP_VIEW_MAX_ZOOM);
    map.setMinZoom(MAP_VIEW_MIN_ZOOM);

    // The map is created with streets+light already — skip a redundant restyle.
    if (isInitial && key === "streets:light") return;

    const onStyleLoad = () => {
      if (!mapRef.current) return;
      mapRef.current.setMaxZoom(MAP_VIEW_MAX_ZOOM);
      reapplyMapState(mapRef.current);
    };

    map.once("style.load", onStyleLoad);
    map.setStyle(mapStyleFor(basemapLayer, basemapTheme));
  }, [basemapLayer, basemapTheme, status, reapplyMapState]);

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
      {layerSwitcher && status !== "error" ? (
        <div className="ic-map-layer-switch" role="group" aria-label="Map imagery layer">
          {BASEMAP_LAYER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`ic-map-layer-switch__btn${basemapLayer === opt.id ? " ic-map-layer-switch__btn--active" : ""}`}
              aria-pressed={basemapLayer === opt.id}
              onClick={() => selectLayer(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
      <section ref={containerRef} className="map-canvas-inner" />
    </section>
  );
});

export default MapCanvas;
