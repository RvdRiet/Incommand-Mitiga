"use client";

import Link from "next/link";

import {
  getAreaForModule,
  getModuleBySlug,
  isHubSlug,
  moduleHref,
} from "@/lib/navigation/modules";
import { IconMenu } from "@/components/ui/icons";

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
  const onDashboard = !moduleSlug;
  const area = getAreaForModule(moduleSlug);
  const onHub = isHubSlug(moduleSlug);
  const mod = getModuleBySlug(moduleSlug);

  return (
    <div className="ic-module-toolbar">
      <div className="ic-module-toolbar__left">
        <button
          type="button"
          className="ic-module-toolbar__menu"
          aria-label="Open navigation menu"
          onClick={onMenuToggle}
        >
          <IconMenu />
        </button>
        {/* Breadcrumb: Area › Page. Replaces the old jump-to dropdown so there is one
            clear "where am I" trail instead of a redundant module switcher. */}
        <nav className="ic-crumbs" aria-label="Breadcrumb">
          {onDashboard ? (
            <span className="ic-crumbs__here">Overview</span>
          ) : (
            <>
              {area ? (
                <Link href={moduleHref(eventId, area.hubSlug)} className="ic-crumbs__link">
                  {area.label}
                </Link>
              ) : null}
              {area && !onHub ? <span className="ic-crumbs__sep">›</span> : null}
              {!onHub ? (
                <span className="ic-crumbs__here">{mod?.label ?? ""}</span>
              ) : null}
            </>
          )}
        </nav>
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
