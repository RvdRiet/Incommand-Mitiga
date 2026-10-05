"use client";

import Link from "next/link";
import { useState } from "react";

import {
  AuthShell,
  DistrictPicker,
  ErrorText,
  Field,
  authInput,
  authPrimaryBtn,
  type Tenant,
} from "@/components/auth/ui";

export default function ForgotPasswordPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tenant) {
      setError("Select your district first.");
      return;
    }
    setPending(true);
    const res = await fetch("/api/account/password-reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantSlug: tenant.slug, email }),
    });
    setPending(false);
    const body = await res.json().catch(() => ({}));
    setDevLink(body.devLink ?? null);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell
        title="Check your email"
        subtitle="If an account matches, we've sent a password reset link. It expires in 1 hour."
      >
        {devLink ? (
          <p style={{ fontSize: 13, color: "var(--muted)" }}>
            Dev link:{" "}
            <a href={devLink} style={{ color: "var(--accent)" }}>
              {devLink}
            </a>
          </p>
        ) : null}
        <Link href="/login" style={{ color: "var(--muted)" }}>
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" subtitle="Choose your district and enter your email.">
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="District / municipality">
          <DistrictPicker selected={tenant} onSelect={setTenant} />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" style={authInput} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} style={{ ...authPrimaryBtn, cursor: pending ? "wait" : "pointer" }}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
        <Link href="/login" style={{ color: "var(--muted)", fontSize: 14 }}>
          Back to sign in
        </Link>
      </form>
    </AuthShell>
  );
}
