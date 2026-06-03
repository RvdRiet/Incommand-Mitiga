"use client";

import { useMemo, useState } from "react";

export function SortBar({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="ic-filter-panel ic-filter-panel--inline">
      <label className="ic-filter-panel__label">
        <span>{label}</span>
        <select
          className="ic-filter-panel__select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function StatusFilterBar({
  active,
  label,
  value,
  options,
  onChange,
}: {
  active?: boolean;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  if (!active) return null;
  return (
    <div className="ic-filter-panel">
      <label className="ic-filter-panel__label">
        <span>{label}</span>
        <select
          className="ic-filter-panel__select"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function useSearchFilter<T>(rows: T[], predicate: (row: T, q: string) => boolean) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => predicate(r, q));
  }, [rows, query, predicate]);
  return { query, setQuery, filtered };
}

export function InlineInput({
  value,
  onChange,
  type = "text",
  className = "",
  placeholder,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      className={`ic-inline-input ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function InlineSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select className="ic-inline-input" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function RowDelete({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="ic-row-delete" onClick={onClick} title="Remove">
      ×
    </button>
  );
}

export function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}
