import type { ReactNode } from "react";

export function StatusBar({ items }: { items: { label: string; count: number }[] }) {
  return (
    <section className="ic-status-bar">
      {items.map((item) => (
        <span key={item.label} className="ic-status-bar__item">
          <strong>{item.label}</strong> {item.count}
        </span>
      ))}
    </section>
  );
}

export function SummaryBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <section className="ic-summary-bar">
      <span>{left}</span>
      <span>{right}</span>
    </section>
  );
}

export function DataTable({
  columns,
  rows,
  emptyMessage = "No records yet.",
}: {
  columns: string[];
  rows?: ReactNode[][];
  emptyMessage?: string;
}) {
  const hasRows = rows && rows.length > 0;
  return (
    <section className="ic-table-wrap">
      <table className="ic-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hasRows
            ? rows.map((cells, i) => (
                <tr key={i}>
                  {cells.map((cell, j) => (
                    <td key={j}>{cell}</td>
                  ))}
                </tr>
              ))
            : null}
        </tbody>
      </table>
      {!hasRows ? <p className="ic-table-empty">{emptyMessage}</p> : null}
    </section>
  );
}

export function EmptyHint({ children }: { children: ReactNode }) {
  return <p className="ic-empty-hint">{children}</p>;
}

export function PanelHeader({ title }: { title: string }) {
  return <header className="ic-panel-header">{title}</header>;
}
