"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CENSUS_YEAR, formatPopulation, resolveAutofillCensusPlace } from "@/lib/sa-population";
import type { CensusPlaceResult } from "@/lib/sa-population/types";

type CensusCityFieldProps = {
  label: string;
  city: string;
  censusPlaceId: string | null;
  municipality?: string;
  onCityChange: (city: string) => void;
  onPlaceSelect: (place: CensusPlaceResult) => void;
  /** Clear census link when user edits city manually. */
  onCensusClear?: () => void;
};

export function CensusCityField({
  label,
  city,
  censusPlaceId,
  municipality,
  onCityChange,
  onPlaceSelect,
  onCensusClear,
}: CensusCityFieldProps) {
  const [query, setQuery] = useState(city);
  const [suggestions, setSuggestions] = useState<CensusPlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [autofilled, setAutofilled] = useState(Boolean(censusPlaceId));
  const skipAutofillRef = useRef(false);

  useEffect(() => {
    setQuery(city);
    setAutofilled(Boolean(censusPlaceId));
  }, [city, censusPlaceId]);

  const applyPlace = useCallback(
    (place: CensusPlaceResult) => {
      skipAutofillRef.current = true;
      onPlaceSelect(place);
      setQuery(place.seat || place.name);
      setSuggestions([]);
      setAutofilled(true);
    },
    [onPlaceSelect],
  );

  const tryAutofill = useCallback(
    (text: string) => {
      if (skipAutofillRef.current) {
        skipAutofillRef.current = false;
        return;
      }
      const match = resolveAutofillCensusPlace(text);
      if (match) {
        applyPlace({
          ...match,
          label: `${match.seat || match.name} — ${match.province} (${formatPopulation(match.population)})`,
        });
      }
    },
    [applyPlace],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/sa-population/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((data: { results?: CensusPlaceResult[] }) => {
          const results = data.results ?? [];
          setSuggestions(results);
          if (!censusPlaceId && results.length > 0) {
            tryAutofill(q);
          }
        })
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 400);
    return () => clearTimeout(t);
  }, [query, censusPlaceId, tryAutofill]);

  return (
    <div className="ic-route-field ic-route-field--compact">
      {label ? <span className="ic-route-field__label">{label}</span> : null}
      <input
        type="search"
        className="ic-route-field__input"
        value={query}
        placeholder="Type city name…"
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          onCityChange(v);
          setAutofilled(false);
          if (censusPlaceId) onCensusClear?.();
        }}
        onBlur={() => {
          if (!autofilled && query.trim().length >= 2) {
            tryAutofill(query.trim());
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && suggestions[0]) {
            e.preventDefault();
            applyPlace(suggestions[0]);
          }
        }}
      />
      {loading ? <p className="ic-route-field__hint">Matching Census {CENSUS_YEAR}…</p> : null}
      {autofilled && municipality ? (
        <p className="ic-route-field__hint ic-route-field__hint--ok">
          {municipality} · Census {CENSUS_YEAR} auto-filled
        </p>
      ) : null}
      {!autofilled && suggestions.length > 0 ? (
        <ul className="ic-route-suggestions">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => applyPlace(s)}>
                {s.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
