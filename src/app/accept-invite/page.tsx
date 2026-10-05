"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { AuthShell, ErrorText, Field, authInput, authPrimaryBtn } from "@/components/auth/ui";

type TokenInfo = { valid: boolean; purpose?: string; email?: string; tenantName?: string | null };

function AcceptInviteInner() {
  const token = useSearchParams().get("token") ?? "";
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [name, setName] = useState("");
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
    const res = await fetch("/api/account/accept-invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, name, password }),
    });
    setPending(false);
    if (res.ok) {
      setDone(true);
      return;
    }
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Could not accept the invite.");
  }

  if (info && !info.valid) {
    return (
      <AuthShell title="Invite not valid" subtitle="This invite link is invalid, already used, or expired.">
        <Link href="/login" style={{ color: "var(--muted)" }}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title="Account ready" subtitle="Your account is set up. You can sign in now.">
        <Link href="/login" style={authPrimaryBtn}>
          Go to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Accept your invite"
      subtitle={
        info?.email ? (
          <>
            Setting up <strong>{info.email}</strong>
            {info.tenantName ? (
              <>
                {" "}
                at <strong>{info.tenantName}</strong>
              </>
            ) : null}
            .
          </>
        ) : (
          "Loading…"
        )
      }
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Your name">
          <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" style={authInput} />
        </Field>
        <Field label="Password (min 12 characters)">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            style={authInput}
          />
        </Field>
        <Field label="Confirm password">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            style={authInput}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending || !info?.valid} style={{ ...authPrimaryBtn, cursor: pending ? "wait" : "pointer" }}>
          {pending ? "Setting up…" : "Create account"}
        </button>
      </form>
    </AuthShell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AuthShell title="Accept your invite" subtitle="Loading…">{null}</AuthShell>}>
      <AcceptInviteInner />
    </Suspense>
  );
}
