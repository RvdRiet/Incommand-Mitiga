# InCommand Mitiga (Phase 1 scaffold)

Web command dashboard (Next.js) aligned to the Phase 1 plan: map-centric UI, weather/traffic widgets, Postgres/PostGIS schema with RLS, and Auth.js credential login.

## Prerequisites

- Node.js 22+
- PostgreSQL 15+ with **PostGIS** enabled

## Setup

1. Copy [`.env.example`](.env.example) to `.env.local` and set `DATABASE_URL`, `AUTH_SECRET` (32+ random bytes), and optional `GOOGLE_MAPS_API_KEY` / `NEXT_PUBLIC_OSM_TILE_URL`.

2. Apply SQL migrations (in order):

```bash
psql "$DATABASE_URL" -f migrations/0001_initial.sql
psql "$DATABASE_URL" -f migrations/0002_auth_rls_force.sql
```

3. Seed demo tenant / user / sample incident:

```bash
npm install
npm run db:seed
```

Demo login: tenant slug `demo`, email `ic@example.com`, password `MitigaDemo!23`.

4. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`, sign in, and open the dashboard map.

## Documentation

- [docs/PRD-PHASE1.md](docs/PRD-PHASE1.md)
- [docs/DATA-MODEL-RLS.md](docs/DATA-MODEL-RLS.md)
- [docs/MAP-PROVIDERS.md](docs/MAP-PROVIDERS.md)
- [docs/WEATHER-TRAFFIC-SOURCES.md](docs/WEATHER-TRAFFIC-SOURCES.md)
- [docs/rfc/RFC-002-field-mobile-sync.md](docs/rfc/RFC-002-field-mobile-sync.md)
- [docs/rfc/RFC-003-webrtc-sip-media.md](docs/rfc/RFC-003-webrtc-sip-media.md)

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:seed` | Dev seed data |
