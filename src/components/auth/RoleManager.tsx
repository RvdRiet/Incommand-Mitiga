"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { authGhostBtn, authInput, authPrimaryBtn } from "@/components/auth/ui";
import type { PermModule } from "@/lib/auth/permissions";

type Role = {
  id: string;
  key: string;
  name: string;
  rank: number;
  isSystem: boolean;
  canWrite: boolean;
  canManageUsers: boolean;
  canManageRoles: boolean;
  allowed: string[];
  customized: boolean;
  editable: boolean;
};
type Editor = { rank: number; canWrite: boolean; canManageUsers: boolean; canManageRoles: boolean };
type Data = { modules: PermModule[]; roles: Role[]; editor: Editor };

type Caps = { canWrite: boolean; canManageUsers: boolean; canManageRoles: boolean };
type Draft = { name: string; rank: number; caps: Caps; modules: Set<string> };

const CAP_LABELS: { key: keyof Caps; label: string; hint: string }[] = [
  { key: "canWrite", label: "Write incident data", hint: "Edit the live incident (otherwise read-only)" },
  { key: "canManageUsers", label: "Manage users", hint: "Invite people and set their roles" },
  { key: "canManageRoles", label: "Manage roles", hint: "Create and edit roles like this one" },
];

export function RoleManager() {
  const [data, setData] = useState<Data | null>(null);
  const [mode, setMode] = useState<"edit" | "new">("edit");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/roles");
    if (!res.ok) {
      setError("Could not load roles.");
      return;
    }
    const body: Data = await res.json();
    setData(body);
    setSelectedId((cur) => cur ?? body.roles.find((r) => r.editable)?.id ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allSlugs = useMemo(() => (data?.modules ?? []).map((m) => m.slug), [data]);
  const byArea = useMemo(() => {
    const groups = new Map<string, { areaLabel: string; mods: PermModule[] }>();
    for (const m of data?.modules ?? []) {
      const g = groups.get(m.areaId) ?? { areaLabel: m.areaLabel, mods: [] };
      g.mods.push(m);
      groups.set(m.areaId, g);
    }
    return [...groups.values()];
  }, [data]);

  const selected = mode === "edit" ? data?.roles.find((r) => r.id === selectedId) ?? null : null;

  // Sync the draft when the selected role (edit mode) changes.
  useEffect(() => {
    if (mode !== "edit" || !selected) return;
    setDraft({
      name: selected.name,
      rank: selected.rank,
      caps: { canWrite: selected.canWrite, canManageUsers: selected.canManageUsers, canManageRoles: selected.canManageRoles },
      modules: new Set(selected.allowed),
    });
  }, [mode, selected]);

  function startNew() {
    if (!data) return;
    setMode("new");
    setSelectedId(null);
    setNotice(null);
    setError(null);
    setDraft({
      name: "",
      rank: Math.max(1, data.editor.rank - 1),
      caps: { canWrite: true, canManageUsers: false, canManageRoles: false },
      modules: new Set(allSlugs),
    });
  }

  function selectRole(id: string) {
    setMode("edit");
    setSelectedId(id);
    setNotice(null);
    setError(null);
  }

  function patchDraft(p: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...p } : d));
  }
  function toggleModule(slug: string) {
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.modules);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return { ...d, modules: next };
    });
  }
  function setArea(mods: PermModule[], on: boolean) {
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.modules);
      for (const m of mods) (on ? next.add(m.slug) : next.delete(m.slug));
      return { ...d, modules: next };
    });
  }

  async function save() {
    if (!data || !draft) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "new") {
        const res = await fetch("/api/admin/roles", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: draft.name, rank: draft.rank, ...draft.caps, modules: [...draft.modules] }),
        });
        const b = await res.json().catch(() => ({}));
        if (!res.ok) { setError(b.error ?? "Could not create the role."); return; }
        setNotice(`Created “${draft.name}”.`);
        setMode("edit");
        setSelectedId(b.role?.id ?? null);
      } else if (selected) {
        const payload = selected.isSystem
          ? { modules: [...draft.modules] }
          : { name: draft.name, rank: draft.rank, ...draft.caps, modules: [...draft.modules] };
        const res = await fetch(`/api/admin/roles/${selected.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const b = await res.json().catch(() => ({}));
        if (!res.ok) { setError(b.error ?? "Save failed."); return; }
        setNotice(`Saved ${draft.name}.`);
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected || selected.isSystem) return;
    if (!confirm(`Delete the “${selected.name}” role? People must be reassigned first.`)) return;
    setError(null);
    const res = await fetch(`/api/admin/roles/${selected.id}`, { method: "DELETE" });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setError(b.error ?? "Could not delete the role."); return; }
    setSelectedId(null);
    setNotice(`Deleted ${selected.name}.`);
    await load();
  }

  if (!data) return <p style={{ color: "var(--muted)" }}>{error ?? "Loading…"}</p>;

  const total = data.modules.length;
  const editingSystem = mode === "edit" && selected?.isSystem;
  const canEditCaps = mode === "new" || (mode === "edit" && selected && !selected.isSystem);

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
      {/* Role list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "var(--muted)" }}>Roles</span>
          <button type="button" onClick={startNew} style={{ ...authGhostBtn, padding: "2px 8px", fontSize: 12 }}>
            + New role
          </button>
        </div>
        {data.roles.map((r) => {
          const active = mode === "edit" && r.id === selectedId;
          return (
            <button
              key={r.id}
              onClick={() => r.editable && selectRole(r.id)}
              disabled={!r.editable}
              title={r.editable ? undefined : "This role is at or above your own — you can't change it."}
              style={{
                textAlign: "left",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#0b1220" : r.editable ? "var(--text)" : "var(--muted)",
                cursor: r.editable ? "pointer" : "not-allowed",
                fontWeight: 600,
                opacity: r.editable ? 1 : 0.6,
              }}
            >
              {r.name}
              {!r.isSystem ? <span style={{ fontSize: 11, fontWeight: 400 }}> · custom</span> : null}
              <span style={{ display: "block", fontSize: 12, fontWeight: 400, opacity: 0.8 }}>
                level {r.rank} · {r.customized ? `${r.allowed.length}/${total} modules` : "all modules"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Editor panel */}
      <div style={{ flex: "1 1 460px", minWidth: 320 }}>
        {!draft ? (
          <p style={{ color: "var(--muted)" }}>Select a role, or create a new one.</p>
        ) : (
          <>
            <h2 style={{ margin: "0 0 12px" }}>{mode === "new" ? "New role" : draft.name}</h2>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px" }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Name</span>
                <input
                  value={draft.name}
                  disabled={editingSystem}
                  onChange={(e) => patchDraft({ name: e.target.value })}
                  style={{ ...authInput, opacity: editingSystem ? 0.6 : 1 }}
                />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4, width: 120 }}>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>Level</span>
                <input
                  type="number"
                  min={1}
                  max={data.editor.rank - 1}
                  value={draft.rank}
                  disabled={editingSystem}
                  onChange={(e) => patchDraft({ rank: Number(e.target.value) })}
                  style={{ ...authInput, opacity: editingSystem ? 0.6 : 1 }}
                />
              </label>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "-6px 0 14px" }}>
              Higher level = more privilege; must stay below yours ({data.editor.rank}). Built-ins:
              Viewer 10, Planner 20, Incident Manager 30, Org Admin 40, Tenant Admin 50.
            </p>

            <fieldset style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: 14, padding: "10px 12px" }}>
              <legend style={{ padding: "0 6px" }}><strong>Can do</strong></legend>
              {CAP_LABELS.map((c) => {
                const editorHas = data.editor[c.key];
                return (
                  <label key={c.key} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14, padding: "4px 0", opacity: canEditCaps && editorHas ? 1 : 0.6 }}>
                    <input
                      type="checkbox"
                      checked={draft.caps[c.key]}
                      disabled={!canEditCaps || !editorHas}
                      onChange={(e) => patchDraft({ caps: { ...draft.caps, [c.key]: e.target.checked } })}
                    />
                    <span>
                      {c.label}
                      <span style={{ display: "block", fontSize: 12, color: "var(--muted)" }}>
                        {c.hint}{!editorHas ? " — you don't have this yourself" : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <strong>Can see</strong>
              <span style={{ fontSize: 13, color: "var(--muted)" }}>{draft.modules.size} of {total} modules</span>
            </div>
            {byArea.map((g) => {
              const allOn = g.mods.every((m) => draft.modules.has(m.slug));
              return (
                <fieldset key={g.areaLabel} style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12, padding: "10px 12px" }}>
                  <legend style={{ display: "flex", gap: 10, alignItems: "center", padding: "0 6px" }}>
                    <strong>{g.areaLabel}</strong>
                    <button type="button" onClick={() => setArea(g.mods, !allOn)} style={{ ...authGhostBtn, padding: "2px 8px", fontSize: 12, fontWeight: 500 }}>
                      {allOn ? "Clear" : "All"}
                    </button>
                  </legend>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 4 }}>
                    {g.mods.map((m) => (
                      <label key={m.slug} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, padding: "3px 0" }}>
                        <input type="checkbox" checked={draft.modules.has(m.slug)} onChange={() => toggleModule(m.slug)} />
                        {m.label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={save} disabled={saving || !draft.name.trim()} style={{ ...authPrimaryBtn, opacity: saving || !draft.name.trim() ? 0.6 : 1 }}>
                {saving ? "Saving…" : mode === "new" ? "Create role" : "Save changes"}
              </button>
              {mode === "edit" && selected && !selected.isSystem ? (
                <button onClick={remove} style={{ ...authGhostBtn, color: "#fca5a5", borderColor: "#fca5a5" }}>
                  Delete role
                </button>
              ) : null}
              {notice ? <span role="status" style={{ color: "var(--accent)", fontSize: 13 }}>{notice}</span> : null}
              {error ? <span role="alert" style={{ color: "#fca5a5", fontSize: 13 }}>{error}</span> : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
