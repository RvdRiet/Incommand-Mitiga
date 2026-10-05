"use client";

import { getModuleBySlug } from "@/lib/navigation/modules";

/**
 * A consistent title + one-line explanation at the top of a module page. Pulls the
 * label and plain-language description straight from the navigation catalogue so every
 * page introduces itself the same way — a newcomer always knows what they are looking at.
 */
export function ModulePageHeader({
  slug,
  children,
}: {
  slug: string;
  /** Optional right-aligned actions (e.g. a primary button). */
  children?: React.ReactNode;
}) {
  const mod = getModuleBySlug(slug);
  if (!mod) return null;
  return (
    <header className="ic-page-head">
      <span className="ic-page-head__icon" aria-hidden>
        <mod.icon />
      </span>
      <div className="ic-page-head__text">
        <h1 className="ic-page-head__title">{mod.label}</h1>
        {mod.description ? (
          <p className="ic-page-head__desc">{mod.description}</p>
        ) : null}
      </div>
      {children ? <div className="ic-page-head__actions">{children}</div> : null}
    </header>
  );
}
