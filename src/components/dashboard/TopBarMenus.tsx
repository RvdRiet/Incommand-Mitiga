"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useId, useRef, useState } from "react";

import { SignOutButton } from "@/components/SignOutButton";
import { canManageUsers } from "@/lib/auth/roles";
import { moduleHref } from "@/lib/navigation/modules";

import { IconBell, IconHelp, IconUser } from "./icons";

type MenuProps = {
  eventId?: string | null;
};

export function TopBarHelpButton() {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div className="ic-topbar-menu">
      <button
        type="button"
        className="ic-topbar__icon"
        aria-label="Help"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        <IconHelp />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="ic-topbar-menu__backdrop"
            aria-label="Close help"
            onClick={() => setOpen(false)}
          />
          <div id={panelId} className="ic-topbar-menu__panel" role="dialog" aria-label="Help">
            <h3 className="ic-topbar-menu__title">Quick help</h3>
            <ul className="ic-topbar-menu__list">
              <li>Use the sidebar or module jump menu to switch ICS modules.</li>
              <li>Search filters visible rows; Filters narrows by status where available.</li>
              <li>Set incident location in Situation, then draw areas on the Map module.</li>
            </ul>
            <button type="button" className="ic-topbar-menu__close" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function TopBarNotificationsButton({ eventId }: MenuProps) {
  if (!eventId) {
    return (
      <button type="button" className="ic-topbar__icon" aria-label="Notifications" disabled>
        <IconBell />
      </button>
    );
  }

  return (
    <Link
      href={moduleHref(eventId, "notifications")}
      className="ic-topbar__icon"
      aria-label="Open notifications"
      title="Notifications"
    >
      <IconBell />
    </Link>
  );
}

export function TopBarAccountMenu({ eventId }: MenuProps) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="ic-topbar-menu" ref={rootRef}>
      <button
        type="button"
        className="ic-topbar__icon"
        aria-label="Account"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => setOpen((v) => !v)}
      >
        <IconUser />
      </button>
      {open ? (
        <ul id={menuId} className="ic-topbar-menu__dropdown" role="menu">
          <li
            role="none"
            style={{ padding: "8px 12px", fontSize: 12, color: "var(--ic-muted)" }}
          >
            {session?.user?.email
              ? `Signed in as ${session.user.email}`
              : "Not signed in (local-only)"}
          </li>
          <li role="none">
            <Link
              href="/"
              className="ic-topbar-menu__dropdown-item"
              role="menuitem"
              onClick={() => setOpen(false)}
            >
              All events
            </Link>
          </li>
          {session?.user ? (
            <li role="none">
              <Link
                href="/account/security"
                className="ic-topbar-menu__dropdown-item"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Security (2FA)
              </Link>
            </li>
          ) : null}
          {eventId ? (
            <li role="none">
              <Link
                href={moduleHref(eventId, "settings")}
                className="ic-topbar-menu__dropdown-item"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Incident settings
              </Link>
            </li>
          ) : null}
          {canManageUsers(session?.role) ? (
            <>
              <li role="none">
                <Link
                  href="/admin/users"
                  className="ic-topbar-menu__dropdown-item"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  Manage users
                </Link>
              </li>
              <li role="none">
                <Link
                  href="/admin/roles"
                  className="ic-topbar-menu__dropdown-item"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  Roles &amp; access
                </Link>
              </li>
            </>
          ) : null}
          <li role="none" className="ic-topbar-menu__dropdown-divider">
            {session?.user ? (
              <SignOutButton className="ic-topbar-menu__dropdown-item ic-topbar-menu__dropdown-item--button" />
            ) : (
              <Link
                href="/login"
                className="ic-topbar-menu__dropdown-item"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Sign in
              </Link>
            )}
          </li>
        </ul>
      ) : null}
    </div>
  );
}
