"use client";

import { useCallback, useEffect, useState } from "react";

import { ROLES, roleRank } from "@/lib/auth/roles";
import { authInput, authPrimaryBtn } from "@/components/auth/ui";

type UserRow = {
  id: string;
  email: string;
  name: string | null;
  status: string;
  role: string | null;
  lastLoginAt: string | null;
};
type InviteRow = { id: string; email: string; role: string | null; expiresAt: string };

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

export function UsersAdmin({ myRole, myId }: { myRole: string; myId: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("viewer");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignable = ROLES.filter((r) => roleRank(r) <= roleRank(myRole));

  const load = useCallback(async () => {
    setError(null);
    const [u, i] = await Promise.all([
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/invitations").then((r) => r.json()),
    ]);
    setUsers(u.users ?? []);
    setInvites(i.invitations ?? []);
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
      body: JSON.stringify({ email, role }),
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
            <select value={role} onChange={(e) => setRole(e.target.value)} style={authInput}>
              {assignable.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" style={authPrimaryBtn}>
            Send invite
          </button>
        </form>
        {notice ? <p style={{ color: "var(--accent)", fontSize: 13 }}>{notice}</p> : null}
        {error ? <p style={{ color: "#fca5a5", fontSize: 13 }}>{error}</p> : null}
      </section>

      {invites.length > 0 ? (
        <section>
          <h2 style={{ marginBottom: 8 }}>Pending invites</h2>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                  <td style={cell}>{i.email}</td>
                  <td style={cell}>{i.role?.replace(/_/g, " ")}</td>
                  <td style={cell}>{new Date(i.expiresAt).toLocaleDateString()}</td>
                  <td style={cell}>
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
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
              const canManage = roleRank(u.role ?? "viewer") <= roleRank(myRole);
              const isSelf = u.id === myId;
              return (
                <tr key={u.id}>
                  <td style={cell}>{u.name ?? "—"}</td>
                  <td style={cell}>{u.email}</td>
                  <td style={cell}>
                    {canManage && !isSelf ? (
                      <select
                        value={u.role ?? "viewer"}
                        onChange={(e) => userAction(u.id, "set_role", { role: e.target.value })}
                        style={{ ...authInput, padding: 4 }}
                      >
                        {assignable.map((r) => (
                          <option key={r} value={r}>
                            {r.replace(/_/g, " ")}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (u.role ?? "viewer").replace(/_/g, " ")
                    )}
                  </td>
                  <td style={cell}>
                    <span style={{ color: u.status === "active" ? "var(--accent)" : u.status === "disabled" ? "#fca5a5" : "var(--muted)" }}>
                      {u.status}
                    </span>
                  </td>
                  <td style={cell}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "never"}</td>
                  <td style={{ ...cell, whiteSpace: "nowrap" }}>
                    {canManage && !isSelf ? (
                      <div style={{ display: "flex", gap: 6 }}>
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
    </div>
  );
}
