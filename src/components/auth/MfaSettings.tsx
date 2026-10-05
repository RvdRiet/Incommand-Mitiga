"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

import { authInput, authGhostBtn, authPrimaryBtn } from "@/components/auth/ui";

type Setup = { otpauth: string; secret: string };

export function MfaSettings() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/account/mfa").then((r) => r.json());
    setEnabled(!!r.enabled);
  }
  useEffect(() => {
    void load();
  }, []);

  async function beginSetup() {
    setError(null);
    setNotice(null);
    setBusy(true);
    const r = await fetch("/api/account/mfa", { method: "POST" });
    setBusy(false);
    if (!r.ok) return setError("Could not start MFA setup.");
    setSetup(await r.json());
  }

  async function enable() {
    setError(null);
    setBusy(true);
    const r = await fetch("/api/account/mfa", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!r.ok) return setError("That code didn't match. Check your authenticator and try again.");
    setSetup(null);
    setCode("");
    setNotice("Two-factor authentication is on. You'll enter a code at each sign-in.");
    void load();
  }

  async function disable() {
    setError(null);
    setBusy(true);
    const r = await fetch("/api/account/mfa", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setBusy(false);
    if (!r.ok) return setError("Enter a current code to turn MFA off.");
    setCode("");
    setNotice("Two-factor authentication is off.");
    void load();
  }

  if (enabled === null) return <p style={{ color: "var(--muted)" }}>Loading…</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
      <div>
        Status:{" "}
        <strong style={{ color: enabled ? "var(--accent)" : "var(--muted)" }}>
          {enabled ? "On" : "Off"}
        </strong>
      </div>

      {enabled ? (
        <>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Enter a current authenticator code to turn two-factor off.
          </p>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" style={authInput} />
          <button onClick={disable} disabled={busy} style={authGhostBtn}>
            Turn off MFA
          </button>
        </>
      ) : setup ? (
        <>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Scan this with an authenticator app (Google Authenticator, Authy, 1Password), then enter the
            6-digit code to confirm.
          </p>
          <div style={{ background: "#fff", padding: 12, borderRadius: 8, width: "fit-content" }}>
            <QRCodeSVG value={setup.otpauth} size={160} />
          </div>
          <code style={{ fontSize: 12, color: "var(--muted)", wordBreak: "break-all" }}>
            Or enter this key manually: {setup.secret}
          </code>
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" placeholder="123456" style={authInput} />
          <button onClick={enable} disabled={busy} style={authPrimaryBtn}>
            Verify &amp; enable
          </button>
        </>
      ) : (
        <>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>
            Add a second factor with an authenticator app. Strongly recommended for command staff.
          </p>
          <button onClick={beginSetup} disabled={busy} style={authPrimaryBtn}>
            Set up two-factor authentication
          </button>
        </>
      )}

      {notice ? <p style={{ color: "var(--accent)", fontSize: 13 }}>{notice}</p> : null}
      {error ? <p style={{ color: "#fca5a5", fontSize: 13 }}>{error}</p> : null}
    </div>
  );
}
