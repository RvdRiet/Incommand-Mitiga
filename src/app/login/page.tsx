"use client";

import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const callbackUrl = "/dashboard";

  const [tenantSlug, setTenantSlug] = useState("demo");
  const [email, setEmail] = useState("ic@example.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const res = await signIn("credentials", {
      redirect: false,
      tenantSlug,
      email,
      password,
      callbackUrl,
    });
    setPending(false);
    if (res?.error) {
      setError("Invalid credentials or tenant.");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main style={{ maxWidth: 420, margin: "4rem auto", padding: "0 16px" }}>
      <h1 style={{ marginTop: 0 }}>Sign in</h1>
      <p style={{ color: "var(--muted)" }}>
        Use the seeded tenant slug <code>demo</code> after running <code>npm run db:seed</code>.
      </p>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Tenant slug</span>
          <input
            value={tenantSlug}
            onChange={(e) => setTenantSlug(e.target.value)}
            autoComplete="organization"
            style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "#0f172a", color: "var(--text)" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "#0f172a", color: "var(--text)" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            style={{ padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "#0f172a", color: "var(--text)" }}
          />
        </label>
        {error ? <div style={{ color: "#fca5a5", fontSize: 14 }}>{error}</div> : null}
        <button
          type="submit"
          disabled={pending}
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            border: "1px solid var(--border)",
            background: "var(--accent)",
            color: "#0b1220",
            fontWeight: 600,
            cursor: pending ? "wait" : "pointer",
          }}
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
