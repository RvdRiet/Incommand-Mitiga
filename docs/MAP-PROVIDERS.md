# Map provider abstraction

InCommand Mitiga uses a **dual-provider** model: inexpensive global **basemaps** (OSM-compatible tiles) and **licensed routing / traffic** APIs that can be swapped per deployment or region.

## Goals

- Keep **MapLibre** (or Leaflet) as the primary **client renderer**.
- Avoid hard-coding Google-specific calls throughout the UI.
- Support **quota awareness**, **caching**, and **graceful fallback** when a provider errors or exhausts quota.

## Interfaces

### 1. `BasemapProvider`

| Method | Purpose |
|--------|---------|
| `getRasterStyle()` | Returns MapLibre `style` JSON or URL list for raster tiles |
| `attributionHtml()` | Required attribution string (OSM ODbL, provider terms) |

**Default implementation:** `OpenStreetMapRasterProvider` — uses public tile endpoints from env `NEXT_PUBLIC_OSM_TILE_URL` (template with `{z}/{x}/{y}`).

**Operational note:** Heavy use of `tile.openstreetmap.org` is discouraged by OSM usage policy; production should use **self-hosted tiles**, **MapTiler**, **Protomaps**, or another CDN with capacity planning.

### 2. `RoutingProvider`

| Method | Purpose |
|--------|---------|
| `getDirections(request)` | Turn-by-turn or path geometry between coordinates |
| `estimateTrafficAlong(polyline)` | Optional; returns qualitative segment metadata |

**Implementations:**

- `GoogleRoutesProvider` — when `GOOGLE_MAPS_API_KEY` is set; uses Routes API / Directions HTTP (server-side only; never expose unrestricted keys to the client).
- `NoopRoutingProvider` — returns empty / “routing disabled” for dev without keys.

### 3. `TrafficSummaryProvider`

Often merged with routing. Returns a **short text summary** + **severity hint** for dashboard panel (not a second-by-second guarantee).

## Caching and quotas

| Layer | Strategy |
|-------|----------|
| Directions for same OD pair | Server cache **5–15 minutes** keyed by rounded coordinates (4–5 decimals) + profile |
| Traffic snapshot | **60–120 seconds** cache per bounding box cell (e.g. geohash precision 6) |
| Tile requests | CDN/browser cache headers; avoid double-proxying tiles through app origin |

On **429 / quota** errors: fall back to `NoopRoutingProvider` response and surface UI banner “Traffic/routing temporarily unavailable”.

## Fallback chain

1. If Google key missing → skip Google; OSM basemap only.
2. If Google errors → retry once with jitter; then noop.
3. Optional env `MAP_ROUTING_PROVIDER=mapbox|here|google` selects implementation (Phase 1 ships `google` + `noop` only; others stub).

## Security

- All billable provider calls run **server-side** (`/api/...` Route Handlers or server actions).
- Client receives only **opaque session tokens** or **GeoJSON results**, not raw API keys.

## Code location

- Types and factory: [`src/lib/maps/providers.ts`](../src/lib/maps/providers.ts)
- Map style snippet: [`src/lib/maps/osm-style.ts`](../src/lib/maps/osm-style.ts)
- API route example: [`src/app/api/map/config/route.ts`](../src/app/api/map/config/route.ts)
