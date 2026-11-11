"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { useEventId, useIncidentStore, useIncidentStoreHydrated } from "@/context/EventContext";
import { usePermissions } from "@/context/PermissionsContext";
import { getModuleBySlug } from "@/lib/navigation/modules";
import { ALL_MODULE_SLUGS } from "@/lib/auth/permissions";
import { isModuleInEdition } from "@/lib/editions";

const RESTRICTABLE = new Set(ALL_MODULE_SLUGS);

import { DemoBanner } from "./DemoBanner";
import { DistressBanner } from "./DistressBanner";
import { useTelemetryDistress } from "./useTelemetryDistress";
import { ModuleDataMenu } from "./ModuleDataMenu";
import { ModuleToolbar } from "./ModuleToolbar";
import { ModuleView } from "./ModuleView";
import { useModuleAddHandler } from "./useModuleAdd";
import { EXPORTABLE_MODULE_SLUGS } from "@/lib/incident/module-export";

/** Modules whose view renders a <SearchBar> (searchActive) — the only ones that show "Search". */
const SEARCH_MODULES = new Set([
  "roles",
  "damage-assessment",
  "residents",
  "resource-requests",
  "road-damages",
  "shelters",
  "utilities-electricity",
  "personnel",
  "library",
  "map-annotations",
  "tasks",
]);

/** Modules whose view uses `filterActive` (status filter) — the only ones that show "Filters". */
const FILTER_MODULES = new Set([
  "damage-assessment",
  "resource-requests",
  "road-damages",
  "shelters",
]);

/**
 * Modules whose toolbar "+ Add" performs a real action (mirrors useModuleAdd's cases).
 * Positive allowlist — anything not listed hides the button so we never render a dead
 * one. Views that provide their own in-page add control (calendar, status-boards,
 * notifications, forms) are intentionally omitted here.
 */
const TOOLBAR_ADD_MODULES = new Set([
  "roles",
  "tasks",
  "damage-assessment",
  "residents",
  "resource-requests",
  "road-damages",
  "shelters",
  "utilities-electricity",
  "personnel",
  "library",
  "map-annotations",
]);

export function IncidentLayout({ moduleSlug }: { moduleSlug: string }) {
  const eventId = useEventId();
  const storeHydrated = useIncidentStoreHydrated();
  const { canSee } = usePermissions();
  const mod = getModuleBySlug(moduleSlug);
  // Block direct navigation to a restrictable module the role may not see.
  const moduleBlocked = RESTRICTABLE.has(moduleSlug) && !canSee(moduleSlug);
  const isDashboard = !moduleSlug;
  const situation = useIncidentStore((s) => s.situation);
  const [searchActive, setSearchActive] = useState(false);
  const [filterActive, setFilterActive] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgChartOpen = moduleSlug === "roles" && searchParams.get("orgChart") === "1";

  useEffect(() => {
    setSidebarOpen(false);
    setSearchActive(false);
    setFilterActive(false);
  }, [pathname]);

  useTelemetryDistress();

  const handleAdd = useModuleAddHandler(moduleSlug);

  const addLabel =
    moduleSlug === "tasks"
      ? "+ Add list"
      : moduleSlug === "roles"
        ? "+ Add Team"
        : "+ Add";

  // Only show Search / Filters on modules that actually implement them (otherwise they're dead
  // buttons). These lists mirror the views that render a <SearchBar> / use `filterActive`.
  const showSearch = SEARCH_MODULES.has(moduleSlug);
  const showFilter = FILTER_MODULES.has(moduleSlug);
  const showAdd = TOOLBAR_ADD_MODULES.has(moduleSlug);

  if (!storeHydrated) {
    return (
      <div className="ic-app">
        <main className="ic-main ic-main--module" style={{ padding: 24 }}>
          <p className="ic-empty-hint">Loading workspace…</p>
        </main>
      </div>
    );
  }

  return (
    <div className={`ic-app${sidebarOpen ? " ic-app--sidebar-open" : ""}`}>
      <TopBar
        incidentName={situation.name}
        activationLevel={situation.activationLevel}
        moduleLabel={mod?.label}
        moduleSlug={moduleSlug}
        timerLabel={
          situation.startDate ? (
            <ElapsedTimer startDate={situation.startDate} />
          ) : (
            "— —"
          )
        }
      />
      <DemoBanner />
      {/* Distress is part of Live Ops comms — hide its banner when that module is out of edition. */}
      {isModuleInEdition("comms") && <DistressBanner />}
      <ModuleToolbar
        eventId={eventId}
        moduleSlug={moduleSlug}
        showSearch={showSearch}
        showFilter={showFilter}
        showAdd={showAdd}
        addLabel={addLabel}
        onAdd={handleAdd}
        searchActive={searchActive}
        filterActive={filterActive}
        onSearchClick={() => setSearchActive((v) => !v)}
        onFilterClick={() => setFilterActive((v) => !v)}
        onMenuToggle={() => setSidebarOpen((v) => !v)}
        extraActions={
          <>
            {moduleSlug === "roles" ? (
              <button
                type="button"
                className={`ic-toolbar-text-btn${orgChartOpen ? " ic-toolbar-text-btn--active" : ""}`}
                aria-pressed={orgChartOpen}
                onClick={() => {
                  const params = new URLSearchParams(searchParams.toString());
                  if (orgChartOpen) params.delete("orgChart");
                  else params.set("orgChart", "1");
                  const q = params.toString();
                  router.push(q ? `${pathname}?${q}` : pathname);
                }}
              >
                Org Chart
              </button>
            ) : null}
            {EXPORTABLE_MODULE_SLUGS.has(moduleSlug) ? (
              <ModuleDataMenu slug={moduleSlug} />
            ) : null}
          </>
        }
      />
      {sidebarOpen ? (
        <button
          type="button"
          className="ic-sidebar-backdrop"
          aria-label="Close navigation menu"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <div className="ic-app__body">
        <Sidebar activeSlug={moduleSlug} />
        <main className={`ic-main ${isDashboard ? "ic-main--dashboard" : "ic-main--module"}`}>
          {moduleBlocked ? (
            <div className="ic-empty-hint" style={{ padding: 24, maxWidth: 520 }}>
              <h2 style={{ marginTop: 0 }}>Access restricted</h2>
              <p>
                Your role doesn&apos;t have access to <strong>{mod?.label ?? "this module"}</strong>{" "}
                for this district. If you need it, ask a district administrator to grant your role
                access under Roles &amp; access.
              </p>
            </div>
          ) : (
            <ModuleView
              slug={moduleSlug}
              searchActive={searchActive}
              filterActive={filterActive}
              orgChartOpen={orgChartOpen}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function formatElapsed(start: Date, end: Date) {
  if (Number.isNaN(start.getTime())) return "— —";
  const ms = Math.max(0, end.getTime() - start.getTime());
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return `${days}d ${hours}h`;
}

/** Client-only timer so SSR HTML does not depend on `Date.now()`. */
function ElapsedTimer({ startDate }: { startDate: string }) {
  const [label, setLabel] = useState("— —");

  useEffect(() => {
    const start = new Date(startDate);
    if (Number.isNaN(start.getTime())) {
      setLabel("— —");
      return;
    }
    const tick = () => setLabel(formatElapsed(start, new Date()));
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [startDate]);

  return <>{label}</>;
}
