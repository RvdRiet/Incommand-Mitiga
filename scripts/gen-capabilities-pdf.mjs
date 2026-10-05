// Generates the InCommand Capabilities Overview PDF (branded, with prototype
// screenshots). Uses jspdf (already a project dependency). Offline, no network.
//
//   node scripts/gen-capabilities-pdf.mjs
//
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { jsPDF } from "jspdf";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "capabilities-shots");
const OUT = join(ROOT, "docs", "InCommand-Capabilities-Overview.pdf");

// ---- palette ----
const NAVY = [30, 42, 54];
const RED = [196, 30, 58];
const TEAL = [13, 148, 136];
const INK = [28, 41, 59];
const MUTED = [100, 116, 139];
const LIGHT = [244, 247, 250];
const BORDER = [214, 222, 230];
const WHITE = [255, 255, 255];

const doc = new jsPDF({ unit: "pt", format: "a4" });
const PW = doc.internal.pageSize.getWidth(); // 595
const PH = doc.internal.pageSize.getHeight(); // 842
const M = 48; // margin
const CW = PW - M * 2; // content width ~499
let y = M;

function setFill(c) { doc.setFillColor(c[0], c[1], c[2]); }
function setText(c) { doc.setTextColor(c[0], c[1], c[2]); }
function setDraw(c) { doc.setDrawColor(c[0], c[1], c[2]); }

function img(name) {
  const p = join(SHOTS, name);
  if (!existsSync(p)) return null;
  return "data:image/jpeg;base64," + readFileSync(p).toString("base64");
}

function need(space) {
  if (y + space > PH - 60) { doc.addPage(); y = M; }
}

function h1(text) {
  need(44);
  // accent tab in the margin gutter, title stays aligned with body
  setFill(RED); doc.roundedRect(M - 12, y - 12, 4, 16, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  setText(NAVY);
  doc.text(text, M, y);
  y += 9;
  setDraw(RED); doc.setLineWidth(2.4);
  doc.line(M, y, M + 46, y);
  y += 23;
}

function h2(text) {
  need(32);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  setText(TEAL);
  doc.text(text, M, y);
  y += 17;
}

function para(text, color = INK, size = 10.5, lead = 14) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(size);
  setText(color);
  const lines = doc.splitTextToSize(text, CW);
  for (const ln of lines) {
    need(lead);
    doc.text(ln, M, y);
    y += lead;
  }
}

function bullets(items, indent = 0) {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  const x = M + indent;
  for (const it of items) {
    const bold = typeof it === "object";
    const label = bold ? it.t : it;
    const desc = bold ? it.d : null;
    const text = desc ? `${label}: ${desc}` : label;
    const lines = doc.splitTextToSize(text, CW - indent - 14);
    need(lines.length * 13 + 2);
    setFill(TEAL);
    doc.circle(x + 3, y - 3, 1.7, "F");
    for (let i = 0; i < lines.length; i++) {
      if (i === 0 && bold) {
        // bold label + normal desc, on one wrapped block: keep simple: render bold whole first line
        doc.setFont("helvetica", "bold"); setText(INK);
        // measure label width to place desc; simpler: just render text normal but label bolded inline is hard.
      }
      doc.setFont("helvetica", "normal"); setText(INK);
      doc.text(lines[i], x + 14, y);
      y += 13;
    }
    y += 2;
  }
}

// Render an image inside a browser-window mockup frame: title bar with traffic
// lights + address pill, soft drop shadow, page inset below the bar. `ar` = width/height.
function framedImage(dataUri, fmt, ar, caption, urlLabel, widthFrac) {
  const chrome = !!urlLabel; // browser-window chrome for app screenshots; plain card otherwise
  const bar = chrome ? 15 : 0, pad = 5;
  const winW = CW * (widthFrac || 1);
  const imgW = winW - pad * 2;
  const hI = imgW / ar;
  const winH = bar + hI + pad * 2;
  need(winH + 24);
  const x = M + (CW - winW) / 2, wy = y; // centered when narrowed
  // soft drop shadow
  setFill([224, 228, 233]);
  doc.roundedRect(x + 2, wy + 3, winW, winH, 7, 7, "F");
  // window / card body
  setFill([248, 250, 252]); setDraw([206, 213, 220]); doc.setLineWidth(1);
  doc.roundedRect(x, wy, winW, winH, 7, 7, "FD");
  if (chrome) {
    // title-bar divider
    setDraw([226, 231, 236]); doc.setLineWidth(0.8);
    doc.line(x, wy + bar, x + winW, wy + bar);
    // traffic lights
    const ly = wy + bar / 2 + 0.5;
    setFill([237, 106, 94]); doc.circle(x + 13, ly, 2.3, "F");
    setFill([245, 191, 79]); doc.circle(x + 21, ly, 2.3, "F");
    setFill([120, 200, 100]); doc.circle(x + 29, ly, 2.3, "F");
    // address pill
    setFill([255, 255, 255]); setDraw([224, 229, 234]); doc.setLineWidth(0.8);
    doc.roundedRect(x + 42, wy + 3.5, winW - 84, bar - 7, 3, 3, "FD");
    doc.setFont("helvetica", "normal"); doc.setFontSize(5.6); setText([148, 160, 173]);
    doc.text(urlLabel, x + 48, wy + bar / 2 + 2);
  }
  // page image, inset within the window
  doc.addImage(dataUri, fmt, x + pad, wy + bar + pad, imgW, hI, undefined, "FAST");
  y = wy + winH + 12;
  if (caption) {
    doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); setText(MUTED);
    const cl = doc.splitTextToSize(caption, winW);
    for (const c of cl) { doc.text(c, x, y); y += 12; }
    y += 2;
  }
  y += 4;
}

function screenshot(name, caption) {
  const data = img(name);
  if (!data) return;
  framedImage(data, "JPEG", 800 / 600, caption, "app.incommandmitiga.com");
}

// Full-width framed image of any format/aspect (JPEG/PNG/WEBP). `ar` = width/height.
function figure(name, ar, caption, urlLabel, widthFrac) {
  const p = join(SHOTS, name);
  if (!existsSync(p)) return;
  const ext = name.split(".").pop().toLowerCase();
  const fmt = ext === "png" ? "PNG" : ext === "webp" ? "WEBP" : "JPEG";
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  const data = `data:${mime};base64,` + readFileSync(p).toString("base64");
  framedImage(data, fmt, ar, caption, urlLabel, widthFrac);
}

function chip(text, x, yy, fg, bg) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  const w = doc.getTextWidth(text) + 14;
  setFill(bg); doc.roundedRect(x, yy - 9, w, 14, 7, 7, "F");
  setText(fg); doc.text(text, x + 7, yy);
  return w;
}

// Two-column specification table with group headers and row dividers.
function specTable(groups) {
  const labelW = 155;
  const valX = M + labelW + 12;
  const valW = CW - labelW - 12;
  for (const g of groups) {
    h2(g.title);
    for (const [label, value] of g.rows) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
      const valLines = doc.splitTextToSize(value, valW);
      const rowH = Math.max(15, valLines.length * 12 + 5);
      need(rowH);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); setText(NAVY);
      doc.text(label, M, y + 9);
      doc.setFont("helvetica", "normal"); setText(INK);
      let vy = y + 9;
      for (const ln of valLines) { doc.text(ln, valX, vy); vy += 12; }
      y += rowH;
      setDraw([231, 236, 241]); doc.setLineWidth(0.5);
      doc.line(M, y, M + CW, y);
      y += 6;
    }
    y += 4;
  }
}

// ============================ COVER ============================
setFill(NAVY); doc.rect(0, 0, PW, PH, "F");
// accent bar
setFill(RED); doc.rect(0, 250, PW, 3, "F");

doc.setFont("helvetica", "bold"); doc.setFontSize(40);
setText(RED); doc.text("In", M, 210);
const inW = doc.getTextWidth("In");
setText(WHITE); doc.text("Command", M + inW, 210);
const cmdW = doc.getTextWidth("Command");
setText(TEAL); doc.text(" Mitiga", M + inW + cmdW, 210);

doc.setFont("helvetica", "normal"); doc.setFontSize(13);
setText([148, 163, 184]);
doc.text("Disaster & Incident Command Platform", M, 236);

doc.setFont("helvetica", "bold"); doc.setFontSize(26);
setText(WHITE);
doc.text("Capabilities Overview", M, 320);

doc.setFont("helvetica", "normal"); doc.setFontSize(11.5);
setText([203, 213, 225]);
const coverLines = doc.splitTextToSize(
  "A single command system for emergency services and disaster management: real-time situational awareness, communications, personnel and resources, field intelligence and ICS documentation, in one place, online or off.",
  CW - 40,
);
let cy = 360;
for (const ln of coverLines) { doc.text(ln, M, cy); cy += 18; }

// tagline chip
doc.setFont("helvetica", "bold"); doc.setFontSize(9);
setFill(TEAL); doc.roundedRect(M, 430, 214, 20, 10, 10, "F");
setText(WHITE); doc.text("ONE PLATFORM. THE WHOLE INCIDENT.", M + 12, 443);

doc.setFont("helvetica", "normal"); doc.setFontSize(9);
setText([148, 163, 184]);
doc.text(
  "This overview presents the platform's capabilities for emergency and disaster command.\nScreenshots throughout are captured from a live, working prototype.",
  M, 476,
);

setFill(RED); doc.rect(0, PH - 60, PW, 3, "F");
doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
setText([148, 163, 184]);
doc.text("InCommand Mitiga · Capabilities Overview · 2026", M, PH - 36);

// ============================ EXECUTIVE SUMMARY ============================
doc.addPage(); y = M;
h1("What InCommand Mitiga Is");
para(
  "InCommand Mitiga is a unified command platform for emergency services and disaster management. It gives an incident commander one live picture of everything an incident touches (the situation and map, communications and field units, personnel readiness, resources and equipment, damage and population impact, and the ICS paperwork), instead of a scatter of spreadsheets, radios and whiteboards.",
);
y += 4;
para(
  "It is multi-tenant (each agency's data is isolated), local-first (it keeps working when the network drops), and real-time (units, video and status update live). It runs in the browser, as a desktop app, and installs on a tablet.",
);
y += 8;
h2("At a glance");
bullets([
  "One operating picture: every module feeds a single live command dashboard.",
  "Any industry, any risk: interoperable across fire, EMS, police, hazmat, hospital and emergency management, single-agency or multi-agency.",
  "Built around ICS: roles, forms (201/202/205…) and command posture map to how incident command actually works.",
  "Field-aware: live GPS units, bodycam video, distress/SOS, damage and outage plotting on the map.",
  "Resilient: offline-tolerant, self-healing live connections, and error capture built in.",
  "Secure by design: tenant isolation, role-based access, MFA, audit trail.",
]);
y += 6;
screenshot("01-dashboard.jpg", "Live command dashboard: the demo incident “Coastal Storm & Flood”, showing status, needs-attention, the common operating picture and live activity.");

// ============================ PLATFORM FOUNDATION ============================
doc.addPage(); y = M;
h1("Platform Foundation");
para("Cross-cutting capabilities every module is built on:");
y += 4;
h2("Architecture");
bullets([
  "Multi-tenant SaaS: row-level security isolates each organisation's data at the database.",
  "Local-first & offline: data lives on the device (IndexedDB) and syncs to the server; the workspace opens and runs even with the backend unreachable.",
  "Real-time: WebSocket telemetry, paging and signaling with auto-reconnect; live video over WebRTC.",
  "Cross-device sync: incidents, roster and attendance converge across every device and browser.",
  "Cross-platform: web app, Electron desktop app, and installable tablet (PWA) from one codebase.",
]);
y += 6;
h2("One connected system");
para(
  "Command dashboards, field bodycams, PTT radios, rugged tablets and vehicle trackers all run on a single platform, so every screen and every device sees the same live picture.",
);
y += 6;
figure("eco-devices.webp", 984 / 562, "One connected system: command dashboards, field bodycams, PTT radios and rugged field tablets on a single platform.");
y += 2;
h2("Multi-incident management");
para("Each incident is fully isolated with its own data, modules, ICS forms and map. Commanders open, run, and archive incidents from a single events hub, branded per organisation.");
y += 6;
screenshot("00-events.jpg", "Events hub: multiple incidents per organisation, each self-contained.");

// ============================ SECTIONS (screenshot-led) ============================
const sections = [
  {
    title: "Risk Management & Pre-Planning",
    intro:
      "Command does not start when the call comes in. InCommand Mitiga's risk tools let agencies map hazards, assess risk and pre-plan the response before an incident ever happens: any industry, any risk, on internationally-accepted ICS foundations.",
    caps: [
      "GIS-based risk mapping: map hazard and risk locations geographically, with data gathered through structured risk-assessment tools.",
      "Pre-planning: build incident action plans for known hazards and events in advance, ready to activate the moment they occur.",
      "Mitigation planning: turn assessed risks into mitigation plans, linked to the incidents they inform.",
      "Templated ICS plans: create single-agency and multi-agency response plans from templated ICS forms.",
      "Cross-boundary sharing: share risk maps and plans with other institutions and stakeholders on the fly, across organisational boundaries.",
      "Interoperable across services: ICS-based incident management for fire, EMS, police, hazmat, hospital and emergency management.",
    ],
    shots: [],
  },
  {
    title: "Situational Awareness & Command",
    intro:
      "The commander's single source of truth: incident identity, stage, location and the whole command picture in one place, with live analytics on top.",
    caps: [
      "Situation record: incident name, activation stage (Planning / Activated / Resolved), location and summary that flow into every screen, form and report.",
      "Command posture analytics: a live, cross-module read of readiness, progress, impact and infrastructure (e.g. “Critical” with the reasons why).",
      "Weather & environment: meteogram and conditions for the incident location.",
      "Load-shedding / utility status: regional power status for the affected area (South Africa-aware).",
    ],
    shots: [
      ["04-situation.jpg", "Situation: the incident's master record and stage."],
      ["09-analytics.jpg", "Analytics: command posture, crew readiness, qualifications, task and resource progress, refreshed live."],
    ],
  },
  {
    title: "Common Operating Picture (Mapping)",
    intro:
      "A live map that fuses everything geographic (units, personnel, damage, hazards, shelters and supply routes) with drawing and routing tools.",
    caps: [
      "Layered map: street, satellite and hybrid imagery, toggled per operator.",
      "Live field units: GPS positions, headings, trails and online/offline state on the map.",
      "Drawing tools: mark points, polygons and radius zones (incident areas, cordons, hazards).",
      "Damage & hazard plotting: click the map to log damage, road closures and outages with coordinates.",
      "Supply-route planning: multi-scenario routes (standard, traffic, riot, emergency, diversion) with hazard-avoidance.",
      "Geocoding & routing: turn an address into coordinates and driving routes (OpenStreetMap base, optional Google enrichment).",
    ],
    shots: [
      ["02-map-cop.jpg", "Common operating picture: live units, an incident zone, supply route and a full operational-layers panel over Cape Town."],
    ],
  },
  {
    title: "Communications & Live Video",
    intro:
      "A live radio room plus bodycam video: talk to field units, page them, and see distress the moment it happens.",
    caps: [
      "Channels: command and tactical nets mirrored from the ICS-205 communications plan.",
      "Push-to-talk: floor control per channel.",
      "Paging: send pages to units with delivery and acknowledgement receipts.",
      "Distress / SOS: a takeover banner and map auto-focus the instant a unit raises an alert (e.g. “Man-down”).",
      "Live bodycam video: units stream to a channel; the operator sees a tile per camera (multi-camera grid).",
      "Field-ready video: streams over local networks and out to public networks for cellular bodycams in the field.",
    ],
    shots: [
      ["03-comms-liveops.jpg", "Live Ops: command & tactical channels, push-to-talk, paging and per-channel video, with a live distress banner."],
    ],
  },
  {
    title: "Call-Taking & Dispatch (Resgrid)",
    intro:
      "Every incident starts with a call. InCommand Mitiga pairs with Resgrid, an open-source computer-aided dispatch (CAD) platform, so call-taking and unit dispatch flow straight into the command picture.",
    caps: [
      "Call-taking & CAD: create, prioritise, assign and close calls through a full computer-aided dispatch workflow, with multi-channel notifications and analytics.",
      "Unit dispatching: see unit availability and staffing, dispatch the right resources, and follow the response live.",
      "AVL & unit control: real-time GPS tracking, 13+ unit statuses, ETA calculation and fleet management for every vehicle and apparatus.",
      "Staffing & scheduling: shift calendars, self-service signups and shift trades that feed dispatch decisions.",
      "Multi-channel alerting: notify responders by push, SMS and email, with RSVP tracking.",
      "Shared operating map: calls, units, personnel and stations on a live map that lines up with the InCommand Mitiga command picture.",
    ],
    shots: [],
  },
  {
    title: "Bodycam Fleet & Device Onboarding",
    intro:
      "An organisation-wide fleet of Mitiga Sentinel FRZ07 bodycams, registered once and reused across every incident (full device specifications included in this overview).",
    caps: [
      "Device registry: a persistent catalogue of bodycams, separate from any single incident.",
      "Three-way onboarding: register by ID, paste a registration code, or generate a QR the bodycam scans to enrol itself.",
      "One-click deploy: drop a registered device into any incident as a live field unit.",
      "Presence: online/offline status from the device's own check-ins.",
    ],
    shots: [
      ["10-devices.jpg", "Device registry: QR onboarding and an org-wide bodycam fleet, reusable across incidents."],
    ],
  },
  {
    title: "Personnel, Roles & Readiness",
    intro:
      "Who's available, who's qualified, who's rested, and whether they can be deployed right now.",
    caps: [
      "Personnel roster: responders with ICS roles, online status and location.",
      "Deployment readiness: a live “ready / not deployable” verdict from certifications, fatigue and assignment.",
      "Roles & ICS structure: role groups and assignments (org chart).",
      "Rostering & fatigue: shift scheduling with on-duty-hours vs rest-limit tracking so nobody is deployed past a safe threshold.",
      "Certifications: qualification tracking with expiry (expired certs block deployment).",
      "Org-wide roster & attendance: a master staff list with experience history and daily attendance, synced across devices.",
    ],
    shots: [
      ["05-personnel.jpg", "Personnel: responder roster with live deployment-readiness (cert-aware)."],
    ],
  },
  {
    title: "Resources & Equipment",
    intro:
      "Every stock line and piece of gear: what you have, what's running low, and what's due for a check.",
    caps: [
      "Inventory & equipment: relief/first-aid stock plus special gear (PPE, extinguishers) with par levels, expiry and service intervals.",
      "Automatic flags: low/out-of-stock, expiring/expired and service-due items surfaced on sight.",
      "Resource requests: track each request through its lifecycle, from requested to en route, assigned and ready.",
    ],
    shots: [
      ["08-inventory.jpg", "Inventory: stock, expiry and maintenance tracking with automatic low/expired/service-due flags."],
    ],
  },
  {
    title: "Field Intelligence & Population Impact",
    intro:
      "The ground truth: structural damage, infrastructure outages, and the people affected.",
    caps: [
      "Damage assessment: log and classify structural damage with cost, status and map location.",
      "Road damages & closures: plot blocked or damaged routes.",
      "Utilities & outages: power outages and load-shedding status for the affected area.",
      "Residents & impact areas: affected population by area, auto-filled from census data (Statistics South Africa), with estimated-affected counts.",
      "Shelters: shelter management and registrations.",
    ],
    shots: [
      ["06-damage.jpg", "Damage assessment: classified structural damage with cost, status and coordinates."],
      ["11-residents.jpg", "Residents: census-backed affected-population tracking per impact area."],
    ],
  },
  {
    title: "ICS Documentation & Reporting",
    intro:
      "The paperwork incident command runs on: generated from the live incident, not retyped.",
    caps: [
      "ICS forms: 201 (Briefing), 202 (Objectives), 205 (Comms Plan) and more, seeded from the situation and kept current.",
      "Custom form builder: drag-and-drop surveys/checklists with ten field types, filled and collected in-app.",
      "Document library: live PDF / text exports of forms and records.",
      "One-click SITREP: a full situation report PDF (map snapshot, weather, status, personnel, forms and tables).",
      "Logs & audit: activity logging and an audit trail across the incident.",
    ],
    shots: [
      ["07-forms.jpg", "ICS forms: 201 / 202 / 205 generated from the live incident, plus a custom form & survey builder."],
    ],
  },
];

for (const s of sections) {
  doc.addPage(); y = M;
  h1(s.title);
  para(s.intro, MUTED, 10.5, 14);
  y += 6;
  h2("Capabilities");
  bullets(s.caps);
  y += 6;
  for (const [file, cap] of s.shots) screenshot(file, cap);
}

// ============================ VEHICLE & ASSET TRACKING ============================
doc.addPage(); y = M;
h1("Vehicle & Asset Tracking");
para(
  "Command needs to know where its vehicles are and whether they are carrying the right gear. InCommand Mitiga integrates professional Teltonika telematics and GPS Worx fleet tracking to put emergency vehicles and their critical equipment on the same live picture.",
  MUTED, 10.5, 14,
);
y += 8;
h2("Emergency Vehicle Tracking");
bullets([
  "Teltonika FMC150 GNSS trackers fitted to fire engines, ambulances and response vehicles for professional-grade, always-on location.",
  "Live location, speed and status on the GPS Worx fleet platform, feeding straight into the InCommand Mitiga operating picture.",
  "4G LTE (with 2G fallback) and multi-constellation GNSS (GPS / GLONASS / Galileo / BeiDou) for reliable positioning in the field.",
  "CAN-bus and OBDII vehicle data read straight from the vehicle: engine hours, RPM, fuel level, mileage, temperatures and fault codes.",
  "Driver identification via iButton / RFID, so command knows exactly who is operating each vehicle.",
  "Accident and crash detection, eco-driving and over-speed scoring, plus ignition, towing and GPS-jamming detection.",
  "Geofencing, trip history, digital inputs/outputs and over-the-air firmware updates for full fleet oversight.",
]);
y += 4;
figure("gpsworx-tracking.webp", 2000 / 1125, "GPS Worx: live emergency-vehicle tracking across the fleet, feeding the InCommand Mitiga command picture.");
y += 4;
h2("Critical Equipment Tracking");
bullets([
  "Teltonika Bluetooth tags attached to high-value, life-saving equipment.",
  "The vehicle's onboard tracker detects the tags aboard, so command knows a Jaws of Life is on the fire engine or a defibrillator is on the ambulance before it rolls.",
  "Instant flag when critical gear is missing from its assigned vehicle, or left behind on scene.",
  "One live inventory of the equipment that matters, tied to the vehicle that carries it.",
]);

// ============================ BODYCAM UNIT SPEC SHEET ============================
doc.addPage(); y = M;
h1("Bodycam Unit: Mitiga Sentinel FRZ07");
para(
  "The InCommand Mitiga field unit is the Sentinel FRZ07: a rugged, two-way-radio-styled Android handset purpose-built for field security, patrol and response, combining a body-worn camera, a duress radio and a connected smartphone in a single ruggedised unit.",
  MUTED, 10.5, 14,
);
y += 8;
specTable([
  {
    title: "Platform & Performance",
    rows: [
      ["Operating System", "Android (AOSP-based), rugged OEM build"],
      ["Processor", "Multi-core mobile SoC (quad / octa-core)"],
      ["Memory (RAM)", "4 GB"],
      ["Onboard Storage", "32 GB, expandable via microSD"],
      ["Connectivity", "4G / 5G LTE cellular data, Wi-Fi, Bluetooth, GPS / GLONASS"],
    ],
  },
  {
    title: "Camera & Imaging",
    rows: [
      ["Bodycam Camera", "Rear-facing HD video and photo capture"],
      ["Night Vision", "Infrared illuminator with automatic day / night switching"],
      ["Recording Modes", "Continuous, segmented, and hidden / covert capture"],
      ["Onboard Indicator", "Dedicated hardware LED recording indicator"],
    ],
  },
  {
    title: "Build & Field Readiness",
    rows: [
      ["Form Factor", "Two-way-radio-style handheld, chest / lapel mountable"],
      ["Durability", "Rugged sealed housing, drop and dust / water resistant"],
      ["Controls", "Dedicated physical side key for one-touch record / PTT"],
      ["Battery", "High-capacity, all-day field operation"],
      ["Display", "Compact daylight-readable touchscreen"],
    ],
  },
]);
y += 2;
para(
  "Specifications reflect the Sentinel FRZ07 platform as configured for the InCommand Mitiga deployment; exact battery capacity, imaging resolution and ingress-protection rating are confirmed per production configuration.",
  MUTED, 8.5, 12,
);

// ============================ FIELD UNIT SOFTWARE ============================
doc.addPage(); y = M;
h1("Field Unit: Onboard Software");
para(
  "Every Sentinel FRZ07 becomes a connected field unit: live location on a shared map, secure two-way voice and radio-style calling, on-demand live video to command, and automatic evidence capture, all coordinated through the InCommand Mitiga command dashboard.",
  MUTED, 10.5, 14,
);
y += 8;
h2("Live Location & Circle Safety");
bullets([
  "Always-on, high-accuracy GPS tracking shared in real time with the unit's assigned circle.",
  "One-touch SOS, man-down and duress alerts broadcast instantly to command and nearby units.",
  "Automatic offline / online presence detection, so command always knows which units are reachable.",
  "Private, invite-key circles keep location and comms scoped to the right group only.",
]);
h2("Recording & Evidence Capture");
bullets([
  "One-touch video and photo capture from the touchscreen or the dedicated hardware side key.",
  "Automatic night vision with seamless day / night camera switching.",
  "Long recordings auto-segment into clean, independently playable clips: no single unbounded file, no lost footage from one corruption.",
  "Every clip and photo is auto-tagged with timestamp, officer name and GPS location.",
  "Covert / hidden recording mode for discreet evidence capture.",
]);
h2("Live Video Streaming to Command");
bullets([
  "Command can remotely trigger any online bodycam to go live and stream its feed in real time.",
  "Low-bandwidth, publish-on-demand streaming: video only flows when needed, preserving cellular data.",
  "Multiple bodycams stream simultaneously into a single multi-camera live grid on the dashboard.",
  "Secure, authenticated publishing: only verified, enrolled devices can stream into a command channel.",
]);
h2("Voice & Radio-Style Calling");
bullets([
  "Secure 1:1 calling between circle members over encrypted SIP or WebRTC.",
  "Group and talkgroup push-to-talk, radio-net style, for whole-team coordination.",
  "Automatic fallback between calling paths so voice stays available as network conditions change.",
  "Radio-over-IP (RoIP) ready: bridges cleanly into existing two-way radio fleets.",
]);
h2("Enrolment & Security");
bullets([
  "Scan-to-register: point the bodycam at a QR code on the command dashboard and it self-enrols in seconds.",
  "Cryptographically signed device authentication (HMAC) for every call, stream and enrolment action.",
  "End-to-end encrypted media (TLS / SRTP) across voice, video and command-channel traffic.",
  "Self-hostable backend: run the entire command and calling infrastructure on your own private infrastructure.",
  "Kiosk-mode lockdown keeps the device fixed to the bodycam application in the field.",
]);

// ============================ NON-SCREENSHOT SECTIONS ============================
doc.addPage(); y = M;
h1("Security & Compliance");
para("Built for sensitive incident and personnel data across multiple agencies.");
y += 4;
bullets([
  "Tenant isolation: row-level security enforces per-organisation data separation at the database.",
  "Authentication: organisation (district) login with password, plus MFA / one-time codes.",
  "Role-based access control: per-module read/write permissions by ICS role.",
  "Account safety: admin invites, password resets, lockout and rate-limiting, session/JWT revocation, breached-password checks.",
  "Audit trail: a recorded history of actions across the incident.",
  "Hardened transport: strict content-security policy and security headers.",
]);
y += 8;
h1("Reliability & Resilience");
bullets([
  "Offline-tolerant workspace: opens and runs with the backend unreachable; changes queue and sync when it returns.",
  "Self-healing live connections: telemetry, comms and video reconnect automatically after drops or sleep.",
  "Error capture: client-side error boundaries isolate a failing panel (the rest of the console keeps working) and report issues so failures are seen, not silent.",
  "Installable & always-current: PWA install with automatic update on launch.",
]);
y += 8;
h1("Platforms & Deployment");
h2("Runs everywhere");
bullets([
  { t: "Web", d: "any modern browser." },
  { t: "Desktop", d: "an Electron app (Windows/macOS/Linux), either thin-client to the live server or a self-contained build." },
  { t: "Tablet & mobile", d: "installs from the browser as a full-screen app (PWA), online or offline." },
]);
y += 4;
h2("Infrastructure");
bullets([
  "Container stack: Postgres, object storage (S3/MinIO), Redis, live-video server and mail, via Docker.",
  "Scales out: multi-replica ready, managed-Postgres and Kubernetes-oriented.",
]);

// ============================ FIELD DEPLOYMENT ============================
doc.addPage(); y = M;
h1("Field Deployment & Connectivity");
para(
  "Built to run where incidents happen: on the network you have, on the devices your teams carry, alongside the systems you already run.",
);
y += 6;
bullets([
  { t: "Live field video", d: "bodycam and device video streamed into the command picture, over local networks or cellular." },
  { t: "Access anywhere", d: "hosted securely for your organisation so commanders, tablets and remote responders connect from anywhere." },
  { t: "Runs on your terms", d: "on your own infrastructure or in the cloud, with no per-device rebuild." },
  { t: "Fits your ecosystem", d: "integrates with Resgrid for call-taking and dispatch, and connects with the other systems agencies already run (radios, fleet)." },
  { t: "Always current", d: "the whole command team runs the latest version automatically, no manual updates." },
]);
y += 10;

setFill(LIGHT); setDraw(BORDER); doc.setLineWidth(1);
doc.roundedRect(M, y, CW, 84, 6, 6, "FD");
doc.setFont("helvetica", "bold"); doc.setFontSize(12); setText(NAVY);
doc.text("One platform, the whole incident.", M + 16, y + 26);
doc.setFont("helvetica", "normal"); doc.setFontSize(10); setText(INK);
const closing = doc.splitTextToSize(
  "From the first alert to the after-action report, InCommand Mitiga brings situation, map, comms, people, resources, impact and paperwork into one live, resilient command picture, replacing the scatter of tools an incident commander juggles.",
  CW - 32,
);
let ky = y + 44;
for (const ln of closing) { doc.text(ln, M + 16, ky); ky += 14; }

// ============================ FUTURE: FIRE & RISK SURVEYS (SSM) ============================
doc.addPage(); y = M;
chip("ON THE ROADMAP  ·  IN DEVELOPMENT", M, y, WHITE, [180, 83, 9]);
y += 24;
h1("The Future of Fire and Risk Surveys");
para(
  "A dedicated site-survey engine, now in development, that plugs straight into InCommand Mitiga. It reads floor and site plans directly from AutoCAD (DXF) files and turns them into live fire and life-safety maps, so the survey done before an incident becomes the plan command uses during it.",
);
y += 8;
figure(
  "ssm-3d.jpg",
  800 / 472,
  "Exploded 3D view of a multi-storey building: every floor and every life-safety marker in one model, read straight from the CAD drawing.",
  "incommand-mitiga · site survey",
);
h2("What it does");
bullets([
  { t: "Reads AutoCAD directly", d: "opens DXF floor and site plans and pulls them apart layer by layer, floor by floor, with no redrawing." },
  { t: "Maps life-safety assets", d: "places markers for emergency exits, stairs, assembly points, fire alarms, smoke detectors, extinguishers, hoses and hydrants." },
  { t: "Flags risks and hazards", d: "pins hazards and risk points to the exact spot on the plan." },
  { t: "Handles multi-storey buildings", d: "splits one drawing into floors by layer and plans each level on its own (ground, level 1, level 2 and up)." },
  { t: "Plan and 3D views", d: "switches between a flat plan and a full 3D model for briefings, walkthroughs and pre-incident familiarisation." },
  { t: "Shareable life-safety sheets", d: "exports a marked-up plan as a fire and life-safety PDF for crews and building owners." },
]);
y += 8;
figure(
  "ssm-planview.jpg",
  800 / 472,
  "Ground-floor plan with life-safety markers on the CAD drawing: assembly point, extinguishers, hydrant, alarms and marked emergency exits.",
  "incommand-mitiga · site survey",
  0.8,
);
figure(
  "ssm-site.jpg",
  800 / 472,
  "Site plan in 3D: building footprint, roof, parking and access, for site-wide pre-planning and approach.",
  "incommand-mitiga · site survey",
  0.8,
);
{
  const nb = doc.splitTextToSize(
    "This engine is in active development and is not yet part of the live platform. It is shown here as a preview of where InCommand Mitiga is heading: pre-incident risk mitigation and prevention, feeding directly into the command picture responders use on the day.",
    CW - 32,
  );
  const nbH = nb.length * 13 + 34;
  need(nbH + 12);
  setFill([255, 248, 237]); setDraw([246, 205, 150]); doc.setLineWidth(1);
  doc.roundedRect(M, y, CW, nbH, 6, 6, "FD");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); setText([180, 83, 9]);
  doc.text("Preview of what's coming", M + 16, y + 20);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); setText(INK);
  let ny = y + 36;
  for (const ln of nb) { doc.text(ln, M + 16, ny); ny += 13; }
  y += nbH + 8;
}

// ============================ COMPLETE SUITE (visual grid) ============================
doc.addPage(); y = M;
h1("The Complete Suite");
para("One platform, from risk to recovery. Every capability, connected.", MUTED, 11, 15);
y += 12;

const PH_COLORS = {
  plan: [180, 83, 9],
  command: [13, 148, 136],
  resource: [37, 99, 235],
  field: [51, 65, 85],
};
const suiteTiles = [
  ["Risk & Pre-Planning", "GIS hazard mapping, pre-plans, mitigation", "plan"],
  ["Situation & Analytics", "Stage, command posture, weather", "command"],
  ["Common Operating Picture", "Live map: units, zones, routes", "command"],
  ["Communications & PTT", "Channels, paging, distress alerts", "command"],
  ["Live Bodycam Video", "Multi-camera streams to command", "command"],
  ["Call-Taking & Dispatch", "Resgrid CAD integration", "command"],
  ["Personnel & Readiness", "Roster, fatigue, certifications", "resource"],
  ["Resources & Equipment", "Inventory, requests, gear", "resource"],
  ["Field Intelligence", "Damage, outages, residents", "resource"],
  ["Vehicle & Asset Tracking", "Teltonika FMC150 + GPS Worx", "field"],
  ["Sentinel FRZ07 Devices", "Rugged bodycam field units", "field"],
  ["ICS Docs & Reporting", "201 / 202 / 205, SITREP, audit", "field"],
];
const cols = 3, colGap = 12, rowGap = 12;
const tileW = (CW - (cols - 1) * colGap) / cols;
const tileH = 94;
const gridTop = y;
suiteTiles.forEach((t, i) => {
  const col = i % cols, row = Math.floor(i / cols);
  const x = M + col * (tileW + colGap);
  const ty = gridTop + row * (tileH + rowGap);
  const c = PH_COLORS[t[2]];
  setFill([250, 251, 253]); setDraw(BORDER); doc.setLineWidth(1);
  doc.roundedRect(x, ty, tileW, tileH, 6, 6, "FD");
  setFill(c); doc.roundedRect(x, ty, tileW, 4, 2, 2, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); setText(NAVY);
  const tl = doc.splitTextToSize(t[0], tileW - 26).slice(0, 2);
  let tyy = ty + 24;
  tl.forEach((ln) => { doc.text(ln, x + 13, tyy); tyy += 12; });
  doc.setFont("helvetica", "normal"); doc.setFontSize(7.8); setText(MUTED);
  const dl = doc.splitTextToSize(t[1], tileW - 24).slice(0, 3);
  let dyy = Math.max(tyy + 4, ty + 52);
  dl.forEach((ln) => { doc.text(ln, x + 13, dyy); dyy += 10; });
});
y = gridTop + 4 * (tileH + rowGap) + 8;

// legend
const legend = [["plan", "Plan"], ["command", "Command & Respond"], ["resource", "People & Resources"], ["field", "Field & Records"]];
let lx = M;
doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
legend.forEach(([k, label]) => {
  setFill(PH_COLORS[k]); doc.circle(lx + 3, y - 3, 3.2, "F");
  setText(INK); doc.text(label, lx + 12, y);
  lx += doc.getTextWidth(label) + 34;
});

// ============================ WHY INCOMMAND MITIGA ============================
doc.addPage(); y = M;
h1("Why InCommand Mitiga");
para(
  "Most agencies run a drawer full of disconnected tools. InCommand Mitiga replaces the scatter with one platform built for the way incidents actually run.",
  MUTED, 11, 15,
);
y += 14;
const whys = [
  ["One platform, not ten", "Situation, map, comms, video, people, resources, impact and ICS paperwork in a single live picture, not a dozen tabs and radios."],
  ["ICS-native", "Built around the incident command system your teams already use: forms, roles, status boards and after-action reporting come standard."],
  ["Works in the field", "Runs on the network you have. Opens offline, queues changes, and self-heals live video, comms and telemetry after drops."],
  ["Command to the field edge", "Bodycams, vehicles and tagged equipment report onto the same map the commander is already looking at."],
  ["Your data, your terms", "Tenant-isolated and self-hostable, on your own infrastructure or in the cloud, with a full audit trail."],
  ["Ready for what is next", "An open, integrating platform (Resgrid, Teltonika, GPS Worx) with a site-survey engine and more on the roadmap."],
];
{
  const wc = 2, wGap = 14;
  const wW = (CW - (wc - 1) * wGap) / wc;
  const wH = 106;
  const wTop = y;
  whys.forEach((w2, i) => {
    const col = i % wc, row = Math.floor(i / wc);
    const x = M + col * (wW + wGap);
    const ty = wTop + row * (wH + wGap);
    setFill([250, 251, 253]); setDraw(BORDER); doc.setLineWidth(1);
    doc.roundedRect(x, ty, wW, wH, 6, 6, "FD");
    setFill(TEAL); doc.circle(x + 17, ty + 21, 3.6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); setText(NAVY);
    const tl = doc.splitTextToSize(w2[0], wW - 40);
    doc.text(tl[0], x + 28, ty + 24);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); setText(INK);
    const dl = doc.splitTextToSize(w2[1], wW - 32);
    let dy = ty + 44;
    dl.forEach((ln) => { doc.text(ln, x + 16, dy); dy += 12; });
  });
  y = wTop + 3 * (wH + wGap) + 8;
}

// ============================ FOOTERS ============================
const pages = doc.getNumberOfPages();
for (let i = 2; i <= pages; i++) {
  doc.setPage(i);
  setDraw(BORDER); doc.setLineWidth(0.6);
  doc.line(M, PH - 40, PW - M, PH - 40);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); setText(MUTED);
  doc.text("InCommand Mitiga Capabilities Overview", M, PH - 26);
  doc.text(`${i} / ${pages}`, PW - M - 24, PH - 26);
  doc.setFont("helvetica", "italic"); setText([150, 160, 172]);
  doc.text("Emergency & Disaster Command Platform", PW / 2 - 72, PH - 26);
}

doc.save(OUT);
// eslint-disable-next-line no-console
console.log("Wrote", OUT, ":", pages, "pages");
