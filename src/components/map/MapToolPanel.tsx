"use client";

import type { MapTool } from "./MapDrawingToolbar";

type Props = {
  tool: MapTool;
  onCancel: () => void;
  // Polygon
  polygonVertexCount: number;
  onFinishPolygon: () => void;
  onUndoVertex: () => void;
  // Circle
  circleCenterSet: boolean;
  circleRadiusMeters: number;
  onCircleRadiusChange: (meters: number) => void;
  onApplyCircle: () => void;
  // Road damage
  roadDamagePlotted: number;
  onFinishRoadDamage: () => void;
};

/**
 * Compact contextual control bar for the active drawing tool — floats at the bottom
 * of the map so the tool's hint + actions sit over the map (map-first), not in a
 * header above it. Shows nothing for Browse/Route (Route has its own planner panel).
 */
export function MapToolPanel({
  tool,
  onCancel,
  polygonVertexCount,
  onFinishPolygon,
  onUndoVertex,
  circleCenterSet,
  circleRadiusMeters,
  onCircleRadiusChange,
  onApplyCircle,
  roadDamagePlotted,
  onFinishRoadDamage,
}: Props) {
  if (tool === "none" || tool === "route") return null;

  return (
    <div className="ic-map-toolpanel" role="group" aria-label="Drawing tool">
      {tool === "location" ? (
        <>
          <span className="ic-map-toolpanel__hint">Click the map to drop the incident pin.</span>
          <button type="button" className="ic-map-toolpanel__btn ic-map-toolpanel__btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </>
      ) : null}

      {tool === "polygon" ? (
        <>
          <span className="ic-map-toolpanel__hint">
            Click to place corners
            <strong className="ic-map-toolpanel__count">{polygonVertexCount}</strong>
          </span>
          <button
            type="button"
            className="ic-map-toolpanel__btn ic-map-toolpanel__btn--ghost"
            disabled={polygonVertexCount === 0}
            onClick={onUndoVertex}
          >
            Undo
          </button>
          <button
            type="button"
            className="ic-map-toolpanel__btn ic-map-toolpanel__btn--primary"
            disabled={polygonVertexCount < 3}
            onClick={onFinishPolygon}
          >
            Complete area
          </button>
          <button type="button" className="ic-map-toolpanel__btn ic-map-toolpanel__btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </>
      ) : null}

      {tool === "circle" ? (
        <>
          <span className="ic-map-toolpanel__hint">
            {circleCenterSet ? "Size the circle, then save" : "Click the map to set the centre"}
          </span>
          <label className="ic-map-toolpanel__field">
            <span>Radius</span>
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
            <span className="ic-map-toolpanel__unit">m</span>
          </label>
          <button
            type="button"
            className="ic-map-toolpanel__btn ic-map-toolpanel__btn--primary"
            disabled={!circleCenterSet || circleRadiusMeters < 5}
            onClick={onApplyCircle}
          >
            Save zone
          </button>
          <button type="button" className="ic-map-toolpanel__btn ic-map-toolpanel__btn--ghost" onClick={onCancel}>
            Cancel
          </button>
        </>
      ) : null}

      {tool === "road-damage" ? (
        <>
          <span className="ic-map-toolpanel__hint">
            Click roads to plot damage
            <strong className="ic-map-toolpanel__count">{roadDamagePlotted}</strong>
          </span>
          <button
            type="button"
            className="ic-map-toolpanel__btn ic-map-toolpanel__btn--primary"
            onClick={onFinishRoadDamage}
          >
            Done
          </button>
        </>
      ) : null}
    </div>
  );
}
