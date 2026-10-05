# Backend, storage & offline-sync setup

This document covers the data layer wired in this iteration: **Postgres** (primary DB),
**S3-compatible object storage** (blobs), a **local offline database** with an outbox
that syncs to Postgres, plus **containerization** and the **desktop wrapper**.

Architecture decisions (agreed): web-first PWA **+ a desktop wrapper**; deploy on
**managed PaaS**, containerized and stateless so Kubernetes is a later migration;
blobs in **object storage** (not Mongo); offline via **IndexedDB + outbox**.

---

## 1. Local stack (one command)

Everything runs in Docker Compose: Postgres + PostGIS, MinIO (S3), Redis.

```bash
docker compose up -d
```

> **Note:** Docker Desktop must be running first. On this machine its engine did not
> start headlessly — open Docker Desktop from the Start menu, wait until it says
> "Engine running", then run the command above.

The SQL files in `migrations/` run automatically the first time the Postgres volume is
created:

- `0001_initial.sql` — multi-tenant core, PostGIS, RLS
- `0002_auth_rls_force.sql` — login helper + forced RLS
- `0003_sync_state.sql` — `incident_state` (JSONB sync doc) + `blobs` registry
- `0004_app_role.sql` — least-privilege `mitiga_app` role the app connects as (see §1a)
- `0005_auth_lifecycle.sql` — user status/lockout/session-revocation, `auth_tokens`
  (invites + resets), and the pre-auth SECURITY DEFINER helpers (see §6)

Then seed a dev tenant/user/incident, verify the stack, and start the app:

```bash
npm run db:seed      # creates tenant "Demo City", user ic@example.com / MitigaDemo!23
npm run smoke        # end-to-end check: Postgres schema, seed, incident_state, S3/MinIO round-trip
npm run dev
```

`npm run smoke` exercises the whole data layer directly (no server/auth needed) and
prints `ALL CHECKS PASSED ✅` when Postgres + object storage are wired correctly — run
it any time to confirm the backend is healthy.

To see the full loop in the UI: open the app → **Account menu → Sign in →
"Dev sign-in (seeded account)"** → export any ICS form (PDF/TXT/JSON) → it archives to
the `incommand` bucket and appears in the Library's **Server archive** list.

Services:

| Service  | URL / port                         | Notes                              |
| -------- | ---------------------------------- | ---------------------------------- |
| Postgres | `localhost:5432` db `mitiga`       | app role `mitiga_app`; admin `postgres` |
| MinIO S3 | `localhost:9000`                   | key/secret `minioadmin`            |
| MinIO UI | `localhost:9001`                   | browse the `incommand` bucket      |
| Redis    | `localhost:6379`                   | realtime backplane (future)        |

Env is in `.env.local` (already set) and documented in `.env.example`.

## 1a. Database roles — multi-tenant RLS (production-critical)

Tenant isolation is enforced by Postgres **Row-Level Security**: every tenant-scoped
table has an `ENABLE`/`FORCE` RLS policy of `tenant_id = current_setting('app.tenant_id')`,
and the app sets `app.tenant_id` per request inside `withTenant(...)`.

**RLS only applies to roles that are neither `SUPERUSER` nor `BYPASSRLS`.** So the
project uses a **two-role model** (both wired in `.env.local` / `.env.example`):

| Connection          | Role         | Used by                          | RLS |
| ------------------- | ------------ | -------------------------------- | --- |
| `DATABASE_URL`       | `mitiga_app` | the Next.js app at runtime       | **enforced** |
| `DATABASE_ADMIN_URL` | `postgres`   | migrations + `npm run db:seed`   | bypassed (needs to create tenants / run DDL) |

`0004_app_role.sql` creates `mitiga_app` (`NOSUPERUSER NOBYPASSRLS`) with only DML +
`EXECUTE` on the login lookup — it can read/write **within a tenant context** but cannot
create tenants, run DDL, or escalate. `src/db/client.ts` connects as `DATABASE_URL`;
`scripts/seed.ts` uses `DATABASE_ADMIN_URL`. The smoke test proves enforcement at runtime
(wrong tenant → 0 rows; correct tenant → matches admin) and **fails** if `DATABASE_URL`
ever points at a privileged role.

**Production hardening checklist:**

1. Rotate the role password out of the migration default:
   `ALTER ROLE mitiga_app WITH PASSWORD '<from-secrets-manager>';` and point
   `DATABASE_URL` at it. Keep `DATABASE_ADMIN_URL` (a privileged role) out of the app's
   own environment — give it only to the migration/seed job.
2. On managed Postgres (Neon/Supabase/RDS) the bootstrap user is usually **not** a true
   superuser but often holds `BYPASSRLS` or owns the tables (FORCE RLS still applies to
   owners, but not to `BYPASSRLS`). Run `0004` as that bootstrap user, then verify with
   `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;` while
   connected as `mitiga_app` — both must be `f`. `npm run smoke` does exactly this.
3. Tenant provisioning (creating a `tenants` row + first org/admin user) is an **admin**
   operation — do it through `DATABASE_ADMIN_URL`, never the app role.

## 2. Object storage (blobs)

- Client: `src/lib/storage/blob.ts` (`putBlob`, `presignGet`, `presignPut`, `blobKey`).
  Server-only; points at MinIO in dev and R2/S3 in prod (just change the `S3_*` env).
- Registry table `blobs` (metadata + tenant scoping); bytes live in the bucket.
- API: `POST /api/incidents/[id]/blobs` (multipart `file`, optional `kind`) →
  uploads + registers + returns a presigned URL. `GET` lists an incident's blobs.

Next step to fully adopt: route the ICS-PDF export through this endpoint so exports are
archived server-side (currently they download client-side only).

## 3. Offline database + sync (the "internal database")

The app stays fully usable offline and syncs when it can:

- `src/lib/offline/db.ts` — **Dexie/IndexedDB** store. Each incident's full state is
  cached locally with a `dirty` flag that acts as a coalesced **outbox**.
- `src/lib/offline/sync.ts` — the sync engine: pushes dirty incidents to the server,
  pulls remote, drains the outbox on an interval and on the `online` event. Conflict
  policy is last-write-wins (client) with rev rebasing; a field-merge/CRDT can slot into
  `resolveConflict` for concurrent multi-editor use.
- Server: `GET/PUT /api/incidents/[id]/state` — JSONB document with **optimistic
  concurrency** (`rev`); a stale write returns `409` + the current copy to merge.
- Wiring: `src/components/incident/OfflineSyncBridge.tsx` (mounted in `EventProvider`)
  mirrors every store change into IndexedDB (debounced) and runs the sync loop. This is
  **additive** — the existing localStorage persistence is untouched.

Offline writes (to IndexedDB) work with no auth. Server sync requires a signed-in
session (it's tenant-scoped via RLS); until then pushes no-op with `401` and retry.

## 4. Containerize (PaaS / k8s-ready)

- `Dockerfile` — multi-stage → Next **standalone** image, non-root, ~small.
  (`next.config.ts` now sets `output: "standalone"`.)
- Build & run:

```bash
docker build -t incommand:local .
docker run --rm -p 3000:3000 --env-file .env.local incommand:local
```

Deploy target: Cloud Run / Fly.io (auto-scaling, stateless). Postgres → managed
(Neon/Supabase/Cloud SQL/RDS); blobs → R2/S3; Redis → managed. Because it's
containerized and stateless, migrating to managed Kubernetes (GKE Autopilot / EKS
Fargate) later is a lift-and-shift, not a rebuild.

## 5. Login & account security

Multi-tenant SaaS: many districts/municipalities share one deployment, isolated by
RLS (§1a). Users pick their **district** on the login page, then sign in with email +
password. Provisioning is **admin invite** driven.

**Flows (all built + tested):**
- **Login** (`/login`) — district picker (`GET /api/tenants/search`, prefix search via a
  SECURITY DEFINER helper so it can't dump the customer list) → email + password.
- **Invite** — an org/tenant admin invites by email (`POST /api/admin/invitations`,
  role-capped so you can't invite above your own role). The invitee gets a link to
  `/accept-invite`, sets a password, and the account + membership are created atomically.
- **Password reset** — `/forgot-password` → emailed link → `/reset-password`. Completing
  a reset bumps `token_version`, signing the user out everywhere.
- **User management** (`/admin/users`, org_admin+) — list users, change roles, disable /
  enable, and force sign-out.

**Security controls:**
- **Rate limiting** — login is limited per account and per IP via Redis (`LOGIN_LIMITS`),
  so limits hold across pods. Fail-open if Redis is down (availability), with DB lockout
  as the second layer.
- **Account lockout** — 5 failed passwords locks the account for 15 min (`users.locked_until`).
- **Session revocation** — JWTs carry a `token_version`; disabling a user or resetting a
  password bumps it, and the session is re-validated against the DB at most every 60s, so
  a disable / forced-logout / role change takes effect within a minute without a DB read
  per request.
- **Passwords** — bcrypt cost 12, min 12 chars + complexity + a small deny-list
  (`src/lib/auth/password.ts`); swap in a breach-check (HIBP) for production.
- **Audit** — every auth event (login, failure, lockout, invite, reset, role change,
  disable, forced sign-out) is written to the tenant-scoped `audit_log`.
- **Security headers** — HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-
  Policy on every response (`next.config.ts`). A strict CSP is a tracked follow-up (needs
  an origin inventory for map tiles / LiveKit / weather APIs).
- **Email** — `EMAIL_TRANSPORT=console` (dev, logs links) or `smtp` (prod, via `SMTP_*`).

**Roles** (privilege order): `tenant_admin > org_admin > incident_manager > planner >
viewer`. `org_admin+` manages users; API routes guard with `requireSession(role)`
(`src/lib/auth/rbac.ts`), and no action can escalate a user above the actor's own role.

## 6. Kubernetes deployment (scaling)

Manifests in `deploy/k8s/` (managed Postgres model). The app is stateless (JWT + state in
Postgres/S3), and the DB layer is **pooler-safe by design** (`prepare:false` + transaction-
local `set_config` → works under PgBouncer/managed **transaction** pooling), so it scales
horizontally. Key points, all wired:

- **Point `DATABASE_URL` at the managed transaction pooler** (Neon/Supabase/RDS
  Proxy/Cloud SQL+PgBouncer), as the `mitiga_app` role. Keep each pod's pool small
  (`DB_POOL_MAX=5`) so `replicas × pool` stays under the pooler's limit.
- **Graceful shutdown** — the pool drains on SIGTERM (`src/db/client.ts`), matched by
  `terminationGracePeriodSeconds`, so rolling deploys don't leak connections.
- **Probes** — liveness `GET /api/health` (process up); readiness `GET /api/health/ready`
  (verifies Postgres) so traffic only routes to pods that can serve.
- **HPA** — CPU-based autoscale (`incommand.yaml`).
- **Migrations** run as a separate `Job` with the privileged `DATABASE_ADMIN_URL` — the
  app pods never hold admin DB credentials.
- **Read scaling** (future) — add managed read replicas and route reporting/dashboard
  reads to them.

## 7. Desktop wrapper (Electron — scaffolded & built)

The desktop app is a thin shell around the same web build — **no C# rewrite**. It's an
**Electron** wrapper (`electron/`): in production the main process spawns the bundled Next
*standalone* server as a Node child (via `ELECTRON_RUN_AS_NODE`, so no separate Node
runtime), waits for it, then loads it in a native window; in dev it loads the running
`next dev`. `contextIsolation` is on and `electron/preload.js` exposes only a minimal
`window.incommandDesktop` API.

```bash
# dev — run the web dev server, then the Electron shell against it
npm run dev            # terminal 1
npm run electron:dev   # terminal 2 (loads http://localhost:3000)

# production build
npm run electron:prepare   # next build + copy static/public into .next/standalone
npm run electron            # run the packaged-style app locally (spawns the standalone server)

# distributables
npm run electron:pack      # unpacked app dir (fast; no installer) → dist-electron/
npm run electron:build     # installers via electron-builder (NSIS / dmg / AppImage)
```

**Packaging note:** `electron:build` (NSIS/dmg/AppImage) needs an environment that can
create symlinks (Windows: Developer Mode or admin, or CI) because electron-builder's
`winCodeSign` bundle contains symlinks. Where that's unavailable, produce the runnable app
folder with `@electron/packager`:

```bash
npm run electron:prepare
npx @electron/packager . InCommand --platform=win32 --arch=x64 --out=dist-electron \
    --overwrite --asar --extra-resource=.next/standalone \
    --ignore='^/(?!(electron($|/)|package\.json$)).+'   # ships only electron/ + package.json (no secrets)
# → dist-electron/InCommand-win32-x64/InCommand.exe (verified: launches, spawns the server, serves the app)
```

Config in production comes from the OS environment (or your provisioning) — the packaged
app does NOT bundle `.env.local`. Point `DATABASE_URL` etc. at your managed backend.

**Alternative: Tauri** (~10 MB, OS webview) — not scaffolded; needs the Rust toolchain
(`rustup`, `npm i -D @tauri-apps/cli@^2`, `npx tauri init`, `npx tauri dev/build`).

---

## What's still local-first (adoption roadmap)

The rich per-incident operational data (personnel, inventory, damage, etc.) currently
lives in the client's Zustand state and is now **mirrored to IndexedDB and syncable to
Postgres as a JSON document** via the layer above. Fuller normalization (promoting hot
entities to relational tables for cross-incident reporting) can follow once the sync
loop is exercised in the field. The seams are all in place.
