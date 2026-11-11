"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";

import { authGhostBtn, authInput, authPrimaryBtn } from "@/components/auth/ui";
import { RoleManager } from "@/components/auth/RoleManager";
import { useEventsStore } from "@/lib/events/store";

/**
 * The auth inputs + RoleManager are built for a dark palette (the `--accent/--text/--muted/
 * --border/--surface` tokens), which the app's light pages don't define. Set them here so the
 * whole wizard — including the embedded RoleManager — renders as one cohesive dark console.
 */
const setupTheme: CSSProperties = {
  ["--accent" as string]: "#35c5a8",
  ["--text" as string]: "#e5e7eb",
  ["--muted" as string]: "#9ca3af",
  ["--border" as string]: "rgba(255,255,255,0.14)",
  ["--surface" as string]: "rgba(255,255,255,0.03)",
  background: "#0b1220",
  color: "var(--text)",
  minHeight: "100vh",
};

function SetupShell({ children }: { children: React.ReactNode }) {
  return <div style={setupTheme}>{children}</div>;
}

type Step = { key: string; title: string; blurb: string };

const STEPS: Step[] = [
  { key: "org", title: "Organisation", blurb: "Name your district and organisation." },
  { key: "roles", title: "Roles & access", blurb: "Review who can do and see what." },
  { key: "people", title: "Personnel", blurb: "Add your staff roster (optional)." },
  { key: "finish", title: "Finish", blurb: "Enter InCommand." },
];

export function SetupWizard({ canManageRoles }: { canManageRoles: boolean }) {
  const router = useRouter();
  const setOrganizationName = useEventsStore((s) => s.setOrganizationName);
  const [step, setStep] = useState(0);
  const [tenantName, setTenantName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [alreadyComplete, setAlreadyComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/setup/status");
        if (res.ok) {
          const d = await res.json();
          if (!cancelled) {
            setTenantName(d.tenantName ?? "");
            setOrgName(d.orgName ?? "");
            setAlreadyComplete(d.setupComplete === true);
          }
        }
      } catch {
        /* keep blank */
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveOrg(): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/org", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantName: tenantName.trim(), orgName: orgName.trim() }),
      });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(b.error ?? "Could not save.");
        return false;
      }
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function finish() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/setup/complete", { method: "POST" });
      const b = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(b.error ?? "Could not finish setup.");
        return;
      }
      // Reflect the chosen name in the events header immediately, so the landing
      // page is correct before its own server hydration runs.
      const name = orgName.trim() || tenantName.trim();
      if (name) setOrganizationName(name);
      router.push("/");
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    if (STEPS[step].key === "org") {
      if (!tenantName.trim()) {
        setError("Organisation name is required.");
        return;
      }
      const ok = await saveOrg();
      if (!ok) return;
    }
    setError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  if (!canManageRoles) {
    return (
      <SetupShell>
        <main style={{ maxWidth: 560, margin: "0 auto", padding: "4rem 16px" }}>
          <h1>Setting up InCommand</h1>
          <p style={{ color: "var(--muted)" }}>
            Your organisation hasn&apos;t finished its first-time setup yet. An administrator needs to
            complete it before the workspace opens. Please check back shortly.
          </p>
        </main>
      </SetupShell>
    );
  }

  const current = STEPS[step];

  return (
    <SetupShell>
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "2.5rem 16px" }}>
      <header style={{ marginBottom: 20 }}>
        <p style={{ color: "var(--accent)", fontWeight: 600, margin: 0, fontSize: 13 }}>
          Welcome to InCommand
        </p>
        <h1 style={{ margin: "4px 0 2px" }}>Set up your organisation</h1>
        <p style={{ color: "var(--muted)", margin: 0 }}>
          A few steps to get your district ready. You can reopen this from Settings later.
        </p>
        {alreadyComplete ? (
          <p style={{ color: "var(--muted)", marginTop: 8, fontSize: 13 }}>
            Setup is already complete — you&apos;re just reviewing. <Link href="/">Back to events</Link>.
          </p>
        ) : null}
      </header>

      {/* Stepper */}
      <ol className="ic-setup-steps">
        {STEPS.map((s, i) => (
          <li
            key={s.key}
            className={`ic-setup-step${i === step ? " ic-setup-step--active" : ""}${i < step ? " ic-setup-step--done" : ""}`}
          >
            <button type="button" onClick={() => i < step && setStep(i)} disabled={i > step}>
              <span className="ic-setup-step__num">{i < step ? "✓" : i + 1}</span>
              <span className="ic-setup-step__label">
                <strong>{s.title}</strong>
                <span>{s.blurb}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>

      <section className="ic-setup-panel">
        {!loaded ? (
          <p style={{ color: "var(--muted)" }}>Loading…</p>
        ) : current.key === "org" ? (
          <div style={{ maxWidth: 520 }}>
            <h2 style={{ marginTop: 0 }}>Organisation</h2>
            <p style={{ color: "var(--muted)" }}>
              This is the district or municipality name shown across the app and on reports.
            </p>
            <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
              <span>District / municipality name</span>
              <input
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                placeholder="Ehlanzeni District Municipality"
                style={{ ...authInput, width: "100%", boxSizing: "border-box" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span>
                Organisation / department{" "}
                <span style={{ color: "var(--muted)" }}>(optional)</span>
              </span>
              <input
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Disaster Management Centre"
                style={{ ...authInput, width: "100%", boxSizing: "border-box" }}
              />
            </label>
          </div>
        ) : current.key === "roles" ? (
          <div>
            <h2 style={{ marginTop: 0 }}>Roles &amp; access</h2>
            <p style={{ color: "var(--muted)", maxWidth: 680 }}>
              Five roles are ready to use — Viewer, Planner, Incident Manager, Org Admin and Tenant
              Admin. Adjust what each can see, or add your own. You can change these any time.
            </p>
            <RoleManager />
          </div>
        ) : current.key === "people" ? (
          <div style={{ maxWidth: 620 }}>
            <h2 style={{ marginTop: 0 }}>Personnel roster</h2>
            <p style={{ color: "var(--muted)" }}>
              Build your organisation&apos;s master staff list — photos, qualifications and shifts —
              once, then drag people into any event. This is optional and you can do it later.
            </p>
            <Link
              href="/roster"
              target="_blank"
              rel="noreferrer"
              style={{ ...authGhostBtn, display: "inline-block", textDecoration: "none" }}
            >
              Open Personnel roster ↗
            </Link>
          </div>
        ) : (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ marginTop: 0 }}>You&apos;re all set</h2>
            <p style={{ color: "var(--muted)" }}>
              <strong style={{ color: "var(--text)" }}>{tenantName || "Your organisation"}</strong> is
              ready. Finish to open the workspace — you can revisit setup from Settings whenever you
              need to.
            </p>
            <ul style={{ color: "var(--muted)", lineHeight: 1.7 }}>
              <li>Organisation named</li>
              <li>Roles &amp; access reviewed</li>
              <li>Personnel roster {`(add staff any time)`}</li>
            </ul>
          </div>
        )}
      </section>

      {error ? <p role="alert" style={{ color: "#fca5a5", marginTop: 12 }}>{error}</p> : null}

      <div style={{ display: "flex", gap: 12, marginTop: 18, alignItems: "center" }}>
        {step > 0 ? (
          <button type="button" onClick={() => setStep((s) => s - 1)} style={authGhostBtn}>
            Back
          </button>
        ) : null}
        {current.key === "finish" ? (
          <button type="button" onClick={finish} disabled={saving} style={{ ...authPrimaryBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Finishing…" : "Enter InCommand"}
          </button>
        ) : (
          <button type="button" onClick={next} disabled={saving} style={{ ...authPrimaryBtn, opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : current.key === "people" ? "Skip / Continue" : "Continue"}
          </button>
        )}
      </div>
    </main>
    </SetupShell>
  );
}
