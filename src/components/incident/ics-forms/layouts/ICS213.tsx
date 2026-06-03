"use client";

import { FemaField, FemaPageFooter, FemaPreparedBy, FemaShell, FemaTextArea } from "../primitives";
import type { FemaLayoutProps } from "./ICS201";

export function ICS213Layout({ fields, setField }: FemaLayoutProps) {
  return (
    <FemaShell title="GENERAL MESSAGE (ICS 213)" subtitle="ICS 213" version="Version 3.0">
      <section className="fema-ics-form__page">
        <div className="fema-ics-form__row fema-ics-form__row--3">
          <FemaField
            label="1. Incident Name:"
            value={fields.incidentName ?? ""}
            onChange={(v) => setField("incidentName", v)}
          />
          <FemaField
            label="2. To:"
            value={fields.to ?? ""}
            onChange={(v) => setField("to", v)}
          />
          <FemaField
            label="3. From:"
            value={fields.from ?? ""}
            onChange={(v) => setField("from", v)}
          />
        </div>
        <div className="fema-ics-form__row fema-ics-form__row--2">
          <FemaField
            label="4. Subject:"
            value={fields.subject ?? ""}
            onChange={(v) => setField("subject", v)}
          />
          <FemaField
            label="5. Date/Time:"
            value={fields.dateTime ?? ""}
            onChange={(v) => setField("dateTime", v)}
            type="datetime-local"
          />
        </div>
        <FemaTextArea
          label="6. Message:"
          value={fields.message ?? ""}
          onChange={(v) => setField("message", v)}
          tall
        />
        <div className="fema-ics-form__213-parts">
          <div className="fema-ics-form__213-part">
            <h3>ORIGINAL</h3>
            <FemaTextArea
              label=""
              value={fields.originalCopy ?? ""}
              onChange={(v) => setField("originalCopy", v)}
              tall
            />
          </div>
          <div className="fema-ics-form__213-part">
            <h3>REPLY</h3>
            <FemaTextArea
              label=""
              value={fields.replyCopy ?? ""}
              onChange={(v) => setField("replyCopy", v)}
              tall
            />
          </div>
          <div className="fema-ics-form__213-part">
            <h3>RECEIPT</h3>
            <FemaTextArea
              label=""
              value={fields.receiptCopy ?? ""}
              onChange={(v) => setField("receiptCopy", v)}
              tall
            />
          </div>
        </div>
        <FemaPreparedBy blockNumber="7" fields={fields} onChange={setField} />
        <FemaPageFooter formId="ICS 213" page={1} />
      </section>
    </FemaShell>
  );
}
