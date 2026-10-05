# RFC-007 — Live bodycam video over LiveKit

**Status:** Draft (web viewer + token endpoint built, feature-flagged & untested against a
live LiveKit server + a publishing bodycam).
**Scope:** Show an L310 bodycam's live camera in the InCommand command dashboard, per channel.

## Topology

```
 bodycam (L310)  --publish camera-->  LiveKit SFU (room = channel.videoRoom)
 operator (web)  --subscribe-------->  ↑            ↓
                                       └── token minted by /api/livekit/token (server-side)
```

- **LiveKit server**: self-host (docker `livekit/livekit-server`) or LiveKit Cloud. Provides
  the WebRTC SFU + an API key/secret used to mint access tokens.
- **Room per channel**: `channel.videoRoom` (or `vid-<channelId>`) — the same identifier the
  RFC-005 signaling service would provision.

## Web side — implemented in this repo

- **Token endpoint** `src/app/api/livekit/token/route.ts` — `livekit-server-sdk` `AccessToken`
  mints a **subscribe-only** token (roomJoin, canSubscribe, no publish). API secret never
  leaves the server. Returns `{ token, url }`. 501 when unconfigured. **Gate on the session in
  production.**
- **Viewer** `src/components/incident/ChannelVideo.tsx` — fetches a token, `<LiveKitRoom>`
  connects (audio/video off = viewer only), `useTracks([Camera])` → a tile per publishing unit
  (`@livekit/components-react`). Dynamic-imported (`ssr:false`) so `livekit-client` stays out of
  SSR + the initial bundle.
- **CommsView** channel cards render `<ChannelVideo>` when `NEXT_PUBLIC_LIVEKIT_URL` is set,
  else the "stream pending backend" placeholder.
- Config: `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` (server) + `NEXT_PUBLIC_LIVEKIT_URL`
  (client enable flag). See `.env.example`.

## Publish-token endpoint — implemented in this repo

`src/app/api/livekit/publish-token/route.ts` mints a **publish** token for a bodycam. Because
publishing is privileged, it authenticates the device with the fleet HMAC (same `SIP_HMAC_SECRET`
the SIP creds derive from):

```
POST /api/livekit/publish-token
  { "deviceId": "<id>", "proof": "<hex>", "room": "vid-<channelId>" }
  proof = HMAC_SHA256(deviceId, SIP_HMAC_SECRET)   # the L310 already computes this
  → { token, url }   (identity = deviceId, canPublish + canSubscribe)
```

Verified: correct proof accepted, wrong proof rejected, token carries `canPublish` with
`identity = deviceId`. 501 when LiveKit/HMAC unconfigured.

## Bodycam side — to build later (Android)

The L310 app records locally and does WebRTC-over-MQTT for group calls; it does **not** publish
to LiveKit yet. To stream live it needs the **LiveKit Android SDK** (`io.livekit:livekit-android`)
to: POST `/api/livekit/publish-token` with `{deviceId, proof, room}` (proof as above, reusing
SipCredentialGenerator's HMAC), connect to `room = <channel videoRoom>`, and publish the camera
track — ideally only while a channel is "live" / on distress, to save cellular data. Reuse the
same `deviceId` identity so the tile maps to the registered unit.

## Run a local LiveKit (for testing)

```
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  -e LIVEKIT_KEYS="devkey: secret" livekit/livekit-server --dev
# .env.local:
#   LIVEKIT_URL=ws://localhost:7880   LIVEKIT_API_KEY=devkey   LIVEKIT_API_SECRET=secret
#   NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```
Publish a test camera with LiveKit's `lk` CLI or the Meet sample joining the same room to see a
tile appear in the channel card.

## Not done / open

- **End-to-end verified:** no — needs a LiveKit server + a publishing client. Token minting is
  verified (valid JWT with the right grants); the viewer is correct-by-construction.
- **Publish-on-demand / recording / retention** (POPIA) and **bandwidth ladder** (video → audio
  → snapshots on poor links) are follow-ups.
- **Distress tie-in**: auto-pop the unit's video on SOS (RFC-004) once publishing exists.
