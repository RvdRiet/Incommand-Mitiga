"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Sidebar } from "@/components/dashboard/Sidebar";
import { TopBar } from "@/components/dashboard/TopBar";
import { useEventId, useIncidentStore, useIncidentStoreHydrated } from "@/context/EventContext";
import { getModuleBySlug } from "@/lib/navigation/modules";

import { ModuleToolbar } from "./ModuleToolbar";
import { ModuleView } from "./ModuleView";
import { useModuleAddHandler } from "./useModuleAdd";

export function IncidentLayout({ moduleSlug }: { moduleSlug: string }) {
  const eventId = useEventId();
  const storeHydrated = useIncidentStoreHydrated();
  const mod = getModuleBySlug(moduleSlug);
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

  const handleAdd = useModuleAddHandler(moduleSlug);

  const addLabel =
    moduleSlug === "tasks"
      ? "+ Add list"
      : moduleSlug === "roles"
        ? "+ Add Team"
        : "+ Add";

  const showFilter =
    moduleSlug !== "logs" &&
    moduleSlug !== "situation" &&
    moduleSlug !== "briefings" &&
    moduleSlug !== "plays";
  const showSearch =
    moduleSlug !== "situation" &&
    moduleSlug !== "logs" &&
    moduleSlug !== "briefings" &&
    moduleSlug !== "plays" &&
    moduleSlug !== "notifications";
  const showAdd =
    moduleSlug !== "" &&
    moduleSlug !== "forms" &&
    moduleSlug !== "situation" &&
    moduleSlug !== "map" &&
    moduleSlug !== "calendar" &&
    moduleSlug !== "briefings" &&
    moduleSlug !== "plays" &&
    moduleSlug !== "notifications" &&
    moduleSlug !== "status-boards" &&
    moduleSlug !== "settings" &&
    moduleSlug !== "weather";

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
          moduleSlug === "roles" ? (
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
          ) : null
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
          <ModuleView
            slug={moduleSlug}
            searchActive={searchActive}
            filterActive={filterActive}
            orgChartOpen={orgChartOpen}
          />
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
