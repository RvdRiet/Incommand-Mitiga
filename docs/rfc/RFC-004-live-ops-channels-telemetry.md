# RFC-004 — Live Ops: channels, unit telemetry, and distress (Phase 3 client)

**Status:** Draft (client half implemented)
**Scope:** The in-app command surface for bodycam operations — comms channels, live
field-unit locations on the map, and SOS/man-down distress handling. Consumes the media
and telemetry planes specified in [RFC-003](RFC-003-webrtc-sip-media.md) and the field
sync model in [RFC-002](RFC-002-field-mobile-sync.md).

## Goals

- Turn the **ICS-205 Communications Plan** into live, operable **Channels** (video + PTT + map + paging).
- Show **field-unit GPS** as a live, moving map layer with heading and stale detection.
- Make an **SOS / man-down** impossible to miss and instantly actionable (auto-focus the map + audio + video on the unit).
- Keep a clean boundary between **persisted incident config** and **ephemeral live state**.

## The organising primitive: a Channel is a live ICS-205 row

Each row of the ICS-205 "Basic Radio Channel Use" table maps to a `Channel` that binds:

```
Channel "TAC-1"
 ├─ video room   → streams of units on the channel   (RFC-003 SFU)
 ├─ audio room   → SIP/PTT talkgroup                  (RFC-003 SIP bridge)
 ├─ map layer    → live positions of those units      (this RFC)
 └─ page target  → who a page reaches                 (this RFC + backend delivery)
```

## Config vs. live split (the central design rule)

| | Config (persisted in the incident record) | Live (ephemeral, from the backend) |
|---|---|---|
| Data | channels, unit roster, SIP/video room ids, page targets | connected/speaking state, GPS fixes, stream up/down, page ACKs |
| Source of truth | incident store → Postgres | signaling / telemetry WebSocket |
| Persisted? | yes | **never** |

Distress events are the one exception: they are **live in origin but persisted as facts**
(audit / legal), written to the incident record and the activity log.

## Data model (implemented)

- `Channel { id, name, function, mode: "ptt"|"open_net", color, sourceFormId, sourceRowId, sipRoom, videoRoom, pageEnabled, radio? }`
- `FieldUnit { id, callsign, personnelId, deviceId, channelId, status } & GeoLocated`
- `DistressEvent { id, unitId, unitCallsign, channelId, kind: "sos"|"man_down"|"duress", source, lat, lng, triggeredAt, status, ackBy?, ackAt?, resolvedAt?, signalLost? }`

`channelsFromICS205()` parses the form's `channelRows` table and reconciles on a stable
`${formId}:${rowIndex}` id, so operational bindings survive edits to the plan.

## Telemetry relay (implemented, simulated)

`useUnitTelemetry(fieldUnits, enabled)` is the ingest seam. Today it runs a random-walk
**simulation** (seeded from each unit's last-set position, with signal-outage episodes so
units go **stale**). It exposes, per unit: live position, breadcrumb `trail`, `heading`,
`lastFixAt`, and a `stale` flag. The map renders:

- moving **unit markers** (COP "Field Units (live)" layer),
- **breadcrumb trails** (LineString overlay),
- **heading vectors** (short direction-of-travel line; hidden when stale),
- a **status roster** (callsign · live / stale Ns).

**To go live:** replace the interval body with a WebSocket subscription pushing
`{ unitId, lat, lng }` fixes into the same maps. Nothing downstream changes.

## Distress auto-focus (implemented)

On a `DistressEvent`, InCommand:

1. raises a **global pulsing takeover banner** on every module (active=red → acknowledged=amber);
2. **auto-centers + zooms the map** on the unit, with a pulsing distress marker;
3. offers one-tap **Acknowledge** (closes the loop to the device), **Locate**, **Resolve**, **False alarm**;
4. **auto-logs** the whole timeline to the activity trail.

### Trust rules (life-safety, non-negotiable)

- **Redundant delivery:** real-time socket + push + tone-over-audio fallback; device retries until ACK.
- **Signal-loss ≠ disappearance:** `signalLost` keeps the alert up with last-known position.
- **False-alarm guard:** device-side pre-alarm countdown before auto man-down fires (backend/device).
- **Multi-event triage:** simultaneous events stack, newest first; never hidden.

## Backend dependencies (not in the client)

- **Media plane:** LiveKit/mediasoup SFU (video), SIP/PTT bridge (audio) — RFC-003.
- **Telemetry plane:** GPS WebSocket feed replacing the simulation.
- **Paging:** acknowledged real-time delivery (evolve `NotificationRecord`: `draft→queued→sent→delivered→ack`).
- **Persistence / multi-user:** the Postgres/RLS backend (channels & distress are multi-operator by nature).

## Open decisions

- PTT floor-control & command preemption model.
- Recording/telemetry retention & POPIA consent for bodycam footage.
- Store-and-forward for units that lose connectivity (ties to RFC-002 offline-first).
- Self-hosted vs managed media/telemetry for air-gapped agency deployments.
