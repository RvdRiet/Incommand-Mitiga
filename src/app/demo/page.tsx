"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { eventHref, useEventsStore, useEventsStoreHydrated } from "@/lib/events/store";
import { getIncidentStore } from "@/lib/incident/incident-store-registry";

/**
 * Public demo entry point.
 *
 * Spins up a fresh, pre-populated "sandbox" incident and drops the visitor
 * straight into the console — no sign-in required. This is an additive route;
 * it does not touch any existing app flow. For a production deployment, point
 * public demo traffic at a SEPARATE demo instance of the app so it can never
 * affect the live operations plane.
 */
const DEMO_TEAM = [
  { name: "Thandi Mokoena", role: "Incident Commander" },
  { name: "Johan van Wyk", role: "Operations Section Chief" },
  { name: "Sipho Dlamini", role: "Planning Section Chief" },
  { name: "Aisha Patel", role: "Logistics Section Chief" },
  { name: "Riaan Botha", role: "Safety Officer" },
];

export default function DemoPage() {
  const router = useRouter();
  const hydrated = useEventsStoreHydrated();
  const createEvent = useEventsStore((s) => s.createEvent);
  const started = useRef(false);
  const [message, setMessage] = useState("Spinning up your sandbox incident…");

  useEffect(() => {
    if (!hydrated || started.current) return;
    started.current = true;

    try {
      const id = createEvent("Demo — Flood: Vaal Basin", "flood");
      // Mark this incident as a sandbox so the console shows the demo banner.
      try {
        localStorage.setItem(`mitiga-demo-${id}`, "1");
      } catch {
        /* ignore */
      }
      // Populate a command team so the roster and ICS org block feel alive.
      try {
        const store = getIncidentStore(id);
        for (const person of DEMO_TEAM) store.getState().addPersonnel(person);
      } catch {
        /* personnel are a nice-to-have; proceed even if seeding fails */
      }
      setMessage("Opening your console…");
      window.setTimeout(() => router.replace(eventHref(id)), 450);
    } catch {
      router.replace("/");
    }
  }, [hydrated, createEvent, router]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(760px 420px at 78% 4%, rgba(45,212,191,.14), transparent 62%)," +
          "radial-gradient(720px 460px at 4% 92%, rgba(251,59,106,.15), transparent 60%), #070d18",
        color: "#eaf1fb",
        fontFamily:
          '-apple-system, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif',
        padding: "24px",
      }}
    >
      <style>{`@keyframes ic-spin{to{transform:rotate(360deg)}}@keyframes ic-pulse{0%,100%{opacity:1}50%{opacity:.55}}`}</style>
      <div style={{ textAlign: "center", maxWidth: "34ch" }}>
        <div
          aria-hidden
          style={{
            width: 54,
            height: 54,
            borderRadius: 14,
            margin: "0 auto 22px",
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(150deg,#fb3b6a,#9f1239)",
            boxShadow: "0 8px 30px -8px rgba(251,59,106,.7)",
            animation: "ic-pulse 1.8s ease-in-out infinite",
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
          </svg>
        </div>
        <div
          aria-hidden
          style={{
            width: 34,
            height: 34,
            margin: "0 auto 20px",
            borderRadius: "50%",
            border: "3px solid rgba(255,255,255,.12)",
            borderTopColor: "#2dd4bf",
            animation: "ic-spin 0.8s linear infinite",
          }}
        />
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 750, letterSpacing: "-.02em" }}>
          {message}
        </h1>
        <p style={{ margin: "10px 0 0", color: "#adbcd4", fontSize: 14.5, lineHeight: 1.6 }}>
          Loading a live flood scenario with staffing, ICS forms, and mapping so you can explore
          the console hands-on.
        </p>
      </div>
    </main>
  );
}
