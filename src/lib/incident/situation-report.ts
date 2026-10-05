import { jsPDF } from "jspdf";

import { dashboardStats } from "./stats";
import type { IncidentState } from "./types";

export type SitrepWeather = {
  tempC: number | null;
  feelsLikeC: number | null;
  conditionLabel: string;
  windMs: number | null;
  windDirLabel: string;
  humidity: number | null;
  risks: string[];
} | null;

export type SituationReport = ReturnType<typeof buildSituationReport>;

const ACTIVATION_LABEL: Record<string, string> = {
  planning: "Planning",
  activated: "Activated",
  closed: "Resolved",
};

function elapsed(startIso: string, now: number): string {
  const start = new Date(startIso).getTime();
  if (Number.isNaN(start)) return "—";
  const ms = Math.max(0, now - start);
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  return d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((ms % 3600000) / 60000)}m`;
}

/** Gather the whole operating picture into a flat, PDF-ready structure. */
export function buildSituationReport(
  state: IncidentState,
  opts: { preparedBy: string; now?: number } = { preparedBy: "Operator" },
) {
  const now = opts.now ?? Date.now();
  const s = dashboardStats(state);
  const { situation } = state;

  const activeDistress = state.distressEvents.filter(
    (d) => d.status === "active" || d.status === "acknowledged",
  );
  const offlineUnits = state.fieldUnits.filter((u) => u.status === "offline").length;
  const sheltersOver = state.shelters.filter((x) => x.capacity > 0 && x.occupancy > x.capacity).length;
  const bedsTotal = state.shelters.reduce((n, x) => n + Math.max(0, x.capacity), 0);
  const bedsUsed = state.shelters.reduce((n, x) => n + Math.max(0, x.occupancy), 0);

  const alerts: string[] = [];
  if (activeDistress.length) alerts.push(`${activeDistress.length} active distress signal(s)`);
  if (sheltersOver) alerts.push(`${sheltersOver} shelter(s) over capacity`);
  if (s.severeDamage) alerts.push(`${s.severeDamage} severe damage site(s)`);
  if (s.roadClosed) alerts.push(`${s.roadClosed} road(s) closed`);
  if (offlineUnits) alerts.push(`${offlineUnits} field unit(s) offline`);
  if (s.electricityOutages > 0) alerts.push(`${s.electricityOutages.toLocaleString()} without power`);

  // Forms filled — ICS + custom, as a LIST (not the form contents).
  const icsForms = state.forms.map((f) => ({
    name: f.name,
    ref: f.formNumber ? `ICS ${f.formNumber}` : "ICS form",
    status: f.status ?? "draft",
    saved: f.savedAt ? new Date(f.savedAt).toISOString().slice(0, 16).replace("T", " ") : "—",
    by: f.filledBy ?? "—",
  }));
  const customForms = state.customForms.map((f) => ({
    name: f.name,
    ref: f.kind === "survey" ? "Survey" : f.kind === "checklist" ? "Checklist" : "Form",
    status: f.status,
    saved: `${f.responses.length} response(s)`,
    by: "—",
  }));

  return {
    generatedAt: new Date(now).toISOString(),
    preparedBy: opts.preparedBy || "Operator",
    incident: {
      name: situation.name || "Untitled incident",
      activation: ACTIVATION_LABEL[situation.activationLevel] ?? situation.activationLevel,
      location: situation.location || "—",
      hasCoords: situation.lat != null && situation.lng != null,
      coords: situation.lat != null && situation.lng != null ? `${situation.lat.toFixed(4)}, ${situation.lng.toFixed(4)}` : "—",
      elapsed: situation.startDate ? elapsed(situation.startDate, now) : "—",
      opPeriods: s.operationalPeriodCount,
    },
    situationText: {
      summary: situation.summary || "",
      objectives: situation.objectives || "",
    },
    alerts,
    status: {
      personnelOnline: s.personnelOnline,
      personnelTotal: s.personnelTotal,
      unitsLive: state.fieldUnits.length - offlineUnits,
      unitsTotal: state.fieldUnits.length,
      unitsOffline: offlineUnits,
      tasksOpen: s.taskCounts.not_started + s.taskCounts.in_progress,
      tasksDone: s.taskCounts.complete,
      tasksTotal: s.taskCounts.not_started + s.taskCounts.in_progress + s.taskCounts.complete + s.taskCounts.canceled,
      requestsPending: s.resourceRequests.requested + s.resourceRequests.enroute + s.resourceRequests.assigned,
      requestsReady: s.resourceRequests.ready,
      bedsUsed,
      bedsTotal,
      sheltersTotal: s.sheltersTotal,
      sheltersOver,
      severeDamage: s.severeDamage,
      minorDamage: s.minorDamage,
      roadsClosed: s.roadClosed,
      roadsOneLane: s.roadOneLane,
      withoutPower: s.electricityOutages,
      residentsAffected: s.estimatedAffectedTotal,
      activeDistress: activeDistress.length,
    },
    personnel: state.personnel.map((p) => ({
      name: p.name || "—",
      role: p.role || "—",
      online: p.online ? "On" : "Off",
    })),
    fieldUnits: state.fieldUnits.map((u) => ({
      callsign: u.callsign || "—",
      status: u.status,
    })),
    forms: [...icsForms, ...customForms],
    resourceRequests: state.resourceRequests.map((r) => ({
      resource: r.resource || "—",
      status: r.status,
    })),
    roadsClosed: state.roadDamages
      .filter((r) => r.status === "closed")
      .map((r) => ({
        road: r.roadName || "—",
        segment: [r.fromIntersection, r.toIntersection].filter(Boolean).join(" → ") || "—",
        reason: r.reason || "—",
      })),
    shelters: state.shelters.map((sh) => ({
      name: sh.name || "—",
      status: sh.status,
      occ: `${sh.occupancy}${sh.capacity ? ` / ${sh.capacity}` : ""}`,
    })),
    recentLog: state.logs.slice(0, 12).map((l) => ({
      time: new Date(l.createdAt).toISOString().slice(5, 16).replace("T", " "),
      author: l.author || "—",
      message: l.message || "",
    })),
  };
}

/* ─────────────────────────── PDF rendering ─────────────────────────── */

const INK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];
const RULE: [number, number, number] = [226, 232, 240];
const ACCENT: [number, number, number] = [13, 148, 136];

export function situationReportToPdf(
  sitrep: SituationReport,
  extras: { mapImage: string | null; weather: SitrepWeather },
): { filename: string; blob: Blob } {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 44;
  const maxW = pageW - M * 2;
  let y = M;

  const ensure = (need: number) => {
    if (y + need > pageH - M) {
      footer();
      doc.addPage();
      y = M;
    }
  };
  const text = (
    t: string,
    o: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {},
  ) => {
    const size = o.size ?? 10;
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(o.color ?? INK));
    const indent = o.indent ?? 0;
    for (const line of doc.splitTextToSize(t, maxW - indent) as string[]) {
      ensure(size + 4);
      doc.text(line, M + indent, y);
      y += size + 4;
    }
    y += o.gap ?? 0;
  };
  const sectionTitle = (t: string) => {
    ensure(24);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...ACCENT);
    doc.text(t.toUpperCase(), M, y);
    y += 8;
    doc.setDrawColor(...ACCENT);
    doc.line(M, y, M + 60, y);
    y += 12;
  };
  let pageNo = 0;
  const footer = () => {
    pageNo += 1;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `${sitrep.incident.name} — Situation Report`,
      M,
      pageH - 22,
    );
    doc.text(`Page ${pageNo}`, pageW - M, pageH - 22, { align: "right" });
  };

  // Simple 2-col table helper.
  const table = (headers: string[], rows: string[][], widths: number[]) => {
    const rowH = 15;
    const drawHead = () => {
      ensure(rowH + 2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...MUTED);
      let x = M;
      headers.forEach((h, i) => {
        doc.text(h.toUpperCase(), x, y);
        x += widths[i]!;
      });
      y += 6;
      doc.setDrawColor(...RULE);
      doc.line(M, y, pageW - M, y);
      y += 8;
    };
    drawHead();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...INK);
    for (const row of rows) {
      ensure(rowH);
      let x = M;
      row.forEach((cell, i) => {
        const lines = doc.splitTextToSize(String(cell), widths[i]! - 6) as string[];
        doc.text(lines[0] ?? "", x, y);
        x += widths[i]!;
      });
      y += rowH;
    }
  };

  // ── Header banner ──
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 76, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(255, 255, 255);
  doc.text(sitrep.incident.name, M, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(203, 213, 225);
  const gen = new Date(sitrep.generatedAt);
  doc.text(
    `SITUATION REPORT · ${sitrep.incident.activation} · Generated ${gen.toISOString().slice(0, 16).replace("T", " ")} UTC`,
    M,
    52,
  );
  doc.text(
    `${sitrep.incident.location} · ${sitrep.incident.elapsed} elapsed · ${sitrep.incident.opPeriods} op period(s) · Prepared by ${sitrep.preparedBy}`,
    M,
    66,
  );
  y = 96;

  // ── Alerts ──
  if (sitrep.alerts.length) {
    doc.setFillColor(254, 242, 242);
    const boxH = 16 + sitrep.alerts.length * 12;
    doc.setDrawColor(220, 38, 38);
    doc.roundedRect(M, y, maxW, boxH, 4, 4, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(220, 38, 38);
    doc.text("NEEDS ATTENTION", M + 8, y + 13);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(153, 27, 27);
    let ay = y + 26;
    for (const a of sitrep.alerts) {
      doc.text(`•  ${a}`, M + 8, ay);
      ay += 12;
    }
    y += boxH + 12;
  }

  // ── Map snapshot ──
  sectionTitle("Common operating picture");
  if (extras.mapImage) {
    const imgW = maxW;
    const imgH = Math.round((imgW * 540) / 960);
    ensure(imgH + 6);
    try {
      doc.addImage(extras.mapImage, "PNG", M, y, imgW, imgH);
      doc.setDrawColor(...RULE);
      doc.rect(M, y, imgW, imgH);
      y += imgH + 4;
      text(`Incident: ${sitrep.incident.coords}`, { size: 8, color: MUTED, gap: 4 });
    } catch {
      text("Map image could not be embedded.", { size: 9, color: MUTED });
    }
  } else {
    text("Map snapshot unavailable (offline or no incident coordinates set).", {
      size: 9,
      color: MUTED,
    });
  }

  // ── Weather ──
  sectionTitle("Weather");
  const w = extras.weather;
  if (w) {
    const parts = [
      w.tempC != null ? `${Math.round(w.tempC)}°C` : null,
      w.conditionLabel || null,
      w.feelsLikeC != null ? `feels ${Math.round(w.feelsLikeC)}°C` : null,
      w.windMs != null ? `wind ${w.windMs.toFixed(1)} m/s ${w.windDirLabel}` : null,
      w.humidity != null ? `humidity ${Math.round(w.humidity)}%` : null,
    ].filter(Boolean);
    text(parts.join("  ·  "), { size: 11, bold: true, gap: 2 });
    if (w.risks.length) text(`Risk: ${w.risks.join("; ")}`, { size: 9, color: [217, 119, 6] });
    else text("No significant weather risk in the forecast window.", { size: 9, color: MUTED });
  } else {
    text("Weather unavailable (no coordinates set or provider unreachable).", { size: 9, color: MUTED });
  }

  // ── Operational status ──
  sectionTitle("Operational status");
  const st = sitrep.status;
  const statusRows: [string, string][] = [
    ["Personnel online", `${st.personnelOnline} / ${st.personnelTotal}`],
    ["Field units live", `${st.unitsLive} / ${st.unitsTotal}${st.unitsOffline ? ` (${st.unitsOffline} offline)` : ""}`],
    ["Tasks", `${st.tasksOpen} open · ${st.tasksDone}/${st.tasksTotal} done`],
    ["Resource requests", `${st.requestsPending} pending · ${st.requestsReady} ready`],
    ["Shelters", `${st.bedsUsed}${st.bedsTotal ? ` / ${st.bedsTotal} beds` : ""}${st.sheltersOver ? ` · ${st.sheltersOver} over capacity` : ""}`],
    ["Damage", `${st.severeDamage} severe · ${st.minorDamage} minor`],
    ["Roads", `${st.roadsClosed} closed · ${st.roadsOneLane} one-lane`],
    ["Power", `${st.withoutPower.toLocaleString()} without power`],
    ["Residents affected", st.residentsAffected.toLocaleString()],
    ["Active distress", String(st.activeDistress)],
  ];
  doc.setFontSize(9.5);
  for (const [k, v] of statusRows) {
    ensure(14);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(k, M, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(v, M + 160, y);
    y += 14;
  }

  // ── Situation narrative ──
  if (sitrep.situationText.summary || sitrep.situationText.objectives) {
    sectionTitle("Situation");
    if (sitrep.situationText.summary) {
      text("Summary", { size: 9, bold: true, color: MUTED });
      text(sitrep.situationText.summary, { size: 10, gap: 4 });
    }
    if (sitrep.situationText.objectives) {
      text("Objectives", { size: 9, bold: true, color: MUTED });
      text(sitrep.situationText.objectives, { size: 10, gap: 4 });
    }
  }

  // ── Personnel operating ──
  sectionTitle(`Personnel operating (${sitrep.personnel.length})`);
  if (sitrep.personnel.length) {
    table(
      ["Name", "Role", "Status"],
      sitrep.personnel.map((p) => [p.name, p.role, p.online]),
      [maxW * 0.45, maxW * 0.4, maxW * 0.15],
    );
  } else text("No personnel recorded.", { size: 9, color: MUTED });

  // ── Forms filled ──
  sectionTitle(`Forms filled (${sitrep.forms.length})`);
  if (sitrep.forms.length) {
    table(
      ["Form", "Type", "Status", "Saved / by"],
      sitrep.forms.map((f) => [f.name, f.ref, f.status, `${f.saved}${f.by !== "—" ? ` · ${f.by}` : ""}`]),
      [maxW * 0.34, maxW * 0.16, maxW * 0.16, maxW * 0.34],
    );
  } else text("No forms created.", { size: 9, color: MUTED });

  // ── Resource requests ──
  if (sitrep.resourceRequests.length) {
    sectionTitle(`Resource requests (${sitrep.resourceRequests.length})`);
    table(
      ["Resource", "Status"],
      sitrep.resourceRequests.map((r) => [r.resource, r.status]),
      [maxW * 0.7, maxW * 0.3],
    );
  }

  // ── Road closures ──
  if (sitrep.roadsClosed.length) {
    sectionTitle(`Road closures (${sitrep.roadsClosed.length})`);
    table(
      ["Road", "Segment", "Reason"],
      sitrep.roadsClosed.map((r) => [r.road, r.segment, r.reason]),
      [maxW * 0.3, maxW * 0.4, maxW * 0.3],
    );
  }

  // ── Shelters ──
  if (sitrep.shelters.length) {
    sectionTitle(`Shelters (${sitrep.shelters.length})`);
    table(
      ["Shelter", "Status", "Occupancy"],
      sitrep.shelters.map((sh) => [sh.name, sh.status, sh.occ]),
      [maxW * 0.5, maxW * 0.25, maxW * 0.25],
    );
  }

  // ── Recent activity ──
  if (sitrep.recentLog.length) {
    sectionTitle("Recent activity");
    doc.setFontSize(9);
    for (const l of sitrep.recentLog) {
      ensure(13);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...MUTED);
      doc.text(l.time, M, y);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...INK);
      const line = (doc.splitTextToSize(`${l.author}: ${l.message}`, maxW - 70) as string[])[0] ?? "";
      doc.text(line, M + 70, y);
      y += 13;
    }
  }

  footer();

  const slug =
    (sitrep.incident.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "incident").slice(0, 60);
  const filename = `sitrep-${slug}-${sitrep.generatedAt.slice(0, 10)}.pdf`;
  return { filename, blob: doc.output("blob") };
}
