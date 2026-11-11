"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Pages a must-change-password user may still reach (auth + the change page itself). */
function isExempt(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/account/change-password") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/accept-invite")
  );
}

/**
 * Forced-password gate: when a signed-in user was created with a temporary password
 * (flagged `must_change_password`), send them to the change-password page before they
 * can use anything else — including the setup wizard. Reads the flag fresh from the
 * server (not the JWT) so it clears the instant the password is changed. Wraps OUTSIDE
 * SetupGate, which exempts the change-password page, so the two never fight.
 */
export function ForcePasswordGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname() ?? "";
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated" || isExempt(pathname)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/account/password-status");
        if (!res.ok) return;
        const d = (await res.json()) as { mustChangePassword?: boolean };
        if (!cancelled && d?.mustChangePassword === true) router.replace("/account/change-password");
      } catch {
        /* offline / transient — don't gate */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, pathname, router]);

  return <>{children}</>;
}
