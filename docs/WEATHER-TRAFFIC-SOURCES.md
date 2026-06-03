# Weather and traffic data sources

This document locks **Phase 1** data sources, **refresh intervals**, **regional behavior**, and **UI disclaimers** for InCommand Mitiga.

## Principles

- **Provenance:** every widget shows **provider name** and **last updated** (UTC or user locale with TZ label).
- **Not operational guarantees:** weather and traffic are **decision-support only**; incident command remains authoritative on local ground truth.
- **Licensed APIs only** for traffic; no scraping of consumer map sites.

---

## Weather

### United States (including coastal / inland CONUS, AK, HI, territories where APIs apply)

| Layer | Source | Refresh (P1) | Notes |
|-------|--------|----------------|-------|
| **Active alerts** | [api.weather.gov](https://www.weather.gov/documentation/services-web-api) (NWS) | **2 min** poll when dashboard focused; **5 min** background | Official government alerts; handle `User-Agent` per NWS guidance |
| **Point forecast** | NWS `/points/{lat},{lon}` + grid endpoints | **15 min** | Cached per rounded 2-decimal lat/lon cell |
| **Radar mosaic** | Optional future: NWS WMS/tiles | n/a in P1 | P1 uses alert + text forecast only on dashboard strip |

**SLA:** NWS is best-effort; UI shows “**Source: NWS — availability not guaranteed**”.

### Global (non-US) default

| Layer | Source | Refresh (P1) | Notes |
|-------|--------|----------------|-------|
| **Forecast** | [Open-Meteo](https://open-meteo.com/) forecast API | **15 min** | No API key for non-commercial reasonable use; still show attribution |
| **Severe weather** | Open-Meteo optional future parameters / third-party | n/a P1 | Do not conflate with governmental alerting outside US |

**SLA:** Open-Meteo is community-operated; banner “**Global forecast — verify with local authorities**”.

### Region selection logic

```
if bounding box centroid in US EEZ / land simplified polygon set → NWS path
else → Open-Meteo path
```

P1 implementation may use **bounding box centroid** in WGS84 and a coarse **US bbox** check (`lat 24–50`, `lng -125 to -66` as heuristic) before NWS; refine later with proper maritime polygons.

---

## Traffic

| Mode | Source | Refresh | Notes |
|------|--------|---------|-------|
| **Routing / polyline** | Google Directions (server key) when `GOOGLE_MAPS_API_KEY` set | **5 min** cache per OD pair (rounded coords) | See [MAP-PROVIDERS.md](./MAP-PROVIDERS.md) |
| **Summary panel** | Heuristic stub OR Google-derived duration vs free-flow when available | **60–120 s** | P1 may show qualitative stub until Routes API v2 traffic metadata is wired |

**SLA:** Google Maps Platform **ToS and quotas** apply; show “**Traffic data © Google**” when applicable.

**Disclaimer (always visible in traffic card footer):**

> Traffic and routing information is indicative and may be incomplete or delayed. It does not replace road closures, law enforcement direction, or field observation.

---

## UI disclaimers (copy)

**Weather card footer:**

> Weather information supports situational awareness only. It is not a replacement for official warnings received through authorized alerting channels.

**Map footer (attribution area):**

> Map data © OpenStreetMap contributors. Additional layers list their providers separately.

---

## Caching headers (API routes)

| Endpoint family | `Cache-Control` suggestion |
|-----------------|--------------------------|
| NWS alerts | `s-maxage=120, stale-while-revalidate=300` |
| Open-Meteo | `s-maxage=900, stale-while-revalidate=3600` |
| Directions | `s-maxage=300, stale-while-revalidate=600` |

---

## Environment variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_WEATHER_PROVIDER` | `auto` (default), `nws`, `openmeteo` |
| `GOOGLE_MAPS_API_KEY` | Server-side routing/traffic (optional) |

---

## Future (Phase 4+)

- Licensed **news / OSINT** feeds feeding severity — **not** unofficial Twitter scraping.
- Additional traffic vendors (HERE, TomTom) behind the same `TrafficSummaryProvider` interface.
