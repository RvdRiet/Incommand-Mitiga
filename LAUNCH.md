# InCommand — Full-Capability Launch Runbook

Everything that must be running for a **live, demo-ready** session. Written so anyone
(or the assistant) can bring the whole system online from cold.

## The stack at a glance

| Component | How it runs | Port(s) | Why it matters for the demo |
|---|---|---|---|
| **Postgres** (PostGIS) | Docker | 5432 | All persistent data — incidents, roster, attendance, auth |
| **MinIO** (S3) | Docker | 9000 / 9001 | Blob storage (photos, PDFs, video artifacts) |
| **Redis** | Docker | 6379 | Rate limiting, sessions/locks |
| **LiveKit** | Docker | 7880 / 7881 / 7882-udp | Live bodycam + webcam **video** |
| **Mailpit** | Docker | 8025 / 1025 | Dev email capture (invites, resets) — optional for demo |
| **Telemetry server** | `npm run stack` | 8787 | **Demo bodycams move + check in ("online") + SOS** — no hardware needed |
| **Paging server** | `npm run stack` | 8788 | Comms page delivery/ack receipts |
| **Signaling server** | `npm run stack` | 8789 | Channel presence + PTT floor control |
| **Next web app** | `npm run stack` | 3000 | The app itself |
| Electron desktop | `npm run electron:dev` | — | Optional thin-client wrapper (loads :3000) |
| MQTT bridge | `npm run mqtt-bridge` | — | Only for **real** L310 bodycams, not the demo |

## Launch sequence (cold start)

1. **Start Docker Desktop** (GUI — it cannot be started headlessly). Wait until it says "running".

2. **Bring up the Docker services:**
   ```bash
   docker compose up -d
   ```
   Brings up Postgres, MinIO, Redis, LiveKit, Mailpit. They're `restart: unless-stopped`,
   so once up they survive reboots as long as Docker is running.

3. **Ensure the database is migrated + seeded** (idempotent — safe every time):
   ```bash
   npm run db:migrate
   npm run db:seed
   ```
   Seeds the demo tenant (`demo` / `ic@example.com` / `MitigaDemo!23`) and the fully
   populated **"Coastal Storm & Flood — DEMO"** incident.

4. **Start the app + realtime servers** (one command, Ctrl+C stops all):
   ```bash
   npm run stack
   ```
   Runs telemetry (8787), paging (8788), signaling (8789), and Next dev (3000).

5. Open **http://localhost:3000**, sign in, open **Coastal Storm & Flood — DEMO**.

## Telemetry: pick ONE mode (they are mutually exclusive on :8787)

- **DEMO mode (default — hardware-less expo):** just `npm run stack`. The incident's
  field units random-walk on the map so bodycams appear to move + go online with no
  hardware. This is the expo demo.

- **REAL-BODYCAM mode:** run telemetry with the demo **off** and start the MQTT bridge,
  so ONLY the bodycam's real GPS drives the map:
  ```bash
  # instead of the telemetry inside `npm run stack`, run it with demo off:
  TELEMETRY_DEMO=0 npx tsx server/telemetry-server.ts
  # and bridge the bodycam's real GPS in (its circle key + the event id):
  MQTT_CIRCLE="<bodycam INVITE.SALT>" INCIDENT_ID="<event id>" npm run mqtt-bridge
  ```
  ⚠️ If demo mode is left ON while a real bodycam is connected, the server random-walks
  that unit and shows a **fake drifting position** until a real GPS fix arrives — the
  bodycam itself is fine, but the web looks wrong. The bridge prints `first payload keys:`
  on connect and warns on out-of-range coords, so a field-name/format mismatch is obvious.

## Verify it's demo-ready (all should be green)

```bash
# Docker services
docker ps --format "{{.Names}}\t{{.Status}}"
# Ports (all should connect)
for p in 3000 7880 8787 8788 8789 5432 9000 6379; do (echo >/dev/tcp/127.0.0.1/$p) 2>/dev/null && echo "$p UP" || echo "$p DOWN"; done
```

In the app:
- **Comms / Live Ops** header shows **"LiveKit: connected"**, field units appear and **move on the map**, bodycams show **online**.
- **Map** — Satellite/Hybrid toggle works; supply routes draw.
- **"🎥 Test publish (this device)"** on a channel streams your webcam into the channel tile.

## Env keys (in `.env.local`)

Required for full capability are already set: DB URLs, LiveKit keys,
`NEXT_PUBLIC_TELEMETRY_WS_URL=ws://localhost:8787`.

Optional enhancers (app works without them via free fallbacks):
- `GOOGLE_MAPS_API_KEY` — Google geocoding + traffic routing (else OSM/OSRM).
- `NEXT_PUBLIC_MAPTILER_API_KEY` — sharper satellite (else free Esri imagery).
- `NEXT_PUBLIC_PAGING_WS_URL` / `NEXT_PUBLIC_SIGNALING_WS_URL` — set to
  `ws://localhost:8788` / `ws://localhost:8789` to wire the paging/signaling
  servers to the client (otherwise those features use the local in-app simulation).

## Notes / gotchas
- **LiveKit LAN IP self-heals** — token routes rewrite the host to the machine's current
  LAN IP, so a DHCP change won't break video. Only a whole-network (different `/24`)
  change needs attention. **Real bodycams over cellular** need public LiveKit + TURN —
  see [docs/LIVEKIT-FIELD.md](docs/LIVEKIT-FIELD.md) (LiveKit Cloud in ~5 min, or the
  self-host `docker-compose.field.yml` override).
- **Never run `next build` / `electron:prepare` while `npm run stack` (dev) is running** —
  the prod build clobbers `.next/` and breaks the dev server (unstyled UI). Stop dev first.
- If bodycams/units aren't live, the **telemetry server (8787) isn't running** — that's the
  usual culprit; `npm run stack` starts it.
