"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/** Shared styles + building blocks for the auth pages (login, invite, reset). */

export const authInput: CSSProperties = {
  padding: 10,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "#0f172a",
  color: "var(--text)",
  font: "inherit",
};

export const authPrimaryBtn: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--accent)",
  color: "#0b1220",
  fontWeight: 600,
  cursor: "pointer",
};

export const authGhostBtn: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 8,
  border: "1px dashed var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontWeight: 600,
  cursor: "pointer",
};

/**
 * The auth inputs/buttons above are built for a dark palette (`--accent/--text/
 * --muted/--border/--surface`), which the app's light pages don't define — so on a
 * plain page the inputs render dark-on-dark and the primary button has no fill.
 * AuthShell supplies that palette + a dark full-height background so every auth page
 * (login, invite, reset) is one cohesive, legible dark screen. Shared with the setup
 * wizard's console look.
 */
export const authTheme: CSSProperties = {
  ["--accent" as string]: "#35c5a8",
  ["--text" as string]: "#e5e7eb",
  ["--muted" as string]: "#9ca3af",
  ["--border" as string]: "rgba(255,255,255,0.14)",
  ["--surface" as string]: "rgba(255,255,255,0.03)",
  background: "#0b1220",
  color: "var(--text)",
  minHeight: "100vh",
};

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={authTheme}>
      <main style={{ maxWidth: 420, margin: "0 auto", padding: "4rem 16px" }}>
        <h1 style={{ marginTop: 0 }}>{title}</h1>
        {subtitle ? <p style={{ color: "var(--muted)" }}>{subtitle}</p> : null}
        {children}
      </main>
    </div>
  );
}

/**
 * Dark full-height console wrapper for pages built from the dark-palette auth
 * components (the admin Roles/Users screens, which use authInput + the --accent/
 * --text/--border tokens). Without it those inputs render dark-on-light and the
 * accent highlight disappears. Matches the login + setup-wizard look.
 */
export function AuthConsole({ children }: { children: React.ReactNode }) {
  return <div style={authTheme}>{children}</div>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span>{label}</span>
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return children ? (
    <div role="alert" style={{ color: "#fca5a5", fontSize: 14 }}>
      {children}
    </div>
  ) : null;
}

export type Tenant = { id: string; name: string; slug: string };

/**
 * District picker — type-ahead over /api/tenants/search. Selecting a district
 * calls onSelect with its slug (used by the credentials provider) + name.
 */
export function DistrictPicker({
  selected,
  onSelect,
}: {
  selected: Tenant | null;
  onSelect: (t: Tenant | null) => void;
}) {
  const [query, setQuery] = useState(selected?.name ?? "");
  const [results, setResults] = useState<Tenant[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected && query === selected.name) return; // don't re-search the picked value
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tenants/search?q=${encodeURIComponent(q)}`, {
          signal: ctrl.signal,
        });
        const body = await res.json();
        setResults(body.tenants ?? []);
        setOpen(true);
      } catch {
        /* aborted / offline */
      }
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query, selected]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        value={query}
        placeholder="Start typing your district or municipality…"
        autoComplete="off"
        onChange={(e) => {
          setQuery(e.target.value);
          onSelect(null);
        }}
        onFocus={() => results.length && setOpen(true)}
        style={{ ...authInput, width: "100%", boxSizing: "border-box" }}
      />
      {open && results.length > 0 ? (
        <ul
          style={{
            position: "absolute",
            zIndex: 10,
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            margin: 0,
            padding: 4,
            listStyle: "none",
            background: "#0f172a",
            border: "1px solid var(--border)",
            borderRadius: 8,
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {results.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(t);
                  setQuery(t.name);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 6,
                  border: "none",
                  background: selected?.id === t.id ? "var(--accent)" : "transparent",
                  color: selected?.id === t.id ? "#0b1220" : "var(--text)",
                  cursor: "pointer",
                }}
              >
                {t.name} <span style={{ opacity: 0.6 }}>· {t.slug}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
