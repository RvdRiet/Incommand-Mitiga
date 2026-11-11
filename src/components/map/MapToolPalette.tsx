"use client";

import type { MapBasemapTheme } from "@/lib/maps/basemap-theme";
import { IconCompass, IconMapPin, IconRoad, IconRoute, IconSun } from "@/components/dashboard/icons";

import type { MapTool } from "./MapDrawingToolbar";

/** Simple glyphs for the shapes that have no named icon. */
function PolygonGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M12 3l8 5.5-3 10.5H7L4 8.5 12 3z" strokeLinejoin="round" />
    </svg>
  );
}
function CircleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}
function MoonGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 7 7 0 1 0 20 14.5z" strokeLinejoin="round" />
    </svg>
  );
}

type ToolDef = { id: MapTool; label: string; icon: React.ReactNode };

const TOOLS: ToolDef[] = [
  { id: "none", label: "Browse — pan & zoom", icon: <IconCompass /> },
  { id: "location", label: "Set incident location", icon: <IconMapPin /> },
  { id: "polygon", label: "Draw area (polygon)", icon: <PolygonGlyph /> },
  { id: "circle", label: "Draw radius (circle)", icon: <CircleGlyph /> },
  { id: "road-damage", label: "Plot road damage", icon: <IconRoad /> },
  { id: "route", label: "Plan routes", icon: <IconRoute /> },
];

type Props = {
  tool: MapTool;
  onToolChange: (tool: MapTool) => void;
  basemapTheme: MapBasemapTheme;
  onBasemapThemeToggle: () => void;
};

/** Floating vertical icon toolbar — the primary way to pick a map tool (map-first layout). */
export function MapToolPalette({ tool, onToolChange, basemapTheme, onBasemapThemeToggle }: Props) {
  return (
    <div className="ic-map-palette" role="toolbar" aria-label="Map tools" aria-orientation="vertical">
      {TOOLS.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`ic-map-palette__btn${tool === t.id ? " ic-map-palette__btn--active" : ""}`}
          aria-pressed={tool === t.id}
          aria-label={t.label}
          title={t.label}
          onClick={() => onToolChange(t.id)}
        >
          {t.icon}
        </button>
      ))}
      <span className="ic-map-palette__divider" aria-hidden />
      <button
        type="button"
        className="ic-map-palette__btn"
        aria-pressed={basemapTheme === "dark"}
        aria-label={basemapTheme === "dark" ? "Switch to light basemap" : "Switch to dark basemap"}
        title={basemapTheme === "dark" ? "Light basemap" : "Dark basemap"}
        onClick={onBasemapThemeToggle}
      >
        {basemapTheme === "dark" ? <IconSun /> : <MoonGlyph />}
      </button>
    </div>
  );
}
