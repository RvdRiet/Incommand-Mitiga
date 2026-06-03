# InCommand Mitiga — Phase 1 Product Requirements

**Version:** 1.0  
**Status:** Draft (MVP scope)  
**Product:** Web command dashboard with map-centric planning, ICS-aligned workflows, weather and traffic context, auditability, and exports.

---

## 1. Goals

- Give planners and incident managers a **single map-first workspace** to create incidents, draw **polygons and radius-based affected zones**, plan **routes**, and attach **ICS-style structured records**.
- Surface **weather** and **traffic** context for the map viewport or a selected incident, with clear **data provenance** and **disclaimers**.
- Produce **audit trails** and **after-action exports** (JSON and PDF in later iterations; Phase 1 defines JSON export minimum, PDF as follow-up hook).
- Establish **multi-tenant isolation** suitable for SaaS MVP, with a path to dedicated/self-hosted deployments.

Non-goals for Phase 1: native mobile apps, live bodycam ingest, SIP/PTT, unofficial social/news scraping.

---

## 2. Personas and roles

| Role | Description | Phase 1 capabilities |
|------|-------------|----------------------|
| **Tenant Admin** | Manages org settings, billing hooks (future), user invites | CRUD orgs, assign org admins, view audit |
| **Org Admin** | Manages users within an organization | Invite/deactivate users, assign roles |
| **Planner** | Preparedness and exercises | Full map planning tools, ICS drafts, exercises |
| **Incident Manager / IC** | Active incident command | Activate incidents, operational periods, ICS forms, map overlays |
| **Viewer** | Stakeholder read-only | Read dashboard, map layers, exports (policy-controlled) |

**RBAC summary:** `tenant_admin`, `org_admin`, `planner`, `incident_manager`, `viewer`. Enforced in application layer; database **RLS** as defense in depth using `app.tenant_id` session variable.

---

## 3. Incident and exercise lifecycle

States (enum):

1. **Planning** — incident shell exists; geometry and ICS drafts editable.
2. **Active** — operational periods increment; restricted deletes; audit emphasis.
3. **Demobilization** — read-mostly; closure checklist (lightweight in P1).
4. **Closed** — immutable core facts; append-only notes/exports allowed per policy.
5. **Exercise** (parallel mode flag) — same workflows; clearly labeled in UI and reports.

**Operational period (OP):** optional numbered periods per incident; ICS forms may be versioned per OP (P1: single “current” OP with version integer on form instances).

---

## 4. Map and geospatial tools (Phase 1)

### 4.1 Basemap

- Default: **OSM-compatible** raster tiles (configurable URL; attribution required).
- Optional: satellite/hybrid layers behind feature flag and provider keys.

### 4.2 Drawing tools

- **Polygon** planning / affected area: save as GeoJSON + server-side PostGIS geometry.
- **Circle / radius:** center point + radius in meters; render as circle; store center + radius + optional buffered polygon for queries.
- **Route:** polyline with ordered coordinates; associate with incident; “snap to roads” deferred to provider integration (see MAP-PROVIDERS).

### 4.3 Layer toggles

- Incidents (points or centroids), polygons, circles, routes.
- Weather overlay strip (not necessarily full raster in P1).
- Traffic summary panel (numeric / textual), not claiming precision beyond provider.

### 4.4 Modes

- **Planning mode:** emphasis on drawing, drafts, exercises.
- **Event mode:** emphasis on status, OP, severity, restricted edits.

---

## 5. ICS forms (digital-first, fixed templates P1)

Starter set aligned to common NIMS/ICS usage (field names validated in app; stored as structured JSON with schema version):

| Code | Name | P1 scope |
|------|------|----------|
| **ICS-201** | Incident Briefing | Full digital form + validation |
| **ICS-202** | Incident Objectives | Full digital form |
| **ICS-203** | Organization Assignment List | Simplified list (rows) |
| **ICS-204** | Assignment List | Simplified list |
| **ICS-205** | Communications List | Simplified list |
| **ICS-206** | Medical Plan | Core fields only |
| **ICS-213** | General Message | Message log entries |
| **ICS-214** | Activity Log | Chronological entries |

Each **form instance** links to: `incident_id`, optional `operational_period`, `schema_version`, `payload` (JSON), `created_by`, timestamps.

**Export:** minimum **JSON** export per incident (bundle forms + geometry + audit pointers). **PDF** export: specified interface/stub (template engine TBD) without blocking P1 ship.

---

## 6. Main dashboard

### 6.1 Layout

- **Primary:** interactive map (majority of viewport).
- **Secondary:** collapsible panels — incident list, selected incident detail, weather strip, traffic summary, ICS form navigator.
- **Header:** org switcher (if multi-org user), mode toggle (planning / event), user menu.

### 6.2 Incident list

- Columns: name, status, severity, updated_at, centroid/region label.
- Filters: status, date range, exercise vs real.

### 6.3 Weather strip

- Shows **alerts** (US: NWS-driven when configured) and **forecast snippet** for map center or selected incident (see WEATHER-TRAFFIC-SOURCES).
- Display **last updated** and **source**.

### 6.4 Traffic summary

- Textual summary for viewport or route (provider-dependent); link-out where appropriate.

---

## 7. Reporting and audit

- **Audit log:** append-only events: `actor_id`, `tenant_id`, `action`, `entity_type`, `entity_id`, `metadata` (JSON), `created_at`.
- **After-action (P1):** export JSON bundle: incident metadata, geometries, ICS payloads, audit subset.
- **Retention:** configurable per tenant (future); P1 uses single global policy in env.

---

## 8. Non-functional requirements

- **Performance:** map interactions < 100ms UI feedback; API p95 < 500ms for typical reads under dev load.
- **Security:** TLS; httpOnly cookies for session; CSRF protection on mutations; rate limit auth endpoints.
- **Accessibility:** keyboard-accessible panels; map has text alternative summary where feasible.
- **Observability:** structured logs with `request_id`, `tenant_id` (hashed optional), route, status.

---

## 9. Acceptance criteria (MVP exit)

- User can sign in (demo or email/password per deployment config).
- User can create/edit an incident with **polygon** and **radius** zone on the map; data persists and reloads.
- User can create **ICS-201** and **ICS-202** instances with validation errors shown.
- Dashboard shows **weather** and **traffic** widgets with disclaimer and timestamp.
- **Audit** entries created for create/update of incident and forms.
- **JSON export** downloads for a single incident bundle.

---

## 10. Open decisions (post-P1)

- PDF layout engine and official form pixel-matching.
- Full OP versioning UI.
- Satellite basemaps licensing.
