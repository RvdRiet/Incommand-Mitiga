# RFC-002 — Field mobile sync API (Phase 2)

**Status:** Draft  
**Scope:** Native Android/iOS clients for field reporting, offline capture, and attachment upload.

## Goals

- Same **tenant and RBAC** model as the web app; field users operate within assigned organizations.
- **Offline-first:** queue observations, photos, and GPS fixes; sync when connectivity returns.
- **Conflict safety:** server is authoritative; clients send `If-Match` / `baseVersion` on updates.

## Authentication

- **OAuth2/OIDC** device code or PKCE for mobile; short-lived access tokens + refresh tokens.
- Optional **mTLS** for agency deployments.

## Core endpoints (sketch)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/v1/field/events` | Create lightweight field event linked to parent incident |
| `POST` | `/v1/field/events/{id}/attachments` | Multipart upload; returns signed URL flow |
| `PATCH` | `/v1/field/events/{id}` | Append-only or status transition with version guard |
| `GET` | `/v1/field/sync/changes?since=cursor` | Incremental pull for assigned incidents |

## Payload model

- `FieldEvent`: `{ id, incidentId, kind, title, body, geometry?, capturedAt, deviceId, syncStatus }`
- Media stored in **object storage**; DB holds metadata + SHA-256.

## Sync algorithm

1. Client maintains **per-incident cursor** (opaque server cursor / monotonic log id).
2. Upload queue drained in FIFO; exponential backoff on 429/5xx.
3. Server writes to **`audit_log`** for every accepted mutation.

## Non-goals (Phase 2)

- Live video ingest (see RFC-003).
- SIP/PTT.

## Open decisions

- GraphQL vs REST for bandwidth-constrained paths.
- End-to-end encryption for message bodies at rest on device.
