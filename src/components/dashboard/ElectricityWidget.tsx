"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useEventId } from "@/context/EventContext";
import type { UtilityRow } from "@/lib/incident/types";
import { utilitiesByCity } from "@/lib/incident/utilities";
import { moduleHref } from "@/lib/navigation/modules";
import type { LoadSheddingSnapshot } from "@/lib/loadshedding/types";

import { MetricGroup } from "./MetricGroup";

function formatSaTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-ZA", {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Africa/Johannesburg",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function formatCustomers(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function ElectricityWidget({
  customersWithoutPower,
  utilities,
  lat,
  lng,
}: {
  customersWithoutPower: number;
  utilities: UtilityRow[];
  lat: number | null;
  lng: number | null;
}) {
  const eventId = useEventId();
  const [data, setData] = useState<LoadSheddingSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (lat != null && lng != null) {
      params.set("lat", String(lat));
      params.set("lng", String(lng));
    }
    const q = params.toString();
    setLoading(true);
    setError(null);
    fetch(`/api/loadshedding${q ? `?${q}` : ""}`)
      .then((r) => r.json())
      .then((json: LoadSheddingSnapshot & { error?: string }) => {
        if (json.error) throw new Error(json.error);
        setData(json);
      })
      .catch(() => {
        setData(null);
        setError("Could not load load shedding status.");
      })
      .finally(() => setLoading(false));
  }, [lat, lng]);

  const nextEvent = data?.area?.events?.[0];
  const byCity = useMemo(() => utilitiesByCity(utilities), [utilities]);
  const citiesWithOutages = byCity.filter((c) => c.customersWithoutPower > 0);

  return (
    <div className="ic-electricity-widget">
      <MetricGroup
        items={[
          { value: customersWithoutPower, label: "Customers without power (ops)" },
        ]}
      />

      {byCity.length > 0 ? (
        <div className="ic-electricity-widget__cities" aria-label="Outages by city">
          <p className="ic-electricity-widget__label">By city (A–Z)</p>
          <ul className="ic-electricity-widget__city-list">
            {(citiesWithOutages.length > 0 ? citiesWithOutages : byCity).map((c) => (
              <li key={c.city}>
                <span className="ic-electricity-widget__city-name">{c.city}</span>
                <span className="ic-electricity-widget__city-count">
                  {formatCustomers(c.customersWithoutPower)} without power
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {loading ? (
        <p className="ic-electricity-widget__hint">Loading SA grid status…</p>
      ) : error ? (
        <p className="ic-electricity-widget__hint">{error}</p>
      ) : data ? (
        <>
          <p className="ic-electricity-widget__national">
            <span className="ic-electricity-widget__label">National</span>
            <strong>{data.national.label}</strong>
          </p>

          {data.area ? (
            <div className="ic-electricity-widget__area">
              <p className="ic-electricity-widget__area-name">{data.area.name}</p>
              <p className="ic-electricity-widget__hint">{data.area.region}</p>
              {nextEvent ? (
                <p className="ic-electricity-widget__next">
                  Next: {formatSaTime(nextEvent.start)} – {formatSaTime(nextEvent.end)}
                  {nextEvent.note ? ` (${nextEvent.note})` : ""}
                </p>
              ) : (
                <p className="ic-electricity-widget__hint">No upcoming slots in this area.</p>
              )}
            </div>
          ) : data.configureAreaSchedule ? (
            <p className="ic-electricity-widget__hint">
              Set incident location on the map for area schedules, or add{" "}
              <code className="ic-code-inline">LOADSHEDDING_AREA_ID</code> in env (ESP area id).
            </p>
          ) : (
            <p className="ic-electricity-widget__hint">
              National status from Eskom. Add a free{" "}
              <a href="https://eskomsepush.gumroad.com/l/api" target="_blank" rel="noopener noreferrer">
                ESP API token
              </a>{" "}
              for suburb-level schedules.
            </p>
          )}

          <p className="ic-electricity-widget__sources">
            {data.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                {s.label}
              </a>
            ))}
          </p>
        </>
      ) : null}

      <Link href={moduleHref(eventId, "utilities-electricity")} className="ic-electricity-widget__link">
        Utilities module →
      </Link>
    </div>
  );
}
