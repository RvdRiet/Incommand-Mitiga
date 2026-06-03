import type { ReactNode } from "react";

export function WidgetCard({
  title,
  icon,
  children,
  className = "",
}: {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <article className={`ic-widget ${className}`.trim()}>
      <header className="ic-widget__head">
        {icon ? <span className="ic-widget__icon">{icon}</span> : null}
        <h3 className="ic-widget__title">{title}</h3>
      </header>
      <div className="ic-widget__body">{children}</div>
    </article>
  );
}
