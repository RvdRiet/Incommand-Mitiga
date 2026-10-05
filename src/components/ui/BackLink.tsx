import Link from "next/link";
import type { ReactNode } from "react";

import { IconArrowLeft } from "./icons";

/**
 * Shared "go back" control. The desktop (Electron) shell has no browser back/forward
 * arrows, so every page that isn't the root needs an explicit, easy-to-hit way back.
 * Rendered as a proper button-sized target (not a bare text link) with a consistent
 * look across the app — see `.ic-back-btn` in globals.css.
 */
export function BackLink({
  href,
  children = "Back",
  className = "",
}: {
  href: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={`ic-back-btn ${className}`.trim()}>
      <span className="ic-back-btn__icon" aria-hidden>
        <IconArrowLeft size={15} />
      </span>
      <span>{children}</span>
    </Link>
  );
}
