"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ALL_MODULES, moduleHref } from "@/lib/navigation/modules";

type ModuleToolbarProps = {
  eventId: string;
  moduleSlug: string;
  showSearch?: boolean;
  showFilter?: boolean;
  showAdd?: boolean;
  addLabel?: string;
  extraActions?: React.ReactNode;
  onAdd?: () => void;
  onSearchClick?: () => void;
  onFilterClick?: () => void;
  searchActive?: boolean;
  filterActive?: boolean;
  onMenuToggle?: () => void;
};

export function ModuleToolbar({
  eventId,
  moduleSlug,
  showSearch = true,
  showFilter = true,
  showAdd = true,
  addLabel = "+ Add",
  extraActions,
  onAdd,
  onSearchClick,
  onFilterClick,
  searchActive = false,
  filterActive = false,
  onMenuToggle,
}: ModuleToolbarProps) {
  const router = useRouter();
  const dashboardHref = moduleHref(eventId, "");
  const onDashboard = !moduleSlug;

  return (
    <div className="ic-module-toolbar">
      <div className="ic-module-toolbar__left">
        <button
          type="button"
          className="ic-module-toolbar__menu"
          aria-label="Open navigation menu"
          onClick={onMenuToggle}
        >
          ☰
        </button>
        {!onDashboard ? (
          <Link href={dashboardHref} className="ic-module-toolbar__back">
            ← Dashboard
          </Link>
        ) : null}
        <label className="ic-module-jump">
          <span className="ic-sr-only">Jump to module</span>
          <select
            className="ic-module-jump__select"
            value={moduleSlug}
            onChange={(e) => router.push(moduleHref(eventId, e.target.value))}
          >
            {ALL_MODULES.map((mod) => (
              <option key={mod.slug || "dashboard"} value={mod.slug}>
                {mod.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="ic-module-toolbar__right">
        {extraActions}
        {showSearch ? (
          <button
            type="button"
            className={`ic-toolbar-text-btn${searchActive ? " ic-toolbar-text-btn--active" : ""}`}
            onClick={onSearchClick}
            aria-pressed={searchActive}
          >
            Search
          </button>
        ) : null}
        {showFilter ? (
          <button
            type="button"
            className={`ic-toolbar-text-btn${filterActive ? " ic-toolbar-text-btn--active" : ""}`}
            onClick={onFilterClick}
            aria-pressed={filterActive}
          >
            Filters
          </button>
        ) : null}
        {showAdd ? (
          <button type="button" className="ic-btn-add" onClick={onAdd}>
            {addLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
