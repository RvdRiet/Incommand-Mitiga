"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { authGhostBtn, authPrimaryBtn } from "@/components/auth/ui";
import type { PermModule } from "@/lib/auth/permissions";

type RoleRow = { role: string; allowed: string[]; customized: boolean };
type Matrix = { modules: PermModule[]; roles: RoleRow[] };

const roleLabel = (r: string) => r.replace(/_/g, " ");

export function RolePermissionsAdmin() {
  const [data, setData] = useState<Matrix | null>(null);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/role-permissions");
    if (!res.ok) {
      setError("Could not load role permissions.");
      return;
    }
    const body: Matrix = await res.json();
    setData(body);
    if (body.roles.length && !selectedRole) {
      setSelectedRole(body.roles[0].role);
      setDraft(new Set(body.roles[0].allowed));
    }
  }, [selectedRole]);

  useEffect(() => {
    void load();
  }, [load]);

  // Group modules by their area for display.
  const byArea = useMemo(() => {
    const groups = new Map<string, { areaLabel: string; mods: PermModule[] }>();
    for (const m of data?.modules ?? []) {
      const g = groups.get(m.areaId) ?? { areaLabel: m.areaLabel, mods: [] };
      g.mods.push(m);
      groups.set(m.areaId, g);
    }
    return [...groups.values()];
  }, [data]);

  const current = data?.roles.find((r) => r.role === selectedRole);
  const dirty = current ? !sameSet(draft, new Set(current.allowed)) : false;

  function selectRole(role: string) {
    const row = data?.roles.find((r) => r.role === role);
    setSelectedRole(role);
    setDraft(new Set(row?.allowed ?? []));
    setNotice(null);
    setError(null);
  }

  function toggle(slug: string) {
    setDraft((d) => {
      const next = new Set(d);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }

  function setArea(mods: PermModule[], on: boolean) {
    setDraft((d) => {
      const next = new Set(d);
      for (const m of mods) {
        if (on) next.add(m.slug);
        else next.delete(m.slug);
      }
      return next;
    });
  }

  async function save() {
    if (!selectedRole) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/role-permissions", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: selectedRole, modules: [...draft] }),
    });
    setSaving(false);
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setError(b.error ?? "Save failed.");
      return;
    }
    setNotice(`Saved access for ${roleLabel(selectedRole)}.`);
    // reflect in local state
    setData((d) =>
      d
        ? { ...d, roles: d.roles.map((r) => (r.role === selectedRole ? { ...r, allowed: [...draft], customized: true } : r)) }
        : d,
    );
  }

  if (!data) {
    return <p style={{ color: "var(--muted)" }}>{error ?? "Loading…"}</p>;
  }
  if (data.roles.length === 0) {
    return <p style={{ color: "var(--muted)" }}>There are no roles below yours to manage.</p>;
  }

  const total = data.modules.length;

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
      {/* Role selector */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 180 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>Role</span>
        {data.roles.map((r) => (
          <button
            key={r.role}
            onClick={() => selectRole(r.role)}
            style={{
              textAlign: "left",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: r.role === selectedRole ? "var(--accent)" : "transparent",
              color: r.role === selectedRole ? "#0b1220" : "var(--text)",
              cursor: "pointer",
              fontWeight: 600,
              textTransform: "capitalize",
            }}
          >
            {roleLabel(r.role)}
            <span style={{ display: "block", fontSize: 12, fontWeight: 400, opacity: 0.8 }}>
              {r.customized ? `${r.allowed.length}/${total} modules` : "all modules (default)"}
            </span>
          </button>
        ))}
      </div>

      {/* Module checklist for the selected role */}
      <div style={{ flex: "1 1 420px", minWidth: 320 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0, textTransform: "capitalize" }}>
            {selectedRole ? roleLabel(selectedRole) : ""} can see
          </h2>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>
            {draft.size} of {total} modules
          </span>
        </div>

        {byArea.map((g) => {
          const allOn = g.mods.every((m) => draft.has(m.slug));
          return (
            <fieldset
              key={g.areaLabel}
              style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12, padding: "10px 12px" }}
            >
              <legend style={{ display: "flex", gap: 10, alignItems: "center", padding: "0 6px" }}>
                <strong>{g.areaLabel}</strong>
                <button
                  type="button"
                  onClick={() => setArea(g.mods, !allOn)}
                  style={{ ...authGhostBtn, padding: "2px 8px", fontSize: 12, fontWeight: 500 }}
                >
                  {allOn ? "Clear" : "All"}
                </button>
              </legend>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 4 }}>
                {g.mods.map((m) => (
                  <label key={m.slug} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, padding: "3px 0" }}>
                    <input type="checkbox" checked={draft.has(m.slug)} onChange={() => toggle(m.slug)} />
                    {m.label}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        })}

        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={save} disabled={saving || !dirty} style={{ ...authPrimaryBtn, cursor: saving || !dirty ? "default" : "pointer", opacity: dirty ? 1 : 0.6 }}>
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
          {notice ? <span style={{ color: "var(--accent)", fontSize: 13 }}>{notice}</span> : null}
          {error ? <span style={{ color: "#fca5a5", fontSize: 13 }}>{error}</span> : null}
        </div>
      </div>
    </div>
  );
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
