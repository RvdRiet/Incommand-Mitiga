"use client";

import { signOut } from "next-auth/react";

export function SignOutButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      className={className || undefined}
      onClick={() => void signOut({ callbackUrl: "/" })}
    >
      Sign out
    </button>
  );
}
