"use client";

import { useCallback, useEffect, useState } from "react";

import {
  basemapStyleFor,
  contrastBasemapStyle,
  primaryTileUrlForTheme,
  tileZoomForUrl,
  type MapBasemapLayer,
  type MapBasemapTheme,
} from "./osm-style";

export type { MapBasemapLayer, MapBasemapTheme };

const STORAGE_KEY = "ic-map-basemap-theme";
const LAYER_STORAGE_KEY = "ic-map-basemap-layer";

export function tileUrlForTheme(theme: MapBasemapTheme): string {
  return primaryTileUrlForTheme(theme);
}

export function tileZoomForTheme(theme: MapBasemapTheme) {
  return tileZoomForUrl(tileUrlForTheme(theme));
}

export function mapStyleForTheme(theme: MapBasemapTheme) {
  return contrastBasemapStyle(theme);
}

/** Style for the given imagery layer (streets/satellite/hybrid) + light/dark theme. */
export function mapStyleFor(layer: MapBasemapLayer, theme: MapBasemapTheme) {
  return basemapStyleFor(layer, theme);
}

export function readStoredMapLayer(): MapBasemapLayer {
  if (typeof window === "undefined") return "streets";
  try {
    const v = localStorage.getItem(LAYER_STORAGE_KEY);
    return v === "satellite" || v === "hybrid" ? v : "streets";
  } catch {
    return "streets";
  }
}

export function persistMapLayer(layer: MapBasemapLayer) {
  try {
    localStorage.setItem(LAYER_STORAGE_KEY, layer);
  } catch {
    /* ignore quota */
  }
}

export function readStoredMapTheme(): MapBasemapTheme {
  if (typeof window === "undefined") return "light";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function persistMapTheme(theme: MapBasemapTheme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* ignore quota */
  }
}

export function useMapBasemapTheme() {
  const [theme, setThemeState] = useState<MapBasemapTheme>("light");

  useEffect(() => {
    setThemeState(readStoredMapTheme());
  }, []);

  const setTheme = useCallback((next: MapBasemapTheme) => {
    setThemeState(next);
    persistMapTheme(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next: MapBasemapTheme = current === "dark" ? "light" : "dark";
      persistMapTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme };
}
