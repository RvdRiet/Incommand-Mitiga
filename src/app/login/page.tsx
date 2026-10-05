"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AuthShell,
  DistrictPicker,
  ErrorText,
  Field,
  authGhostBtn,
  authInput,
  authPrimaryBtn,
  type Tenant,
} from "@/components/auth/ui";

const DEV = process.env.NEXT_PUBLIC_STAGING === "1";

export default function LoginPage() {
  const router = useRouter();
  const callbackUrl = "/dashboard";

  const [tenant, setTenant] = useState<Tenant | null>(
    DEV ? { id: "demo", name: "Demo City", slug: "demo" } : null,
  );
  const [email, setEmail] = useState(DEV ? "ic@example.com" : "");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function doSignIn(creds: { tenantSlug: string; email: string; password: string; totp?: string }) {
    setPending(true);
    setError(null);
    const res = await signIn("credentials", { redirect: false, ...creds, callbackUrl });
    setPending(false);
    if (res?.error) return false;
    router.push(callbackUrl);
    router.refresh();
    return true;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant) {
      setError("Select your district first.");
      return;
    }
    if (!(await doSignIn({ tenantSlug: tenant.slug, email, password, totp: totp || undefined }))) {
      setError("Incorrect district, email, password, or authenticator code.");
    }
  }

  async function devSignIn() {
    if (!(await doSignIn({ tenantSlug: "demo", email: "ic@example.com", password: "MitigaDemo!23" }))) {
      setError("Dev sign-in failed — start the database and run `npm run db:seed`.");
    }
  }

  return (
    <AuthShell title="Sign in" subtitle="Choose your district, then enter your credentials.">
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="District / municipality">
          <DistrictPicker selected={tenant} onSelect={setTenant} />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            style={authInput}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={authInput}
          />
        </Field>
        <Field label="Authenticator code (if two-factor is enabled)">
          <input
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            style={authInput}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button type="submit" disabled={pending} style={{ ...authPrimaryBtn, cursor: pending ? "wait" : "pointer" }}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
        <div style={{ fontSize: 14 }}>
          <Link href="/forgot-password" style={{ color: "var(--muted)" }}>
            Forgot your password?
          </Link>
        </div>
        {DEV ? (
          <button type="button" onClick={devSignIn} disabled={pending} style={{ ...authGhostBtn, cursor: pending ? "wait" : "pointer" }}>
            Dev sign-in (seeded account)
          </button>
        ) : null}
      </form>
    </AuthShell>
  );
}
