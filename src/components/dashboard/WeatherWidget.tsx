"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useEventId } from "@/context/EventContext";
import { moduleHref } from "@/lib/navigation/modules";
import { windCompass, type WeatherForecast } from "@/lib/weather";
import { IconAlertTriangle, WeatherConditionIcon } from "@/components/ui/icons";

/**
 * Compact current-conditions card for the command overview. Reads the incident's situation
 * coordinates and pulls the same Open-Meteo forecast the Weather module uses (/api/weather/forecast),
 * showing just the "now" slice plus the nearest severe-weather risk window.
 */
export function WeatherWidget({ lat, lng }: { lat: number | null; lng: number | null }) {
  const eventId = useEventId();
  const [data, setData] = useState<WeatherForecast | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  useEffect(() => {
    if (lat == null || lng == null) {
      setData(null);
      setState("idle");
      return;
    }
    let cancelled = false;
    setState("loading");
    const attempt = (retriesLeft: number): Promise<void> =>
      fetch(`/api/weather/forecast?lat=${lat}&lng=${lng}`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((j: WeatherForecast) => {
          if (!cancelled) {
            setData(j);
            setState("idle");
          }
        })
        .catch((err) => {
          if (cancelled) return;
          if (retriesLeft > 0) return new Promise<void>((res) => setTimeout(res, 1200)).then(() => attempt(retriesLeft - 1));
          console.warn("[weather] widget forecast failed:", err instanceof Error ? err.message : err);
          setState("error");
        });
    void attempt(1);
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  if (lat == null || lng == null) {
    return (
      <p className="ic-empty-hint">
        Set the incident location in{" "}
        <Link href={moduleHref(eventId, "situation")} className="ic-accent-link">
          Situation
        </Link>{" "}
        to see local weather.
      </p>
    );
  }
  if (state === "loading" && !data) return <p className="ic-empty-hint">Loading weather…</p>;
  if (state === "error" && !data) return <p className="ic-empty-hint">Weather unavailable right now.</p>;

  const cur = data?.current;
  if (!cur) return <p className="ic-empty-hint">No current conditions.</p>;

  const risk = data?.risks?.[0];

  return (
    <div className="ic-weather-widget">
      <div className="ic-weather-widget__main">
        <span className="ic-weather-widget__icon" aria-hidden>
          <WeatherConditionIcon severity={cur.condition.severity} size={30} />
        </span>
        <div>
          <div className="ic-weather-widget__temp">
            {cur.temperatureC != null ? `${Math.round(cur.temperatureC)}°C` : "—"}
          </div>
          <div className="ic-weather-widget__cond">{cur.condition.label}</div>
        </div>
      </div>
      <ul className="ic-weather-widget__meta">
        <li>
          <span>Wind</span>
          <strong>
            {cur.windMs != null ? `${Math.round(cur.windMs)} m/s ${windCompass(cur.windDir)}` : "—"}
          </strong>
        </li>
        <li>
          <span>Humidity</span>
          <strong>{cur.humidity != null ? `${cur.humidity}%` : "—"}</strong>
        </li>
        <li>
          <span>Feels like</span>
          <strong>{cur.apparentC != null ? `${Math.round(cur.apparentC)}°C` : "—"}</strong>
        </li>
      </ul>
      {risk ? (
        <p className="ic-weather-widget__risk ic-btn-icon">
          <IconAlertTriangle size={13} /> {risk.label} · {risk.window}
          {risk.peak ? ` (${risk.peak})` : ""}
        </p>
      ) : null}
      <Link href={moduleHref(eventId, "weather")} className="ic-weather-widget__link">
        Full forecast →
      </Link>
    </div>
  );
}
