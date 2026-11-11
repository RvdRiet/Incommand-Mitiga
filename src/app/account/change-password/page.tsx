"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

import { AuthShell, ErrorText, Field, authInput, authPrimaryBtn } from "@/components/auth/ui";

/**
 * Change-password screen. Reached by the forced-change gate for accounts created with
 * a temporary password, and usable for a normal self-service change. On success the
 * server bumps the token version (revoking every session), so we sign out and send the
 * user to the login page to sign in with the new password.
 */
export default function ChangePasswordPage() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setPending(true);
    const res = await fetch("/api/account/change-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    if (res.ok) {
      setDone(true);
      // Session is now revoked server-side; sign out cleanly and return to login.
      setTimeout(() => void signOut({ callbackUrl: "/login" }), 1200);
      return;
    }
    setPending(false);
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? "Could not change your password.");
  }

  if (done) {
    return (
      <AuthShell
        title="Password changed"
        subtitle="Signing you out so you can sign in with your new password…"
      >
        {null}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Choose a new password"
      subtitle="Your account was set up with a temporary password. Set your own to continue."
    >
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Field label="Current (temporary) password">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            style={authInput}
          />
        </Field>
        <Field label="New password (min 12 characters)">
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            style={authInput}
          />
        </Field>
        <Field label="Confirm new password">
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            style={authInput}
          />
        </Field>
        <ErrorText>{error}</ErrorText>
        <button
          type="submit"
          disabled={pending}
          style={{ ...authPrimaryBtn, cursor: pending ? "wait" : "pointer" }}
        >
          {pending ? "Saving…" : "Set password & continue"}
        </button>
      </form>
    </AuthShell>
  );
}
