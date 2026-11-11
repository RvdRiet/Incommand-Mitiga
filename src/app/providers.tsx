"use client";

import { SessionProvider } from "next-auth/react";

import { ForcePasswordGate } from "@/components/auth/ForcePasswordGate";
import { SetupGate } from "@/components/setup/SetupGate";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ForcePasswordGate>
        <SetupGate>{children}</SetupGate>
      </ForcePasswordGate>
    </SessionProvider>
  );
}
