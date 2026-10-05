# RFC-006 — Web operator push-to-talk over WebRTC/SIP

**Status:** Draft (web client built, feature-flagged & untested against a live Asterisk)
**Scope:** Let a browser operator push-to-talk into the same audio the L310 bodycams use,
via the fleet's self-hosted Asterisk (the `deploy/asterisk` stack in the bodycam repo).

## The core constraint

A browser **cannot speak the bodycams' native SIP** (UDP/TLS on 5060/5061). It must use
**SIP-over-WebSocket (WSS) + WebRTC media** (DTLS-SRTP, ICE). The current Asterisk config has
only `transport-udp` and `transport-tls` — **no WSS transport** — so this must be added
server-side before the web PTT can work.

## Server side — add to Asterisk (do this on the Pi later)

**1. A WebSocket transport** (`pjsip.conf`), reusing the existing TLS cert:

```ini
[transport-wss]
type=transport
protocol=wss
bind=0.0.0.0:8089
cert_file=/etc/asterisk/keys/fullchain.pem
priv_key_file=/etc/asterisk/keys/privkey.pem
external_media_address=<PUBLIC_IP_OR_DDNS>
external_signaling_address=<PUBLIC_IP_OR_DDNS>
```

**2. Enable the HTTP/WS listener** (`http.conf`) — Asterisk serves WSS on `/ws`:

```ini
[general]
enabled=yes
tlsenable=yes
tlsbindaddr=0.0.0.0:8089
tlscertfile=/etc/asterisk/keys/fullchain.pem
tlsprivatekey=/etc/asterisk/keys/privkey.pem
```

**3. A WebRTC operator endpoint** (`pjsip.conf`) — `webrtc=yes` sets DTLS/ICE/rtcp-mux/AVPF:

```ini
[operator1]
type=endpoint
transport=transport-wss
webrtc=yes
context=talkgroups
disallow=all
allow=opus,ulaw
auth=operator1-auth
aors=operator1
[operator1-auth]
type=auth
auth_type=userpass
username=operator1
password=<generated>
[operator1]
type=aor
max_contacts=1
```

**4. A talkgroup conference** so operators + bodycams share audio. Dialplan
(`extensions.conf`, context `talkgroups`) bridges `tg-<channelId>` (and the channel's
`sipRoom`) into a `ConfBridge`. PTT = the operator mutes/unmutes their own leg.

**5. Firewall / port-forward:** add `8089/tcp` (WSS) to the existing forwards (5060/udp,
5061/tcp, 10000–10099/udp). All the RFC-005 §Pi caveats apply (public/DDNS address, CGNAT).

## Client side — implemented in this repo

- `src/components/incident/useSipPtt.ts` — SIP.js `Web.SimpleUser` registers over WSS
  (dynamic-imported, so it's out of SSR and the initial bundle). PTT = `unmute()` on press,
  `mute()` on release, while joined to `sip:<channel.sipRoom || tg-<channelId>>@<domain>`.
- `CommsView` channel cards show a **"🎙 Hold to talk (audio)"** control + registration
  status when SIP is configured.
- Config via `NEXT_PUBLIC_SIP_WSS_URL` / `_DOMAIN` / `_USER` / `_PASSWORD` (see `.env.example`).

**Security:** the `NEXT_PUBLIC_*` credentials are LOCAL-TEST ONLY (they land in the client
bundle). Production must mint the operator's SIP secret **per session, server-side** — e.g.
the signaling service (RFC-005 §1) issues a short-lived credential the same way it issues
LiveKit tokens.

## Not yet done / open

- **End-to-end verified:** no — needs the WSS transport live on the Pi and a bodycam in the
  same conference. Built correct-by-construction; validate once the server side exists.
- **Floor control unification:** the SIP PTT and the RFC-005 signaling floor-control button
  are currently separate; a real deployment should make one press both request the floor and
  unmute audio.
- **Radio/LMR interop** and **group (WebRTC-over-MQTT) path** are out of scope here.
