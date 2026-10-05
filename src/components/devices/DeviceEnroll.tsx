"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { buildEnrollQrPayload } from "@/lib/devices/enroll";
import { useDeviceRegistry } from "@/lib/devices/store";

type Status = "idle" | "waiting" | "enrolled" | "error";

/**
 * Web-initiated enrollment: operator assigns a callsign → shows a QR → the bodycam scans it and
 * calls home to /api/devices/enroll → this poll picks up the claim and registers the device.
 */
export function DeviceEnroll() {
  const upsertDevice = useDeviceRegistry((s) => s.upsertDevice);
  const [callsign, setCallsign] = useState("");
  const [circle, setCircle] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [payload, setPayload] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [enrolledName, setEnrolledName] = useState("");
  const [errorMsg, setErrorMsg] = useState("Enrollment failed or expired. Try again.");

  const start = async () => {
    if (!callsign.trim()) return;
    setStatus("waiting");
    setPayload(null);
    setEnrolledName("");
    // Time-box the request so a hung backend can't leave the card stuck with no QR.
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 10_000);
    try {
      const r = await fetch("/api/devices/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callsign: callsign.trim(), circle: circle.trim() }),
        signal: ctrl.signal,
      });
      if (!r.ok) {
        setErrorMsg(
          r.status === 401
            ? "Your session expired — please sign in again, then retry."
            : r.status === 429
              ? "Too many attempts — wait a moment and try again."
              : `Couldn't start enrollment (server error ${r.status}). Try again.`,
        );
        setStatus("error");
        return;
      }
      const { token: t } = (await r.json()) as { token: string };
      if (!t) {
        setErrorMsg("The server didn't return an enrollment token. Try again.");
        setStatus("error");
        return;
      }
      setToken(t);
      setPayload(
        buildEnrollQrPayload({
          url: window.location.origin,
          token: t,
          cs: callsign.trim(),
          circle: circle.trim() || undefined,
        }),
      );
    } catch (e) {
      setErrorMsg(
        e instanceof DOMException && e.name === "AbortError"
          ? "The server didn't respond. Check the connection and try again."
          : "Couldn't reach the server. Check the connection and try again.",
      );
      setStatus("error");
    } finally {
      window.clearTimeout(timer);
    }
  };

  useEffect(() => {
    if (status !== "waiting" || !token) return;
    const id = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/devices/enroll?token=${encodeURIComponent(token)}`);
        const d = (await r.json()) as {
          status: string;
          device?: { id: string; callsign: string; circle: string };
        };
        if (d.status === "claimed" && d.device) {
          upsertDevice({
            id: d.device.id,
            callsign: d.device.callsign,
            mqttCircle: d.device.circle,
            model: "L310",
            lastSeenAt: new Date().toISOString(),
          });
          setEnrolledName(d.device.callsign || d.device.id);
          setStatus("enrolled");
        } else if (d.status === "expired") {
          setStatus("error");
        }
      } catch {
        /* keep polling */
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [status, token, upsertDevice]);

  const reset = () => {
    setStatus("idle");
    setToken(null);
    setPayload(null);
    setCallsign("");
    setCircle("");
  };

  return (
    <div className="dev-registry__card">
      <h2>Enroll by QR (bodycam scans)</h2>
      <p className="dev-registry__sub">
        Assign a callsign, show the QR, and scan it on the bodycam — it registers itself.
      </p>

      {status === "idle" || status === "error" ? (
        <>
          <div className="dev-registry__form">
            <label>
              Callsign
              <input value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="Bravo-1" />
            </label>
            <label>
              MQTT circle <span className="dev-registry__opt">(optional)</span>
              <input value={circle} onChange={(e) => setCircle(e.target.value)} placeholder="INVITE.SALT" />
            </label>
          </div>
          {status === "error" ? (
            <p className="dev-registry__notice">{errorMsg}</p>
          ) : null}
          <button type="button" className="ic-btn-add" onClick={start} disabled={!callsign.trim()}>
            Generate enrollment QR
          </button>
        </>
      ) : status === "waiting" && !payload ? (
        <p className="dev-enroll__hint">Generating enrollment QR…</p>
      ) : status === "waiting" && payload ? (
        <div className="dev-enroll__waiting">
          <div className="dev-registry__qr">
            <QRCodeSVG value={payload} size={148} level="M" />
          </div>
          <p className="dev-enroll__hint">
            Scan on the bodycam to enroll <strong>{callsign}</strong> — waiting for it to check in…
          </p>
          <button type="button" className="ic-link-btn" onClick={reset}>
            Cancel
          </button>
        </div>
      ) : status === "enrolled" ? (
        <div className="dev-enroll__done">
          <p>
            ✓ <strong>{enrolledName}</strong> enrolled itself.
          </p>
          <button type="button" className="ic-btn-add" onClick={reset}>
            Enroll another
          </button>
        </div>
      ) : null}
    </div>
  );
}
