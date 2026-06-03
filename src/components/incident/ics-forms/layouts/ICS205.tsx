"use client";

import {
  FemaField,
  FemaPageFooter,
  FemaPreparedBy,
  FemaShell,
  FemaTable,
  FemaTextArea,
  useTableField,
} from "../primitives";
import type { FemaLayoutProps } from "./ICS201";

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
const CHANNEL_LABELS: Record<string, string> = {
  zoneGrp: "Zone Grp.",
  chNum: "Ch #",
  function: "Function",
  channelName: "Channel Name/Trunked Radio System Talkgroup Assignment",
  rxFreq: "RX Freq N or W",
  rxTone: "RX Tone/NAC",
  txFreq: "TX Freq N or W",
  txTone: "TX Tone/NAC",
  mode: "Mode (A, D, or M)",
  remarks: "Remarks",
};

export function ICS205Layout({ fields, setField }: FemaLayoutProps) {
  const channels = useTableField(fields, "channelRows", CHANNEL_COLS, 10, setField);

  return (
    <FemaShell
      title="INCIDENT RADIO COMMUNICATIONS PLAN (ICS 205)"
      subtitle="ICS 205"
      version="Version 3.0"
    >
      <section className="fema-ics-form__page">
        <div className="fema-ics-form__row fema-ics-form__row--2">
          <FemaField
            label="1. Incident Name:"
            value={fields.incidentName ?? ""}
            onChange={(v) => setField("incidentName", v)}
          />
          <div className="fema-ics-form__field">
            <span>2. Date/Time Prepared:</span>
            <div className="fema-ics-form__row fema-ics-form__row--2" style={{ marginBottom: 0 }}>
              <FemaField
                label="Date:"
                value={fields.datePrepared ?? ""}
                onChange={(v) => setField("datePrepared", v)}
                type="date"
              />
              <FemaField
                label="Time:"
                value={fields.timePrepared ?? ""}
                onChange={(v) => setField("timePrepared", v)}
                type="time"
              />
            </div>
          </div>
        </div>
        <div className="fema-ics-form__field">
          <span>3. Operational Period:</span>
          <div className="fema-ics-form__row fema-ics-form__row--2" style={{ marginBottom: 0 }}>
            <FemaField
              label="Date From:"
              value={fields.opDateFrom ?? ""}
              onChange={(v) => setField("opDateFrom", v)}
              type="date"
            />
            <FemaField
              label="Date To:"
              value={fields.opDateTo ?? ""}
              onChange={(v) => setField("opDateTo", v)}
              type="date"
            />
          </div>
          <div className="fema-ics-form__row fema-ics-form__row--2" style={{ marginBottom: 0 }}>
            <FemaField
              label="Time From:"
              value={fields.opTimeFrom ?? ""}
              onChange={(v) => setField("opTimeFrom", v)}
              type="time"
            />
            <FemaField
              label="Time To:"
              value={fields.opTimeTo ?? ""}
              onChange={(v) => setField("opTimeTo", v)}
              type="time"
            />
          </div>
        </div>
        <p className="fema-ics-form__block-title">4. Basic Radio Channel Use:</p>
        <FemaTable
          columns={CHANNEL_COLS}
          columnLabels={CHANNEL_LABELS}
          rows={channels.rows}
          minRows={10}
          onChange={channels.onChange}
        />
        <FemaTextArea
          label="5. Special Instructions:"
          value={fields.specialInstructions ?? ""}
          onChange={(v) => setField("specialInstructions", v)}
        />
        <div className="fema-ics-form__prepared">
          <span className="fema-ics-form__prepared-label" style={{ gridColumn: "1 / -1" }}>
            6. Prepared by (Communications Unit Leader):
          </span>
          <FemaField
            label="Name:"
            value={fields.preparedName ?? ""}
            onChange={(v) => setField("preparedName", v)}
          />
          <FemaField
            label="Signature:"
            value={fields.preparedSignature ?? ""}
            onChange={(v) => setField("preparedSignature", v)}
          />
        </div>
        <FemaPageFooter formId="ICS 205 IAP Page _____" page={1} />
      </section>
    </FemaShell>
  );
}
