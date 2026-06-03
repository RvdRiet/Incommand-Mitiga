"use client";

import type { MapBasemapTheme } from "@/lib/maps/basemap-theme";

export type MapTool = "none" | "location" | "polygon" | "circle" | "route";

type MapDrawingToolbarProps = {
  basemapTheme: MapBasemapTheme;
  onBasemapThemeToggle: () => void;
  tool: MapTool;
  onToolChange: (tool: MapTool) => void;
  polygonVertexCount: number;
  onFinishPolygon: () => void;
  onUndoVertex: () => void;
  onCancelDraw: () => void;
  circleCenterSet: boolean;
  circleRadiusMeters: number;
  onCircleRadiusChange: (meters: number) => void;
  onApplyCircle: () => void;
};

const TOOLS: { id: MapTool; label: string; description: string }[] = [
  { id: "none", label: "Browse", description: "Pan and zoom the map" },
  { id: "location", label: "Location", description: "Set incident coordinates" },
  { id: "polygon", label: "Polygon", description: "Draw a planning or affected area" },
  { id: "circle", label: "Radius", description: "Draw a circle by center and radius" },
  { id: "route", label: "Routes", description: "Plan supply routes with diversions and driver links" },
];

export function MapDrawingToolbar({
  basemapTheme,
  onBasemapThemeToggle,
  tool,
  onToolChange,
  polygonVertexCount,
  onFinishPolygon,
  onUndoVertex,
  onCancelDraw,
  circleCenterSet,
  circleRadiusMeters,
  onCircleRadiusChange,
  onApplyCircle,
}: MapDrawingToolbarProps) {
  const activeMeta = TOOLS.find((t) => t.id === tool) ?? TOOLS[0]!;

  return (
    <header className={`ic-map-navbar${basemapTheme === "dark" ? " ic-map-navbar--dark" : ""}`}>
      <div className="ic-map-navbar__head">
        <nav className="ic-map-navbar__tabs" aria-label="Map tools">
          {TOOLS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`ic-map-navbar__tab${tool === t.id ? " ic-map-navbar__tab--active" : ""}`}
              onClick={() => onToolChange(t.id)}
              aria-pressed={tool === t.id}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="ic-map-navbar__theme"
          onClick={onBasemapThemeToggle}
          aria-pressed={basemapTheme === "dark"}
          title={basemapTheme === "dark" ? "Switch to light basemap" : "Switch to dark basemap"}
        >
          {basemapTheme === "dark" ? "Light map" : "Dark map"}
        </button>
      </div>

      <div className="ic-map-navbar__panel">
        <p className="ic-map-navbar__panel-title">{activeMeta.label}</p>
        <p className="ic-map-navbar__panel-desc">{activeMeta.description}</p>

        {tool === "location" ? (
          <p className="ic-map-navbar__hint">Click anywhere on the map to place the incident pin.</p>
        ) : null}

        {tool === "polygon" ? (
          <div className="ic-map-navbar__controls">
            <p className="ic-map-navbar__hint">
              Click to place corners. Points are numbered on the map. Need at least 3 corners to
              close the shape.
            </p>
            <div className="ic-map-navbar__stat">
              <span className="ic-map-navbar__stat-label">Corners</span>
              <strong>{polygonVertexCount}</strong>
            </div>
            <div className="ic-map-navbar__btn-row">
              <button
                type="button"
                className="ic-map-navbar__btn ic-map-navbar__btn--secondary"
                disabled={polygonVertexCount === 0}
                onClick={onUndoVertex}
              >
                Undo last
              </button>
              <button
                type="button"
                className="ic-map-navbar__btn ic-map-navbar__btn--primary"
                disabled={polygonVertexCount < 3}
                onClick={onFinishPolygon}
              >
                Complete polygon
              </button>
              <button
                type="button"
                className="ic-map-navbar__btn ic-map-navbar__btn--ghost"
                onClick={onCancelDraw}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {tool === "circle" ? (
          <div className="ic-map-navbar__controls">
            <p className="ic-map-navbar__hint">
              {circleCenterSet
                ? "Adjust radius below or click the map to set distance from center."
                : "Click the map to set the circle center."}
            </p>
            <label className="ic-map-navbar__field">
              <span>Radius (meters)</span>
              <input
                type="number"
                min={5}
                step={10}
                value={circleRadiusMeters}
                disabled={!circleCenterSet}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) onCircleRadiusChange(n);
                }}
              />
            </label>
            <div className="ic-map-navbar__btn-row">
              <button
                type="button"
                className="ic-map-navbar__btn ic-map-navbar__btn--primary"
                disabled={!circleCenterSet || circleRadiusMeters < 5}
                onClick={onApplyCircle}
              >
                Save radius zone
              </button>
              <button
                type="button"
                className="ic-map-navbar__btn ic-map-navbar__btn--ghost"
                onClick={onCancelDraw}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {tool === "route" ? (
          <p className="ic-map-navbar__hint">
            Use the floating Route planner panel on the map. Drag it by the title bar to move it.
          </p>
        ) : null}
      </div>
    </header>
  );
}
