"use client";

import { useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** Pages a not-yet-set-up tenant may still reach (auth + the wizard itself). */
function isExempt(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/account/change-password") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/accept-invite")
  );
}

/**
 * First-run gate: when a signed-in tenant hasn't finished setup, send them to /setup.
 * Reads the flag fresh from the server (not the JWT) so completing setup unlocks the app
 * on the very next navigation. Never blocks rendering — it only redirects when it knows
 * the tenant is incomplete, so signed-out / offline use is unaffected.
 */
export function SetupGate({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname() ?? "";
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated" || isExempt(pathname)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/setup/status");
        if (!res.ok) return;
        const d = (await res.json()) as { setupComplete?: boolean };
        if (!cancelled && d?.setupComplete === false) router.replace("/setup");
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
