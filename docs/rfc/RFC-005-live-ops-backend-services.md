# RFC-005 — Live Ops backend services (signaling, telemetry, paging, media)

**Status:** Draft (build spec)
**Scope:** The server-side services that turn the implemented Live Ops client
([RFC-004](RFC-004-live-ops-channels-telemetry.md)) into a real multi-operator system:
a signaling service, a telemetry socket, a paging service, and the media plane
([RFC-003](RFC-003-webrtc-sip-media.md)). This is a concrete integration contract — every
service maps to a client seam that already exists in the code.

## Service topology

```
                 ┌──────────────── API plane (app.* / Postgres+RLS) ────────────────┐
 Browser (ops) ──┤  Next.js app · Auth.js session · incident config (channels/units) │
                 └───────────────────────────────────────────────────────────────────┘
                          │ WebSocket (JWT)                 │ REST/WS
                 ┌────────▼─────────┐   ┌──────────▼──────────┐   ┌──────────▼─────────┐
                 │ Signaling svc    │   │ Telemetry svc       │   │ Paging svc         │
                 │ channel ACL,     │   │ GPS fan-out,        │   │ send + delivery/   │
                 │ join tokens, ICE │   │ presence/stale      │   │ ACK receipts       │
                 └────────┬─────────┘   └──────────┬──────────┘   └──────────┬─────────┘
   Bodycam ───────────────┼── SRT/WHIP ──►┌────────▼─────────┐               │
   (Android)              └── SIP ───────►│ Media plane      │◄── FCM/APNs ──┘
                                          │ LiveKit SFU +    │   (device push)
                                          │ SIP/PTT bridge   │
                                          └──────────────────┘
```

**Security boundary:** the **media/telemetry plane keys are separate** from database
credentials. Devices authenticate with short-lived **device tokens** (tenant + incident
scoped); operators use their Auth.js session exchanged for a signed WS JWT.

## 1. Signaling service

Responsibilities: per-channel ACL (tied to the app's RBAC/roles), issue join tokens for
LiveKit rooms + SIP rooms, distribute ICE/TURN config, track presence, enforce PTT floor
control with command preemption. Audit every join/leave.

- `POST /v1/signaling/channels/:id/join` → `{ livekitToken, sipCredentials, iceServers }`
- `WS /v1/signaling` → presence + floor-control events.

Maps to client `Channel { sipRoom, videoRoom }` (provisioned here) and the Live Ops video/PTT UI.

## 2. Telemetry service (fills `useUnitTelemetry`)

A WebSocket that fans device GPS fixes out to operators for an incident. **Replaces the
client's simulation** — the message shape is exactly what the hook consumes.

```ts
// device → server
type FixIn = { t: "fix"; unitId: string; lat: number; lng: number; heading?: number; battery?: number; at: string };
// server → operators (per incident room)
type FixOut = { t: "fix"; unitId: string; lat: number; lng: number; heading?: number; stale: false; at: string };
type Presence = { t: "presence"; unitId: string; stale: boolean; lastFixAt: string };
```

Server marks a unit `stale` when no fix arrives within the window and emits `Presence`.
**Client change:** in `useUnitTelemetry`, replace the `setInterval` body with a WS
subscription that writes incoming `FixOut`/`Presence` into the same `positions`/`trails`/`meta`
maps. Nothing else in the map layer, heading vectors, trails, or distress auto-focus changes.

## 3. Paging service (fills `sendPage` / `markPageDelivered` / `markPageAck`)

Acknowledged, per-recipient delivery — the server realizes the state machine the client
already renders (`queued → delivered → ack`).

```ts
type PageOut = { t: "page"; pageId: string; channelId: string; body: string; recipients: string[]; at: string };
type Receipt = { t: "receipt"; pageId: string; unitId: string; status: "delivered" | "ack"; at: string };
```

Flow: operator `sendPage` → `POST /v1/pages` (fans out via FCM/APNs + the device WS) →
device auto-ACKs `delivered` on receipt, `ack` on responder action → server emits `Receipt`
→ client calls the existing `markPageDelivered` / `markPageAck`. Retry until `delivered`;
persist pages + receipts for audit. **Distress uses the same rails at top priority.**

## 4. Media plane (RFC-003)

LiveKit/mediasoup SFU for video (SRT/WHIP ingest, WebRTC egress, recording to object
storage). SIP/FreeSWITCH bridge maps each channel to a talkgroup room; RoIP gateway patches
physical LMR radios in. Keys separate from the API plane; per-channel ACL at the signaling layer.

## 5. Persistence (Postgres, RLS by tenant)

New tables mirroring the client config + facts: `channels`, `field_units`,
`page_messages` + `page_receipts`, `distress_events` (append-only). Live state
(positions, presence, floor) is **not** persisted — it lives in Redis/memory on the
telemetry/signaling services. Every mutation writes `audit_log` (existing table).

## 6. Deployment sketch

```yaml
# docker-compose (dev)
services:
  app:         # Next.js (this repo)
  postgres:    # + PostGIS + RLS
  redis:       # presence, floor control, WS fan-out pub/sub
  signaling:   # Node/ws service
  telemetry:   # Node/ws service (Redis pub/sub)
  paging:      # Node service + FCM/APNs
  livekit:     # SFU
  freeswitch:  # SIP/PTT bridge + RoIP gateway
```

Air-gapped agency deployments run the same stack on-prem (self-hosted LiveKit/FreeSWITCH).

## 7. Client seams → services (integration map)

| Client (implemented) | Service | Change to go live |
|---|---|---|
| `useUnitTelemetry` interval | Telemetry svc | swap interval → WS `FixOut`/`Presence` |
| `sendPage`/`markPageDelivered`/`markPageAck` | Paging svc | POST on send; receipts drive the mark* calls |
| `Channel { sipRoom, videoRoom }` | Signaling + Media | provision rooms on activate; join tokens |
| Live Ops video grid / PTT | Media plane | render LiveKit tracks; PTT via SIP bridge |
| `raiseDistress` + banner | Paging (priority) + Telemetry | device trigger → top-priority page + forced fix |
| `channels`/`fieldUnits`/`pages`/`distressEvents` in store | Postgres | move config to DB; keep store as cache/offline |

## 8. Rollout

1. **Telemetry socket** first (highest visible payoff, lowest surface — just replaces the sim).
2. **Paging service** (receipts) — the client state machine already exists.
3. **Signaling + LiveKit video**, then **SIP/PTT**, then **RoIP radio gateway**.
4. **Persistence migration** (store → Postgres) in parallel, enabling multi-operator.

## Open decisions

- WS gateway: bespoke vs managed (Ably/Pusher) for telemetry/paging fan-out.
- Floor-control preemption semantics (drop vs duck the current talker).
- Recording/telemetry retention + POPIA consent flows.
- Device token issuance & rotation; optional mTLS for agencies (RFC-002).
