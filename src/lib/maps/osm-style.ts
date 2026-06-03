export type MapBasemapTheme = "light" | "dark";

/** MapLibre max zoom — street maps are sharpest through zoom 19–20. */
export const MAP_VIEW_MAX_ZOOM = 20;
export const MAP_VIEW_MIN_ZOOM = 0;

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

type BasemapRasterLayer = {
  sourceId: string;
  layerId: string;
  tiles: string[];
  tileMaxZoom: number;
};

function inferTileMaxZoom(tileUrl: string): number {
  if (tileUrl.includes("openstreetmap.org")) return 19;
  if (
    tileUrl.includes("arcgisonline.com") ||
    tileUrl.includes("maptiler.com") ||
    tileUrl.includes("googleapis.com") ||
    tileUrl.includes("cartocdn.com")
  ) {
    return 20;
  }
  return 19;
}

function buildRasterStyle(layers: BasemapRasterLayer[], name: string) {
  const sources: Record<
    string,
    { type: "raster"; tiles: string[]; tileSize: number; maxzoom: number; attribution?: string }
  > = {};
  const mapLayers: {
    id: string;
    type: "raster";
    source: string;
    minzoom: number;
    maxzoom: number;
  }[] = [];

  for (const layer of layers) {
    sources[layer.sourceId] = {
      type: "raster",
      tiles: layer.tiles,
      tileSize: 256,
      maxzoom: layer.tileMaxZoom,
      attribution: ATTRIBUTION,
    };
    mapLayers.push({
      id: layer.layerId,
      type: "raster",
      source: layer.sourceId,
      minzoom: MAP_VIEW_MIN_ZOOM,
      maxzoom: MAP_VIEW_MAX_ZOOM,
    });
  }

  return {
    version: 8 as const,
    name,
    sources,
    layers: mapLayers,
  };
}

function maptilerKey(): string | undefined {
  return process.env.NEXT_PUBLIC_MAPTILER_API_KEY?.trim() || undefined;
}

/** Google Maps–style light streets (MapTiler when keyed, else Esri World Street Map). */
function lightBasemapLayers(): BasemapRasterLayer[] {
  const custom = process.env.NEXT_PUBLIC_OSM_TILE_URL?.trim();
  if (custom) {
    return [
      {
        sourceId: "basemap-light",
        layerId: "basemap-light",
        tiles: [custom],
        tileMaxZoom: inferTileMaxZoom(custom),
      },
    ];
  }

  const key = maptilerKey();
  if (key) {
    const url = `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${key}`;
    return [
      { sourceId: "basemap-light", layerId: "basemap-light", tiles: [url], tileMaxZoom: 20 },
    ];
  }

  return [
    {
      sourceId: "basemap-light",
      layerId: "basemap-light",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
      ],
      tileMaxZoom: 20,
    },
  ];
}

/** Google Maps–style dark streets (MapTiler dark when keyed, else Esri Dark Gray base + reference). */
function darkBasemapLayers(): BasemapRasterLayer[] {
  const custom = process.env.NEXT_PUBLIC_OSM_TILE_DARK_URL?.trim();
  if (custom) {
    return [
      {
        sourceId: "basemap-dark",
        layerId: "basemap-dark",
        tiles: [custom],
        tileMaxZoom: inferTileMaxZoom(custom),
      },
    ];
  }

  const key = maptilerKey();
  if (key) {
    const url = `https://api.maptiler.com/maps/streets-v2-dark/256/{z}/{x}/{y}.png?key=${key}`;
    return [
      { sourceId: "basemap-dark", layerId: "basemap-dark", tiles: [url], tileMaxZoom: 20 },
    ];
  }

  return [
    {
      sourceId: "basemap-dark-base",
      layerId: "basemap-dark-base",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
      ],
      tileMaxZoom: 20,
    },
    {
      sourceId: "basemap-dark-ref",
      layerId: "basemap-dark-ref",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
      ],
      tileMaxZoom: 20,
    },
  ];
}

/** Unified basemap — full-color roads, buildings, and labels (no contrast filters). */
export function contrastBasemapStyle(theme: MapBasemapTheme) {
  if (theme === "light") {
    return buildRasterStyle(lightBasemapLayers(), "InCommand Streets Light");
  }
  return buildRasterStyle(darkBasemapLayers(), "InCommand Streets Dark");
}

/** @deprecated Use contrastBasemapStyle. */
export function defaultOsmRasterStyle(tileUrl: string) {
  const tileMaxZoom = inferTileMaxZoom(tileUrl);
  return buildRasterStyle(
    [{ sourceId: "osm", layerId: "osm", tiles: [tileUrl], tileMaxZoom }],
    "InCommand OSM",
  );
}

export function tileZoomForUrl(tileUrl: string) {
  return { tile: inferTileMaxZoom(tileUrl), layer: MAP_VIEW_MAX_ZOOM };
}

export function primaryTileUrlForTheme(theme: MapBasemapTheme): string {
  const layers = theme === "light" ? lightBasemapLayers() : darkBasemapLayers();
  return layers[0]!.tiles[0]!;
}
