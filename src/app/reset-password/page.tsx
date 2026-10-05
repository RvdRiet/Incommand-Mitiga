"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AuthShell, ErrorText, Field, authInput, authPrimaryBtn } from "@/components/auth/ui";

type TokenInfo = { valid: boolean; purpose?: string; email?: string; tenantName?: string | null };

function ResetInner() {
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      setInfo({ valid: false });
      return;
    }
    fetch(`/api/account/token?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo({ valid: false }));
  }, [token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setPending(true);
    const res = await fetch("/api/account/password-reset/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    setPending(false);
    if (res.ok) {
      setDone(true);
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Could not reset your password.");
  }

  if (info && (!info.valid || info.purpose !== "password_reset")) {
    return (
      <AuthShell title="Link not valid" subtitle="This reset link is invalid, already used, or expired.">
        <Link href="/forgot-password" style={{ color: "var(--muted)" }}>
          Request a new link
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Password updated" subtitle="You've been signed out everywhere. Sign in with your new password.">
        <Link href="/login" style={authPrimaryBtn}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      subtitle={info?.email ? <>For <strong>{info.email}</strong>.</> : "Loading…"}
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="New password (min 12 characters)">
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" style={authInput} />
        </Field>
        <Field label="Confirm password">
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" style={authInput} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending || !info?.valid} style={{ ...authPrimaryBtn, cursor: pending ? "wait" : "pointer" }}>
          {pending ? "Updating…" : "Update password"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Set a new password" subtitle="Loading…">{null}</AuthShell>}>
      <ResetInner />
    </Suspense>
  );
}
