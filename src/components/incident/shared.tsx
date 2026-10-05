"use client";

import { useMemo, useState } from "react";

import { IconPin } from "@/components/ui/icons";

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

/**
 * Clamp a numeric input string to [min, max]. HTML `min`/`max` attributes only
 * gate the spinner + validity state — a user can still type or paste an
 * out-of-range value — so we enforce the bounds here before the value reaches
 * the store. Empty and mid-typing strings ("-", ".") pass through untouched, and
 * an already in-range value keeps its exact keystrokes (so "05" or "5." survive).
 */
export function clampNumericInput(raw: string, min?: number, max?: number): string {
  if (raw === "") return "";
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  let c = n;
  if (typeof min === "number") c = Math.max(min, c);
  if (typeof max === "number") c = Math.min(max, c);
  return c === n ? raw : String(c);
}

export function InlineInput({
  value,
  onChange,
  type = "text",
  className = "",
  placeholder,
  min,
  max,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  className?: string;
  placeholder?: string;
  min?: number;
  max?: number;
}) {
  const isNumber = type === "number";
  return (
    <input
      type={type}
      className={`ic-inline-input ${className}`}
      value={value}
      placeholder={placeholder}
      min={isNumber ? min : undefined}
      max={isNumber ? max : undefined}
      onChange={(e) =>
        onChange(isNumber ? clampNumericInput(e.target.value, min, max) : e.target.value)
      }
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

/** Compact lat/lng editor so a record can be plotted on the map (Common Operating Picture). */
export function CoordCell({
  lat,
  lng,
  onChange,
}: {
  lat?: number | null;
  lng?: number | null;
  onChange: (patch: { lat: number | null; lng: number | null }) => void;
}) {
  // Clamp to valid geographic ranges so a stray keystroke can't push a marker off
  // the map (or break distance math): latitude ±90, longitude ±180. Blank → null.
  const parse = (v: string, lo: number, hi: number) => {
    if (v.trim() === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(hi, Math.max(lo, n));
  };
  const plotted = typeof lat === "number" && typeof lng === "number";
  return (
    <div className={`ic-coord-cell${plotted ? " ic-coord-cell--on" : ""}`} title="Map location">
      <span className="ic-coord-cell__pin" aria-hidden>
        <IconPin size={13} />
      </span>
      <input
        type="number"
        step="0.0001"
        min={-90}
        max={90}
        className="ic-inline-input ic-coord-input"
        placeholder="lat"
        value={lat ?? ""}
        onChange={(e) => onChange({ lat: parse(e.target.value, -90, 90), lng: lng ?? null })}
      />
      <input
        type="number"
        step="0.0001"
        min={-180}
        max={180}
        className="ic-inline-input ic-coord-input"
        placeholder="lng"
        value={lng ?? ""}
        onChange={(e) => onChange({ lat: lat ?? null, lng: parse(e.target.value, -180, 180) })}
      />
    </div>
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
