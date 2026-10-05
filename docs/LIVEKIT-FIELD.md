# LiveKit — Field-Ready (real bodycams over cellular)

The LAN `--dev` setup only works for devices on the same Wi-Fi. A bodycam on 4G/5G
**cannot** reach a private LAN IP, so for real field use LiveKit must be **publicly
reachable with TURN/TLS**. Two ways — pick one.

The app side is already built for this: the token routes hand clients whatever
`LIVEKIT_URL` resolves to, and a **public host is never rewritten** by the LAN-IP
fallback (only private IPs/localhost are). So switching to field mode is just config.

---

## Option A — LiveKit Cloud (recommended, ~5 minutes, no infra)

Managed TURN + TLS + global edge. Best for an expo or first real deployment.

1. Create a free project at https://cloud.livekit.io → copy its **URL**, **API key**,
   **API secret**.
2. In `.env.local`:
   ```
   LIVEKIT_URL=wss://<your-project>.livekit.cloud
   NEXT_PUBLIC_LIVEKIT_URL=wss://<your-project>.livekit.cloud
   LIVEKIT_API_KEY=<key>
   LIVEKIT_API_SECRET=<secret>
   LIVEKIT_URL_STATIC=1
   ```
3. Restart the web server. Stop the local LiveKit container (not needed):
   `docker compose stop livekit`.

That's it — cellular bodycams and browsers connect through LiveKit's managed TURN.
The bodycam's publish token still comes from **your** server (`/api/livekit/publish-token`),
so nothing changes on the device side except the URL it's told to connect to.

---

## Option B — Self-host publicly (you control the box + network)

Use the provided config + override:
```bash
docker compose -f docker-compose.yml -f docker-compose.field.yml up -d livekit
```

Then make it reachable and secure:

1. **New keys — REQUIRED** (the non-dev server refuses to start unless the secret is
   **≥ 32 characters**; the dev `secret` is rejected):
   ```bash
   docker run --rm livekit/livekit-server generate-keys
   ```
   Put them in `.env.local` as `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` (the override
   feeds them to the server via `LIVEKIT_KEYS`). `generate-keys` produces a compliant
   32+ char secret automatically.

2. **Open the ports** to the internet (router port-forward or cloud firewall):
   | Port | Proto | Purpose |
   |---|---|---|
   | 7880 | TCP | signaling (front with TLS on 443 in prod) |
   | 7881 | TCP | ICE/TCP fallback (works when UDP is blocked) |
   | 3478 | UDP | TURN |
   | 5349 | TCP | TURN/TLS (once TLS is configured) |
   | 50000–50100 | UDP | WebRTC media |

3. **TLS + domain** (required for browsers/cellular on strict networks — `wss://` needs it):
   - Point a domain (e.g. `livekit.your-domain`) at the public IP.
   - Terminate TLS with a reverse proxy (Caddy is easiest — auto-HTTPS):
     ```
     livekit.your-domain {
       reverse_proxy localhost:7880
     }
     ```
   - Enable TURN/TLS in `livekit/livekit.yaml` (uncomment `domain` / `tls_port` /
     `external_tls`).

4. Point the app at it in `.env.local`:
   ```
   LIVEKIT_URL=wss://livekit.your-domain
   NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.your-domain
   LIVEKIT_URL_STATIC=1
   ```
   (For a quick pre-TLS test only, `ws://<public-ip>:7880` works on networks that allow it.)

### Running LiveKit on a Raspberry Pi / small box
The same override works on ARM (the image is multi-arch). The Pi needs the ports above
reachable — either a public IP + port-forward, or a tunnel (Cloudflare Tunnel / Tailscale
Funnel) that exposes 7880 over HTTPS. A tunnel is the easiest way to get `wss://` without
a static IP; TURN/UDP still wants direct ports for good media, so a small cloud VM or
LiveKit Cloud is more robust for many cameras.

---

## Verify field mode
- `GET /api/livekit/health` → `{ ok: true, url: "wss://…" }` (the public URL, unchanged
  by the LAN fallback).
- From a device **off your Wi-Fi** (phone on cellular): open the app, a channel's
  "🎥 Test publish", allow camera → the tile shows on an operator viewing that channel.

## Which to choose
- **Expo / first real test:** Option A (Cloud). Least to go wrong.
- **Self-owned infra / offline-capable site network:** Option B, with a domain + TLS.
- **Same-site LAN only (no cellular):** stay on `--dev` — nothing to change.
