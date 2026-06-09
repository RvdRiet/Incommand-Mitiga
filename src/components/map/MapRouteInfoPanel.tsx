"use client";

import type { SupplyRoute } from "@/lib/maps/routing-types";

function formatKm(m: number) {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatDuration(sec: number) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

type MapRouteInfoPanelProps = {
  route: SupplyRoute;
  onClose: () => void;
  onDelete: () => void;
  onEdit?: () => void;
};

export function MapRouteInfoPanel({ route, onClose, onDelete, onEdit }: MapRouteInfoPanelProps) {
  const variant =
    route.variants.find((v) => v.id === route.selectedVariantId) ?? route.variants[0];

  return (
    <aside className="ic-route-info" aria-label={`Route: ${route.name}`}>
      <div className="ic-route-info__head">
        <h3 className="ic-route-info__title">{route.name}</h3>
        <button type="button" className="ic-route-info__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>

      <p className="ic-route-info__meta">
        <span className={`ic-route-status ic-route-status--${route.status}`}>{route.status}</span>
        {route.purpose ? ` · ${route.purpose}` : null}
      </p>

      <div className="ic-route-info__locations">
        <div className="ic-route-info__location ic-route-info__location--start">
          <span className="ic-route-info__location-badge" aria-hidden>
            A
          </span>
          <div>
            <strong>Starting location</strong>
            <p>{route.origin.label || "Start point"}</p>
            <p className="ic-route-info__coords">
              {route.origin.lat.toFixed(5)}, {route.origin.lng.toFixed(5)}
            </p>
          </div>
        </div>
        <div className="ic-route-info__location ic-route-info__location--end">
          <span className="ic-route-info__location-badge" aria-hidden>
            B
          </span>
          <div>
            <strong>Ending location</strong>
            <p>{route.destination.label || "End point"}</p>
            <p className="ic-route-info__coords">
              {route.destination.lat.toFixed(5)}, {route.destination.lng.toFixed(5)}
            </p>
          </div>
        </div>
      </div>

      <dl className="ic-route-info__details">
        {route.viaPoints.length > 0 ? (
          <div>
            <dt>Via points</dt>
            <dd>{route.viaPoints.length}</dd>
          </div>
        ) : null}
        {variant ? (
          <div>
            <dt>Selected path</dt>
            <dd>
              {variant.label} · {formatKm(variant.distanceMeters)} ·{" "}
              {formatDuration(variant.durationSeconds)}
            </dd>
          </div>
        ) : null}
        {route.variants.length > 1 ? (
          <div>
            <dt>Alternates saved</dt>
            <dd>{route.variants.length}</dd>
          </div>
        ) : null}
      </dl>

      {route.briefingNotes ? (
        <p className="ic-route-info__briefing">{route.briefingNotes}</p>
      ) : null}

      <div className="ic-route-info__actions">
        {variant?.googleMapsUrl ? (
          <a
            href={variant.googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ic-map-navbar__btn ic-map-navbar__btn--secondary"
          >
            Google Maps
          </a>
        ) : null}
        {onEdit ? (
          <button type="button" className="ic-map-navbar__btn ic-map-navbar__btn--ghost" onClick={onEdit}>
            Edit in planner
          </button>
        ) : null}
        <button
          type="button"
          className="ic-map-navbar__btn ic-map-navbar__btn--ghost ic-route-info__delete"
          onClick={() => {
            if (window.confirm(`Delete route "${route.name}"?`)) onDelete();
          }}
        >
          Delete route
        </button>
      </div>
    </aside>
  );
}
