"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useEventId } from "@/context/EventContext";
import { IconGear } from "./icons";
import {
  INFO_MODULES,
  D4H_EXTRA_MODULES,
  OPERATIONS_MODULES,
  PRIMARY_MODULES,
  SETTINGS_MODULE,
  TASK_MODULE,
  moduleHref,
} from "@/lib/navigation/modules";

export function Sidebar({ activeSlug }: { activeSlug: string }) {
  const pathname = usePathname();
  const eventId = useEventId();

  function isActive(slug: string) {
    if (activeSlug) return activeSlug === slug;
    const href = moduleHref(eventId, slug);
    return pathname === href || pathname === `${href}/`;
  }

  function navLink(slug: string, label: string, Icon: React.ComponentType) {
    const active = isActive(slug);
    return (
      <li key={slug || "dashboard"}>
        <Link
          href={moduleHref(eventId, slug)}
          className={`ic-nav-link ${active ? "ic-nav-link--active" : ""}`}
          aria-current={active ? "page" : undefined}
        >
          <Icon />
          <span>{label}</span>
        </Link>
      </li>
    );
  }

  return (
    <aside className="ic-sidebar">
      <nav className="ic-sidebar__nav" aria-label="Incident modules">
        <ul className="ic-nav-list">
          {PRIMARY_MODULES.map((item) => navLink(item.slug, item.label, item.icon))}
        </ul>

        <ul className="ic-nav-list ic-nav-list--divider">
          {navLink(TASK_MODULE.slug, TASK_MODULE.label, TASK_MODULE.icon)}
          {D4H_EXTRA_MODULES.map((item) => navLink(item.slug, item.label, item.icon))}
        </ul>

        <ul className="ic-nav-list ic-nav-list--divider">
          {OPERATIONS_MODULES.map((item) => navLink(item.slug, item.label, item.icon))}
        </ul>

        <ul className="ic-nav-list ic-nav-list--divider">
          {INFO_MODULES.map((item) => navLink(item.slug, item.label, item.icon))}
        </ul>
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
