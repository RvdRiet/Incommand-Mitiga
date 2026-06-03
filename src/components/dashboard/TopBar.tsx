"use client";

import Link from "next/link";

import { useEventId } from "@/context/EventContext";
import type { ActivationLevel } from "@/lib/incident/types";
import { moduleHref } from "@/lib/navigation/modules";

import {
  TopBarAccountMenu,
  TopBarHelpButton,
  TopBarNotificationsButton,
} from "./TopBarMenus";

const ACTIVATION_LABEL: Record<ActivationLevel, string> = {
  planning: "Planning",
  activated: "Activated",
  closed: "Closed",
};

export function TopBar({
  incidentName = "Incident",
  activationLevel = "planning",
  moduleLabel,
  moduleSlug = "",
  timerLabel = "— —",
}: {
  incidentName?: string;
  activationLevel?: ActivationLevel;
  moduleLabel?: string;
  moduleSlug?: string;
  timerLabel?: string;
}) {
  const eventId = useEventId();
  const onDashboard = !moduleSlug;
  const crumb = moduleLabel && moduleLabel !== "Dashboard" ? moduleLabel : null;
  const dashboardHref = moduleHref(eventId, "");

  return (
    <header className="ic-topbar ic-topbar--shell">
      <div className="ic-topbar__left">
        <Link href={dashboardHref} className="ic-logo" title="Event dashboard">
          <span className="ic-logo__in">In</span>
          <span className="ic-logo__command">Command</span>
        </Link>

        <nav className="ic-topbar-nav" aria-label="Event navigation">
          <Link href="/" className="ic-topbar-nav__chip">
            ← Events
          </Link>
          <span className="ic-topbar-nav__sep" aria-hidden>
            /
          </span>
          {onDashboard ? (
            <span className="ic-topbar-nav__current" aria-current="page">
              {incidentName}
            </span>
          ) : (
            <Link href={dashboardHref} className="ic-topbar-nav__link">
              {incidentName}
            </Link>
          )}
          {crumb ? (
            <>
              <span className="ic-topbar-nav__sep" aria-hidden>
                /
              </span>
              <span className="ic-topbar-nav__current" aria-current="page">
                {crumb}
              </span>
            </>
          ) : null}
          <span
            className={`ic-activation-pill ic-activation-pill--${activationLevel}`}
            title="Activation level"
          >
            {ACTIVATION_LABEL[activationLevel]}
          </span>
        </nav>
      </div>

      <section className="ic-topbar__right">
        <span className="ic-topbar__timer" title="Time since event start">
          {timerLabel}
        </span>
        <TopBarHelpButton />
        <TopBarNotificationsButton eventId={eventId} />
        <TopBarAccountMenu eventId={eventId} />
      </section>
    </header>
  );
}
