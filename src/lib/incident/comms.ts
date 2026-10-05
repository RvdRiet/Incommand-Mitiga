import { parseTableField } from "./ics-form-fields";
import { parseFormContent } from "./ics-forms-catalog";
import { newId } from "./id";
import type { Channel, IcsFormRecord } from "./types";

/** Column order of the ICS-205 "Basic Radio Channel Use" table (see ICS205 layout). */
const CHANNEL_COLS = [
  "zoneGrp",
  "chNum",
  "function",
  "channelName",
  "rxFreq",
  "rxTone",
  "txFreq",
  "txTone",
  "mode",
  "remarks",
];

const CHANNEL_COLORS = [
  "#2563eb",
  "#0d9488",
  "#d97706",
  "#7c3aed",
  "#dc2626",
  "#0284c7",
  "#65a30d",
  "#db2777",
];

export function channelColor(index: number): string {
  return CHANNEL_COLORS[index % CHANNEL_COLORS.length];
}

/** Locate the incident's ICS-205 (Communications Plan), if one exists. */
export function findICS205(forms: IcsFormRecord[]): IcsFormRecord | undefined {
  return forms.find(
    (f) =>
      f.templateId === "ICS-205" ||
      f.formNumber === "205" ||
      /\b205\b/.test(f.formNumber ?? ""),
  );
}

/**
 * The "goes live" transform: turn the ICS-205 channel rows into Channel configs.
 * Reconciles against existing channels on a stable per-row id so operational
 * bindings (SIP/video rooms, colour) survive edits to the plan.
 */
export function channelsFromICS205(form: IcsFormRecord, existing: Channel[]): Channel[] {
  const { fields } = parseFormContent(form.content, form.templateId);
  const rows = parseTableField(fields.channelRows, CHANNEL_COLS);
  const byRow = new Map(existing.map((c) => [c.sourceRowId, c]));

  const out: Channel[] = [];
  rows.forEach((r, i) => {
    const name = (r.channelName || "").trim();
    if (!name) return;
    const sourceRowId = `${form.id}:${i}`;
    const prev = byRow.get(sourceRowId);
    const fn = (r.function || "").trim();
    out.push({
      id: prev?.id ?? newId(),
      name,
      function: fn,
      mode: /command|cmd/i.test(fn) ? "open_net" : "ptt",
      color: prev?.color ?? channelColor(out.length),
      sourceFormId: form.id,
      sourceRowId,
      sipRoom: prev?.sipRoom ?? null,
      videoRoom: prev?.videoRoom ?? null,
      pageEnabled: prev?.pageEnabled ?? true,
      radio: { rxFreq: r.rxFreq, txFreq: r.txFreq, mode: r.mode },
    });
  });
  return out;
}
