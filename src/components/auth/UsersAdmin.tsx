"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { authGhostBtn, authInput, authPrimaryBtn } from "@/components/auth/ui";
import type { PermModule } from "@/lib/auth/permissions";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  role: string | null;
  roleId: string | null;
  roleName: string | null;
  roleRank: number | null;
  lastLoginAt: string | null;
};
type InviteRow = { id: string; email: string; role: string | null; expiresAt: string };
type RoleOption = { id: string; key: string; name: string; rank: number; isSystem: boolean };
type Effect = "allow" | "deny";
type OverrideData = { modules: PermModule[]; base: string[]; overrides: { module: string; effect: Effect }[] };

const cell: React.CSSProperties = { padding: "8px 10px", borderBottom: "1px solid var(--border)", fontSize: 14 };
const btn: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  cursor: "pointer",
  fontSize: 13,
};

export function UsersAdmin({ myRank, myId }: { myRank: number; myId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Direct account creation (no email invite) → one-time temporary password.
  const [cuName, setCuName] = useState("");
  const [cuEmail, setCuEmail] = useState("");
  const [cuRole, setCuRole] = useState("viewer");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdCreds, setCreatedCreds] = useState<{ email: string; tempPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Per-user override editor state.
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [ov, setOv] = useState<OverrideData | null>(null);
  const [ovDraft, setOvDraft] = useState<Map<string, Effect>>(new Map());
  const [ovNotice, setOvNotice] = useState<string | null>(null);

  const systemRoles = roles.filter((r) => r.isSystem);

  const load = useCallback(async () => {
    setError(null);
    const [u, i, r] = await Promise.all([
      fetch("/api/admin/users").then((res) => res.json()),
      fetch("/api/admin/invitations").then((res) => res.json()),
      fetch("/api/admin/assignable-roles").then((res) => res.json()),
    ]);
    setUsers(u.users ?? []);
    setInvites(i.invitations ?? []);
    setRoles(r.roles ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const res = await fetch("/api/admin/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, role: inviteRole }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Could not send invite.");
      return;
    }
    setEmail("");
    setNotice(body.devLink ? `Invite created. Dev link: ${body.devLink}` : `Invite sent to ${body.email}.`);
    void load();
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setCreatedCreds(null);
    setCopied(false);
    setCreating(true);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: cuName, email: cuEmail, role: cuRole }),
    });
    setCreating(false);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setCreateError(body.error ?? "Could not create the account.");
      return;
    }
    setCreatedCreds({ email: body.user.email, tempPassword: body.tempPassword });
    setCuName("");
    setCuEmail("");
    void load();
  }

  async function userAction(id: string, action: string, extra?: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Action failed.");
    }
    void load();
  }

  async function revokeInvite(id: string) {
    await fetch(`/api/admin/invitations/${id}`, { method: "DELETE" });
    void load();
  }

  async function openOverrides(u: UserRow) {
    setOvNotice(null);
    setEditing(u);
    setOv(null);
    const res = await fetch(`/api/admin/users/${u.id}/overrides`);
    if (!res.ok) {
      setOvNotice("Could not load this user's access.");
      return;
    }
    const data: OverrideData = await res.json();
    setOv(data);
    setOvDraft(new Map(data.overrides.map((o) => [o.module, o.effect])));
  }

  async function saveOverrides() {
    if (!editing) return;
    const overrides = [...ovDraft].map(([module, effect]) => ({ module, effect }));
    const res = await fetch(`/api/admin/users/${editing.id}/overrides`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ overrides }),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({}));
      setOvNotice(b.error ?? "Save failed.");
      return;
    }
    setOvNotice(`Saved access for ${editing.name ?? editing.email}.`);
    void load();
  }

  const byArea = useMemo(() => {
    const groups = new Map<string, { areaLabel: string; mods: PermModule[] }>();
    for (const m of ov?.modules ?? []) {
      const g = groups.get(m.areaId) ?? { areaLabel: m.areaLabel, mods: [] };
      g.mods.push(m);
      groups.set(m.areaId, g);
    }
    return [...groups.values()];
  }, [ov]);

  const baseSet = useMemo(() => new Set(ov?.base ?? []), [ov]);
  const label = (r: { name: string; key: string }) => r.name || r.key.replace(/_/g, " ");

  function setEffect(slug: string, value: "inherit" | Effect) {
    setOvDraft((d) => {
      const next = new Map(d);
      if (value === "inherit") next.delete(slug);
      else next.set(slug, value);
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <section>
        <h2 style={{ marginBottom: 8 }}>Invite a user</h2>
        <form onSubmit={invite} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 220px" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={authInput} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Role</span>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} style={authInput}>
              {systemRoles.map((r) => (
                <option key={r.id} value={r.key}>
                  {label(r)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" style={authPrimaryBtn}>
            Send invite
          </button>
        </form>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 0" }}>
          Invite with a built-in role, then switch the person to a custom role below once they&apos;ve joined.
        </p>
        {notice ? <p role="status" style={{ color: "var(--accent)", fontSize: 13 }}>{notice}</p> : null}
        {error ? <p role="alert" style={{ color: "#fca5a5", fontSize: 13 }}>{error}</p> : null}
      </section>

      <section>
        <h2 style={{ marginBottom: 8 }}>Create a user directly</h2>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 8px" }}>
          No email needed — you&apos;ll get a one-time temporary password to pass on. The user must
          set their own password the first time they sign in.
        </p>
        <form onSubmit={createUser} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 180px" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Full name</span>
            <input type="text" required value={cuName} onChange={(e) => setCuName(e.target.value)} style={authInput} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 200px" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Email</span>
            <input type="email" required value={cuEmail} onChange={(e) => setCuEmail(e.target.value)} style={authInput} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Role</span>
            <select value={cuRole} onChange={(e) => setCuRole(e.target.value)} style={authInput}>
              {systemRoles.map((r) => (
                <option key={r.id} value={r.key}>
                  {label(r)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={creating} style={{ ...authPrimaryBtn, opacity: creating ? 0.6 : 1 }}>
            {creating ? "Creating…" : "Create account"}
          </button>
        </form>
        {createError ? <p role="alert" style={{ color: "#fca5a5", fontSize: 13 }}>{createError}</p> : null}
        {createdCreds ? (
          <div
            style={{
              marginTop: 10,
              border: "1px solid var(--accent)",
              borderRadius: 10,
              padding: "12px 14px",
              background: "rgba(53,197,168,0.06)",
            }}
          >
            <p style={{ margin: "0 0 8px", fontSize: 13 }}>
              Account created for <strong>{createdCreds.email}</strong>. Share this temporary password
              securely — it won&apos;t be shown again:
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code
                style={{
                  fontSize: 16,
                  letterSpacing: 1,
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  userSelect: "all",
                }}
              >
                {createdCreds.tempPassword}
              </code>
              <button
                type="button"
                style={btn}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(createdCreds.tempPassword);
                    setCopied(true);
                  } catch {
                    /* clipboard blocked — the value is selectable above */
                  }
                }}
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
              <button type="button" style={btn} onClick={() => setCreatedCreds(null)}>
                Done
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {invites.length > 0 ? (
        <section>
          <h2 style={{ marginBottom: 8 }}>Pending invites</h2>
          <table className="ic-rtable" style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ ...cell, textAlign: "left" }}>Email</th>
                <th style={{ ...cell, textAlign: "left" }}>Role</th>
                <th style={{ ...cell, textAlign: "left" }}>Expires</th>
                <th style={cell} />
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.id}>
                  <td style={cell} data-label="Email">{i.email}</td>
                  <td style={cell} data-label="Role">{i.role?.replace(/_/g, " ")}</td>
                  <td style={cell} data-label="Expires">{new Date(i.expiresAt).toLocaleDateString()}</td>
                  <td style={cell} data-label="">
                    <button style={btn} onClick={() => revokeInvite(i.id)}>
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <section>
        <h2 style={{ marginBottom: 8 }}>Users</h2>
        <table className="ic-rtable" style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ ...cell, textAlign: "left" }}>Name</th>
              <th style={{ ...cell, textAlign: "left" }}>Email</th>
              <th style={{ ...cell, textAlign: "left" }}>Role</th>
              <th style={{ ...cell, textAlign: "left" }}>Status</th>
              <th style={{ ...cell, textAlign: "left" }}>Last login</th>
              <th style={cell} />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const canManage = (u.roleRank ?? 0) <= myRank;
              const isSelf = u.id === myId;
              const display = u.roleName ?? (u.role ?? "viewer").replace(/_/g, " ");
              return (
                <tr key={u.id}>
                  <td style={cell} data-label="Name">{u.name ?? "—"}</td>
                  <td style={cell} data-label="Email">{u.email}</td>
                  <td style={cell} data-label="Role">
                    {canManage && !isSelf ? (
                      <select
                        value={u.roleId ?? ""}
                        onChange={(e) => userAction(u.id, "set_role", { roleId: e.target.value })}
                        style={{ ...authInput, padding: 4 }}
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {label(r)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      display
                    )}
                  </td>
                  <td style={cell} data-label="Status">
                    <span style={{ color: u.status === "active" ? "var(--accent)" : u.status === "disabled" ? "#fca5a5" : "var(--muted)" }}>
                      {u.status}
                    </span>
                  </td>
                  <td style={cell} data-label="Last login">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "never"}</td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }} data-label="">
                    {canManage && !isSelf ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button style={btn} onClick={() => openOverrides(u)}>
                          Access
                        </button>
                        {u.status === "disabled" ? (
                          <button style={btn} onClick={() => userAction(u.id, "enable")}>
                            Enable
                          </button>
                        ) : (
                          <button style={btn} onClick={() => userAction(u.id, "disable")}>
                            Disable
                          </button>
                        )}
                        <button style={btn} onClick={() => userAction(u.id, "revoke_sessions")}>
                          Sign out
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: "var(--muted)", fontSize: 13 }}>{isSelf ? "you" : "—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {editing ? (
        <section style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h2 style={{ margin: 0 }}>Access · {editing.name ?? editing.email}</h2>
            <button style={btn} onClick={() => { setEditing(null); setOv(null); }}>
              Close
            </button>
          </div>
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
            Overrides for this person only, on top of their <strong>{editing.roleName ?? editing.role}</strong> role.
            Leave a module on <em>Inherit</em> to follow the role; <em>Allow</em> or <em>Deny</em> override it just for them.
          </p>
          {!ov ? (
            <p style={{ color: "var(--muted)" }}>{ovNotice ?? "Loading…"}</p>
          ) : (
            <>
              {byArea.map((g) => (
                <fieldset key={g.areaLabel} style={{ border: "1px solid var(--border)", borderRadius: 8, marginBottom: 12, padding: "10px 12px" }}>
                  <legend style={{ padding: "0 6px" }}><strong>{g.areaLabel}</strong></legend>
                  <div style={{ display: "grid", gap: 6 }}>
                    {g.mods.map((m) => {
                      const eff = ovDraft.get(m.slug) ?? "inherit";
                      const roleHas = baseSet.has(m.slug);
                      const effective = eff === "inherit" ? roleHas : eff === "allow";
                      return (
                        <div key={m.slug} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 14 }}>
                          <span style={{ flex: "1 1 auto" }}>{m.label}</span>
                          <span style={{ fontSize: 12, color: "var(--muted)", width: 110, textAlign: "right" }}>
                            role: {roleHas ? "allowed" : "hidden"}
                          </span>
                          <select
                            value={eff}
                            onChange={(e) => setEffect(m.slug, e.target.value as "inherit" | Effect)}
                            style={{ ...authInput, padding: 4, width: 110 }}
                          >
                            <option value="inherit">Inherit</option>
                            <option value="allow">Allow</option>
                            <option value="deny">Deny</option>
                          </select>
                          <span
                            title={effective ? "Can see" : "Hidden"}
                            style={{ width: 10, height: 10, borderRadius: "50%", background: effective ? "var(--accent)" : "var(--border)" }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <button onClick={saveOverrides} style={authPrimaryBtn}>Save access</button>
                <button onClick={() => setOvDraft(new Map())} style={authGhostBtn}>Reset all to inherit</button>
                {ovNotice ? <span role="status" style={{ color: "var(--accent)", fontSize: 13 }}>{ovNotice}</span> : null}
              </div>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
