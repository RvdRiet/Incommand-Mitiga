"use client";

import { useCallback, useEffect, useState } from "react";

import {
  contrastBasemapStyle,
  primaryTileUrlForTheme,
  tileZoomForUrl,
  type MapBasemapTheme,
} from "./osm-style";

export type { MapBasemapTheme };

const STORAGE_KEY = "ic-map-basemap-theme";

export function tileUrlForTheme(theme: MapBasemapTheme): string {
  return primaryTileUrlForTheme(theme);
}

export function tileZoomForTheme(theme: MapBasemapTheme) {
  return tileZoomForUrl(tileUrlForTheme(theme));
}

export function mapStyleForTheme(theme: MapBasemapTheme) {
  return contrastBasemapStyle(theme);
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
