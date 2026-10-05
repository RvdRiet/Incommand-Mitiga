"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { useEventId } from "@/context/EventContext";
import { usePermissions } from "@/context/PermissionsContext";
import { IconChevron, IconGear } from "./icons";
import {
  getModuleBySlug,
  INCIDENT_AREAS,
  moduleHref,
  SETTINGS_MODULE,
  type NavArea,
} from "@/lib/navigation/modules";

export function Sidebar({ activeSlug }: { activeSlug: string }) {
  const pathname = usePathname();
  const eventId = useEventId();
  const { canSee } = usePermissions();

  function isActive(slug: string) {
    if (activeSlug) return activeSlug === slug;
    const href = moduleHref(eventId, slug);
    return pathname === href || pathname === `${href}/`;
  }

  // An area is "current" when the active page is its hub or one of its modules.
  function areaContainsActive(area: NavArea) {
    return area.hubSlug === activeSlug || area.moduleSlugs.includes(activeSlug);
  }

  // Manual expand/collapse overrides; default open = the area holding the active page.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const isOpen = (area: NavArea) => overrides[area.id] ?? areaContainsActive(area);

  return (
    <aside className="ic-sidebar">
      <nav className="ic-sidebar__nav" aria-label="Incident areas">
        {INCIDENT_AREAS.map((area) => {
          // Only the modules this role may see; hide the whole area if none.
          const visibleSlugs = area.moduleSlugs.filter((slug) => canSee(slug));
          if (visibleSlugs.length === 0) return null;
          // If the area's primary tool is hidden, point its label at the first visible one.
          const primarySlug = canSee(area.primarySlug) ? area.primarySlug : visibleSlugs[0];
          const open = isOpen(area);
          const areaActive = areaContainsActive(area);
          return (
            <div
              key={area.id}
              className={`ic-nav-area${open ? " ic-nav-area--open" : ""}`}
            >
              <div className={`ic-nav-area__head${areaActive ? " ic-nav-area__head--active" : ""}`}>
                <Link
                  href={moduleHref(eventId, primarySlug)}
                  className="ic-nav-area__label"
                  aria-current={isActive(primarySlug) ? "page" : undefined}
                >
                  <area.icon />
                  <span>{area.label}</span>
                </Link>
                <button
                  type="button"
                  className="ic-nav-area__toggle"
                  aria-expanded={open}
                  aria-label={`${open ? "Collapse" : "Expand"} ${area.label}`}
                  onClick={() =>
                    setOverrides((o) => ({ ...o, [area.id]: !open }))
                  }
                >
                  <IconChevron className="ic-nav-area__chevron" />
                </button>
              </div>

              {open ? (
                <ul className="ic-nav-sublist">
                  {visibleSlugs.map((slug) => {
                    const mod = getModuleBySlug(slug);
                    if (!mod) return null;
                    const active = isActive(slug);
                    return (
                      <li key={slug || "dashboard"}>
                        <Link
                          href={moduleHref(eventId, slug)}
                          className={`ic-nav-link ${active ? "ic-nav-link--active" : ""}`}
                          aria-current={active ? "page" : undefined}
                        >
                          <mod.icon />
                          <span>{mod.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>

      <Link
        href={moduleHref(eventId, SETTINGS_MODULE.slug)}
        className={`ic-sidebar__footer ${isActive(SETTINGS_MODULE.slug) ? "ic-sidebar__footer--active" : ""}`}
      >
        <IconGear />
        <span>{SETTINGS_MODULE.label}</span>
      </Link>
    </aside>
  );
}
