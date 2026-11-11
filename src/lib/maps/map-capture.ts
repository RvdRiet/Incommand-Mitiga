import type { Feature, FeatureCollection, Point } from "geojson";

import { mapStyleFor, type MapBasemapLayer } from "./basemap-theme";

/**
 * Render a throwaway, off-screen MapLibre map and grab it as a PNG data-URL for
 * embedding in the situation-report PDF. Everything must be a GL LAYER, not a DOM
 * marker — `canvas.toDataURL()` only captures the WebGL canvas, so DOM markers
 * (incident pin, unit labels) would be invisible. We therefore render the incident
 * pin + all COP points as circle-layer features.
 *
 * Requires `preserveDrawingBuffer: true` (otherwise the buffer is cleared before we
 * can read it). Needs basemap tiles, so it only produces a real image online; on a
 * tile failure it still returns whatever rendered (may be blank) or null on error.
 */
export async function captureIncidentMapImage(opts: {
  center: [number, number];
  overlays: FeatureCollection;
  incidentMarker?: [number, number] | null;
  zoom?: number;
  width?: number;
  height?: number;
  timeoutMs?: number;
  /** Basemap imagery: "streets" (default, SITREP COP), "satellite" or "hybrid". */
  layer?: MapBasemapLayer;
  /** Output format. JPEG is far smaller — use it when the image is persisted (localStorage/DB). */
  format?: "png" | "jpeg";
  /** JPEG quality 0–1 (ignored for PNG). */
  quality?: number;
}): Promise<string | null> {
  const {
    center,
    overlays,
    incidentMarker,
    zoom = 12,
    width = 960,
    height = 540,
    timeoutMs = 9000,
    layer = "streets",
    format = "png",
    quality = 0.75,
  } = opts;
  if (typeof window === "undefined" || typeof document === "undefined") return null;

  const mod = await import("maplibre-gl");
  const maplibregl = (mod as unknown as { default?: typeof mod }).default ?? mod;

  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;pointer-events:none;`;
  document.body.appendChild(container);

  let map: import("maplibre-gl").Map | null = null;
  try {
    // `preserveDrawingBuffer` is a valid MapLibre option but is missing from some
    // versions' MapOptions type — it's REQUIRED for getCanvas().toDataURL() to work.
    map = new maplibregl.Map({
      container,
      style: mapStyleFor(layer, "light"),
      center,
      zoom,
      interactive: false,
      attributionControl: false,
      fadeDuration: 0,
      preserveDrawingBuffer: true,
    } as ConstructorParameters<typeof maplibregl.Map>[0] & { preserveDrawingBuffer: boolean });

    // Wait for the style to load.
    await withTimeout(
      new Promise<void>((resolve) => map!.once("load", () => resolve())),
      timeoutMs,
    );

    // Merge the incident pin into the overlay features as a GL circle.
    const features: Feature[] = [...overlays.features];
    if (incidentMarker) {
      features.push({
        type: "Feature",
        properties: { markerColor: "#e11d48", incidentPin: true },
        geometry: { type: "Point", coordinates: incidentMarker } as Point,
      });
    }
    map.addSource("sitrep", { type: "geojson", data: { type: "FeatureCollection", features } });
    map.addLayer({
      id: "sitrep-fill",
      type: "fill",
      source: "sitrep",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": ["coalesce", ["get", "fillColor"], "#0d9488"], "fill-opacity": 0.22 },
    });
    map.addLayer({
      id: "sitrep-line",
      type: "line",
      source: "sitrep",
      filter: ["any", ["==", ["geometry-type"], "Polygon"], ["==", ["geometry-type"], "LineString"]],
      paint: {
        "line-color": ["coalesce", ["get", "strokeColor"], "#0d9488"],
        "line-width": ["coalesce", ["get", "lineWidth"], 2.5],
        "line-opacity": ["coalesce", ["get", "lineOpacity"], 1],
      },
    });
    map.addLayer({
      id: "sitrep-points",
      type: "circle",
      source: "sitrep",
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": ["case", ["==", ["get", "incidentPin"], true], 8, 6],
        "circle-color": ["coalesce", ["get", "markerColor"], "#0284c7"],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });

    // Let tiles + layers settle, then capture.
    await withTimeout(new Promise<void>((resolve) => map!.once("idle", () => resolve())), timeoutMs).catch(
      () => {},
    );
    await new Promise((r) => setTimeout(r, 350));
    map.triggerRepaint();
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    const dataUrl =
      format === "jpeg"
        ? map.getCanvas().toDataURL("image/jpeg", quality)
        : map.getCanvas().toDataURL("image/png");
    return dataUrl && dataUrl.length > 2000 ? dataUrl : null;
  } catch {
    return null;
  } finally {
    try {
      map?.remove();
    } catch {
      /* ignore */
    }
    container.remove();
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}
