"use client";

import Link from "next/link";

import {
  TopBarAccountMenu,
  TopBarHelpButton,
} from "@/components/dashboard/TopBarMenus";

export function EventsTopBar({ organizationName }: { organizationName: string }) {
  return (
    <header className="ic-topbar ic-topbar--shell events-topbar">
      <div className="ic-topbar__left">
        <Link href="/" className="ic-logo" aria-current="page">
          <span className="ic-logo__in">In</span>
          <span className="ic-logo__command">Command</span>
        </Link>
        <p className="ic-topbar-nav__context">{organizationName}</p>
      </div>
      <section className="ic-topbar__right">
        <span className="ic-topbar-nav__hint">Select or create an event below</span>
        <TopBarHelpButton />
        <TopBarAccountMenu />
      </section>
    </header>
  );
}
