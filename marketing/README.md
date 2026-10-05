# InCommand — Public Marketing Site

A standalone, **static** marketing and client-entry site for InCommand. It is deliberately
**isolated from the live disaster-management application** so that public traffic — including
attacks — can never affect the operations plane.

```
marketing/
├── index.html      # Landing page (self-contained: inline CSS/JS, embedded image)
├── login.html      # Existing-client sign-in (UI shell → wire to app auth)
├── _headers        # Security headers (Cloudflare Pages / Netlify)
├── vercel.json     # Security headers + clean URLs (Vercel)
├── robots.txt
└── README.md
```

---

## 1. The #1 rule: keep it isolated from the operations app

The live disaster console (the Next.js app in `../src`) and this marketing site **must be two
separate deployments** that share **no** runtime, host, process, or database.

```
                    ┌─────────────────────────────┐
   Public visitors ─┤  CDN edge (Cloudflare/etc.)  │  ← static files, cached, DDoS-absorbed
                    │  www.your-domain             │
                    └─────────────────────────────┘
                                 │  (no origin server, nothing to overwhelm)

   Field / command ─┐   ┌─────────────────────────────┐
   operators        └──▶│  Operations app (SEPARATE)   │  ← the disaster console, its own host
                        │  app.your-domain             │
                        └─────────────────────────────┘
```

Why this matters: a static site has **no application backend**. There is no server process,
database, or API for a flood of requests to exhaust or crash. The two planes have **no shared
failure domain**, so a DDoS or traffic spike on the public site is physically incapable of
degrading the disaster console.

**Do NOT** serve this site from the same origin, server, or Next.js app as the operations
console. Deploy it to its own domain/subdomain and its own host.

- This folder lives outside `../src`, so the operations app's Next.js build and dev server
  never bundle or serve it. It is here only for co-location in one repo — deploy it separately.

---

## 2. DDoS resistance & uptime

Defense is **architectural first**, configuration second:

1. **Static + CDN.** Every file is pre-rendered and cached at the edge. Requests are answered
   from cache POPs worldwide — there is no origin round-trip to saturate.
2. **No backend attack surface.** No server-side code, no database, no secrets in this site.
   Nothing to inject into, exhaust, or take down.
3. **Edge DDoS protection + WAF.** Deploy behind a provider that fronts traffic with automatic
   DDoS mitigation and rate limiting (Cloudflare's free tier includes this). Turn on:
   - Cloudflare **Bot Fight Mode** + **DDoS protection** (on by default)
   - A **rate-limiting rule** (e.g. 100 req / 10s / IP → challenge)
   - **"Under Attack" mode** as a one-click escalation
4. **Self-contained pages.** `index.html` and `login.html` inline their CSS, JS, and imagery —
   one HTTP request each, trivially cacheable, and they render even if an asset host is down.
5. **Hardened headers.** See `_headers` / `vercel.json`: strict CSP, HSTS with preload,
   `frame-ancestors 'none'`, `nosniff`, tight `Permissions-Policy`.

The operations console keeps its own uptime posture (offline-first, per-incident isolation); it
is never in the blast radius of the public site.

---

## 3. Deploy (pick one — all give free edge CDN + DDoS protection)

**Cloudflare Pages** (recommended for the built-in WAF/DDoS controls)
```bash
npx wrangler pages deploy marketing --project-name=incommand-www
```
Then in the dashboard: add your domain, enable DDoS protection + a rate-limiting rule.

**Netlify**
```bash
npx netlify deploy --dir=marketing --prod
```
`_headers` is applied automatically.

**Vercel**
```bash
cd marketing && npx vercel --prod
```
`vercel.json` applies the headers. Keep this as a **separate Vercel project** from the app.

> Static hosts serve these files as-is; there is no build step.

---

## 4. Client login

`login.html` is wired as a **functional prototype**: any email + password (or the SSO button)
signs you straight into the operations console — there is no credential logic yet.

- The redirect target is `APP_URL` at the top of `login.html`'s bottom `<script>`, currently
  `http://localhost:3000/` (the running dev console). Change it to your deployed app origin
  (e.g. `https://app.your-domain/`) for production.

**Before production**, replace the pass-through with a real handshake against your identity
provider (the InCommand app ships with NextAuth):

1. Host auth on the **app** origin, not here — this preserves the isolation boundary.
2. Swap `enterConsole()` for a POST to your auth endpoint (or link to the app's hosted sign-in).
3. If the form posts cross-origin, widen `form-action` in the CSP to include the app origin.

---

## 5. Public demo (sandbox incident)

Prospects can try the product with **zero sign-in**. The landing page's "Launch live demo"
buttons open the app's `/demo` route, which spins up a fresh, pre-populated sandbox incident —
a flood scenario with a command team, ICS 201/202, objectives, and mapping — and drops the
visitor straight into the console.

- The target is `DEMO_URL` in `index.html`'s bottom `<script>` (currently
  `http://localhost:3000/demo`). Demo links open in a new tab so the site stays put.
- `/demo` lives in the app at `src/app/demo/page.tsx` and is **additive** — it changes no
  existing flow. A one-time guard prevents duplicate events per visit.
- **Production:** point `DEMO_URL` at a **separate demo instance** of the app, isolated from the
  live operations plane, so demo traffic can never affect real incident management.

---

## 6. Local preview

Open `marketing/index.html` directly in a browser, or serve the folder statically:
```bash
npx serve marketing        # or: python -m http.server -d marketing 8080
```
This is separate from `npm run dev` (the operations app) — run whichever you need; they don't
interfere.

---

## 7. Before go-live

- [ ] Replace placeholder contact `hello@incommand.app` and the `your-domain` references.
- [ ] Replace the login pass-through with real auth; set `APP_URL` to the production app origin.
- [ ] Point `DEMO_URL` at a separate demo instance of the app (not the live console).
- [ ] Set the real domain in `robots.txt` sitemap line.
- [ ] Confirm the site is on a **different host/domain** than the operations console.
- [ ] Enable DDoS protection + a rate-limit rule at the CDN.
