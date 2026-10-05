"use client";

import { QRCodeSVG } from "qrcode.react";
import { useState } from "react";

import { useDeviceRegistry, useDeviceRegistryHydrated } from "@/lib/devices/store";
import { devicePresence, useNow } from "@/lib/devices/presence";
import { buildDeviceQrPayload } from "@/lib/devices/types";
import { BackLink } from "@/components/ui/BackLink";
import { IconScan, IconSend } from "@/components/ui/icons";
import { useEventsStore } from "@/lib/events/store";
import { getIncidentStore } from "@/lib/incident/incident-store-registry";

import { DeviceEnroll } from "./DeviceEnroll";
import { DeviceQrScanner } from "./DeviceQrScanner";

function timeAgo(iso: string | null): string {
  if (!iso) return "never seen";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `seen ${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `seen ${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `seen ${h}h ago`;
  return `seen ${Math.floor(h / 24)}d ago`;
}

export function DeviceRegistryPage() {
  const hydrated = useDeviceRegistryHydrated();
  const devices = useDeviceRegistry((s) => s.devices);
  const upsertDevice = useDeviceRegistry((s) => s.upsertDevice);
  const registerFromPayload = useDeviceRegistry((s) => s.registerFromPayload);
  const updateDevice = useDeviceRegistry((s) => s.updateDevice);
  const removeDevice = useDeviceRegistry((s) => s.removeDevice);
  const events = useEventsStore((s) => s.events);
  const now = useNow();

  const [id, setId] = useState("");
  const [callsign, setCallsign] = useState("");
  const [model, setModel] = useState("L310");
  const [circle, setCircle] = useState("");
  const [scan, setScan] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const addManual = () => {
    if (!id.trim()) return;
    upsertDevice({ id: id.trim(), callsign: callsign.trim(), model: model.trim(), mqttCircle: circle.trim() });
    setNotice(`Registered ${callsign.trim() || id.trim()}.`);
    setId("");
    setCallsign("");
    setCircle("");
  };

  const addScan = () => {
    const result = registerFromPayload(scan);
    setNotice(result ? `Registered device ${result}.` : "Could not read that registration code.");
    if (result) setScan("");
  };

  const onScanned = (code: string) => {
    setScannerOpen(false);
    const result = registerFromPayload(code);
    setNotice(result ? `Registered device ${result} from QR.` : "Scanned a code, but it wasn't a device QR.");
  };

  /**
   * One-click deploy: create a field unit on the chosen event's incident whose id == the device's
   * id, so its live GPS (telemetry keyed on that id) plots on that incident's map. addFieldUnit
   * dedupes by id, so re-deploying is a safe no-op.
   */
  const deployToIncident = (device: { id: string; callsign: string }, eventId: string) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    getIncidentStore(eventId).getState().addFieldUnit({
      id: device.id,
      callsign: device.callsign,
      deviceId: device.id,
    });
    setNotice(
      `Deployed ${device.callsign || device.id} to “${ev.name}”. Open that incident’s Map (Units layer on) — it plots once a live fix arrives.`,
    );
  };

  return (
    <div className="dev-registry">
      <header className="dev-registry__head">
        <div>
          <BackLink href="/">Events</BackLink>
          <h1>Device Registry</h1>
          <p className="dev-registry__sub">
            Bodycams registered here are remembered across every incident. Register a device once
            (by its id, or by scanning its QR), then add it to any scenario from Live Ops.
          </p>
        </div>
      </header>

      {notice ? <p className="dev-registry__notice">{notice}</p> : null}

      <section className="dev-registry__register">
        <div className="dev-registry__card">
          <h2>Register a bodycam</h2>
          <div className="dev-registry__form">
            <label>
              Device ID
              <input value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. L310-00042 (the MQTT deviceId)" />
            </label>
            <label>
              Callsign
              <input value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="Bravo-1" />
            </label>
            <label>
              Model
              <input value={model} onChange={(e) => setModel(e.target.value)} />
            </label>
            <label>
              MQTT circle <span className="dev-registry__opt">(optional)</span>
              <input value={circle} onChange={(e) => setCircle(e.target.value)} placeholder="INVITE.SALT" />
            </label>
          </div>
          <button type="button" className="ic-btn-add" onClick={addManual} disabled={!id.trim()}>
            + Register device
          </button>
        </div>

        <div className="dev-registry__card">
          <h2>Register from QR / code</h2>
          <p className="dev-registry__sub">
            Paste the device&apos;s registration code (the bodycam&apos;s QR payload, or its bare id).
          </p>
          <button type="button" className="ic-btn-add ic-btn-icon" onClick={() => setScannerOpen(true)}>
            <IconScan /> Scan with camera
          </button>
          <textarea
            value={scan}
            onChange={(e) => setScan(e.target.value)}
            placeholder="incommand-dev:1:…  or  L310-00042"
            rows={3}
          />
          <button
            type="button"
            className="ic-toolbar-text-btn"
            onClick={addScan}
            disabled={!scan.trim()}
          >
            Register from pasted code
          </button>
        </div>

        <DeviceEnroll />
      </section>

      {scannerOpen ? (
        <DeviceQrScanner onDetected={onScanned} onClose={() => setScannerOpen(false)} />
      ) : null}

      <h2 className="dev-registry__section-title">
        Registered bodycams {hydrated ? `(${devices.length})` : ""}
      </h2>

      {!hydrated ? (
        <p className="dev-registry__empty">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="dev-registry__empty">No bodycams registered yet.</p>
      ) : (
        <ul className="dev-registry__list">
          {devices.map((d) => (
            <li key={d.id} className="dev-registry__device">
              <div className="dev-registry__qr">
                <QRCodeSVG value={buildDeviceQrPayload(d)} size={104} level="M" />
              </div>
              <div className="dev-registry__device-body">
                <input
                  className="dev-registry__callsign"
                  value={d.callsign}
                  onChange={(e) => updateDevice(d.id, { callsign: e.target.value })}
                  aria-label="Callsign"
                />
                <div className="dev-registry__meta">
                  {(() => {
                    const presence = devicePresence(d.lastSeenAt, now);
                    return (
                      <span
                        className={`dev-registry__status dev-registry__status--${presence}`}
                        title={presence === "online" ? "Checking in — reachable" : "No recent check-in — do not attempt to communicate"}
                      >
                        <span className="dev-registry__status-dot" />
                        {presence === "online" ? "Online" : "Offline"}
                      </span>
                    );
                  })()}
                  <span className="dev-registry__tag">{d.model}</span>
                  <span className="dev-registry__id">{d.id}</span>
                </div>
                <input
                  className="dev-registry__label"
                  value={d.label}
                  onChange={(e) => updateDevice(d.id, { label: e.target.value })}
                  placeholder="Assigned officer / notes"
                  aria-label="Label"
                />
                <div className="dev-registry__meta">
                  {d.mqttCircle ? <span className="dev-registry__tag">circle {d.mqttCircle}</span> : null}
                  <span className="dev-registry__seen">{timeAgo(d.lastSeenAt)}</span>
                </div>
                {events.length > 0 ? (
                  <label className="dev-registry__deploy">
                    <span className="dev-registry__deploy-label"><IconSend size={13} /> Deploy to incident</span>
                    <select
                      className="dev-registry__deploy-select"
                      value=""
                      onChange={(e) => {
                        const eventId = e.target.value;
                        if (eventId) deployToIncident(d, eventId);
                      }}
                    >
                      <option value="">Select incident…</option>
                      {events.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
              <button
                type="button"
                className="dev-registry__remove"
                title="Remove from registry"
                onClick={() => removeDevice(d.id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
