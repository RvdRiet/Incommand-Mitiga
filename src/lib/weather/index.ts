export type WeatherPointResult = {
  provider: string;
  headline: string;
  detail: string;
  asOf: string;
  disclaimer: string;
};

function inUsHeuristic(lat: number, lng: number) {
  return lat >= 24 && lat <= 50 && lng >= -125 && lng <= -66;
}

async function fetchNws(lat: number, lng: number): Promise<WeatherPointResult> {
  const headers = { "User-Agent": "(InCommand Mitiga, contact: ops@example.com)" };
  const pointRes = await fetch(`https://api.weather.gov/points/${lat},${lng}`, {
    headers,
    next: { revalidate: 900 },
  });

  if (!pointRes.ok) {
    return {
      provider: "NWS",
      headline: "NWS lookup failed",
      detail: `HTTP ${pointRes.status}`,
      asOf: new Date().toISOString(),
      disclaimer:
        "Weather information supports situational awareness only. It is not a replacement for official warnings received through authorized alerting channels.",
    };
  }

  const pointJson = (await pointRes.json()) as {
    properties?: {
      forecast?: string;
      relativeLocation?: { properties?: { city?: string; state?: string } };
    };
  };

  const forecastHref = pointJson.properties?.forecast;
  const locLabel = [
    pointJson.properties?.relativeLocation?.properties?.city,
    pointJson.properties?.relativeLocation?.properties?.state,
  ]
    .filter(Boolean)
    .join(", ");

  if (!forecastHref) {
    return {
      provider: "NWS",
      headline: "NWS point resolved",
      detail: locLabel ? `Near ${locLabel}` : "Forecast URL unavailable",
      asOf: new Date().toISOString(),
      disclaimer:
        "Weather information supports situational awareness only. It is not a replacement for official warnings received through authorized alerting channels.",
    };
  }

  const fcRes = await fetch(forecastHref, { headers, next: { revalidate: 900 } });
  const fcJson = (await fcRes.json()) as {
    properties?: {
      periods?: {
        name?: string;
        shortForecast?: string;
        temperature?: number;
        temperatureUnit?: string;
      }[];
    };
  };
  const p0 = fcJson.properties?.periods?.[0];
  const headline = p0?.name ? `${p0.name}` : "Forecast";
  const detail = p0
    ? `${p0.shortForecast ?? ""}${
        p0.temperature != null ? ` · ${p0.temperature}${p0.temperatureUnit ?? ""}` : ""
      }`
    : "No forecast periods returned.";

  return {
    provider: "NWS",
    headline,
    detail: locLabel ? `${detail} (${locLabel})` : detail,
    asOf: new Date().toISOString(),
    disclaimer:
      "Weather information supports situational awareness only. It is not a replacement for official warnings received through authorized alerting channels. Source: NWS — availability not guaranteed.",
  };
}

async function fetchOpenMeteo(lat: number, lng: number): Promise<WeatherPointResult> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set("current", "temperature_2m,weather_code,wind_speed_10m");
  url.searchParams.set("timezone", "auto");

  const res = await fetch(url.toString(), { next: { revalidate: 900 } });
  const j = (await res.json()) as {
    current?: { temperature_2m?: number; weather_code?: number; wind_speed_10m?: number };
  };
  const c = j.current;
  const detail = c
    ? `Temp ${c.temperature_2m ?? "?"}°C · wind ${c.wind_speed_10m ?? "?"} m/s · code ${c.weather_code ?? "?"}`
    : "No current conditions returned.";

  return {
    provider: "Open-Meteo",
    headline: "Current conditions",
    detail,
    asOf: new Date().toISOString(),
    disclaimer:
      "Global forecast — verify with local authorities. Weather information supports situational awareness only.",
  };
}

export async function getWeatherForPoint(input: {
  lat: number;
  lng: number;
  providerMode: string;
}): Promise<WeatherPointResult> {
  const { lat, lng, providerMode } = input;
  const mode = providerMode.toLowerCase();

  if (mode === "openmeteo") return fetchOpenMeteo(lat, lng);
  if (mode === "nws") return fetchNws(lat, lng);

  if (inUsHeuristic(lat, lng)) return fetchNws(lat, lng);
  return fetchOpenMeteo(lat, lng);
}

/* -------------------------------------------------------------------------- */
/* Hourly meteogram (Open-Meteo) — richer forecast grid for the Weather module */
/* -------------------------------------------------------------------------- */

export type WeatherSeverity = "clear" | "cloud" | "fog" | "rain" | "snow" | "storm";

export type WmoCondition = {
  code: number;
  label: string;
  /** Emoji glyph used as a compact icon in the grid. */
  icon: string;
  severity: WeatherSeverity;
};

export type WeatherHour = {
  /** ISO timestamp in the location's local timezone. */
  time: string;
  temperatureC: number | null;
  apparentC: number | null;
  humidity: number | null;
  condition: WmoCondition;
  precipProbability: number | null;
  precipMm: number | null;
  windMs: number | null;
  windGustMs: number | null;
  /** Meteorological wind direction in degrees (0 = from north). */
  windDir: number | null;
  visibilityKm: number | null;
};

export type WeatherRiskKind = "rain" | "wind" | "storm" | "visibility";

export type WeatherRisk = {
  kind: WeatherRiskKind;
  label: string;
  /** Local hour label window, e.g. "14:00–16:00". */
  window: string;
  peak: string;
};

export type WeatherForecast = {
  provider: string;
  latitude: number;
  longitude: number;
  timezone: string;
  asOf: string;
  current: WeatherHour | null;
  hours: WeatherHour[];
  peaks: {
    maxTempC: number | null;
    minTempC: number | null;
    maxWindGustMs: number | null;
    totalPrecipMm: number | null;
    maxPrecipProbability: number | null;
  };
  risks: WeatherRisk[];
  disclaimer: string;
};

const WEATHER_DISCLAIMER =
  "Forecast is indicative and supports situational awareness only. It is not a substitute for official severe-weather warnings from authorized alerting channels (e.g. SAWS). Source: Open-Meteo.";

/** Decode a WMO weather-interpretation code into a label + icon + severity band. */
export function decodeWmo(code: number | null | undefined): WmoCondition {
  const c = code ?? -1;
  const make = (label: string, icon: string, severity: WeatherSeverity): WmoCondition => ({
    code: c,
    label,
    icon,
    severity,
  });
  switch (c) {
    case 0:
      return make("Clear sky", "☀️", "clear");
    case 1:
      return make("Mainly clear", "🌤️", "clear");
    case 2:
      return make("Partly cloudy", "⛅", "cloud");
    case 3:
      return make("Overcast", "☁️", "cloud");
    case 45:
    case 48:
      return make("Fog", "🌫️", "fog");
    case 51:
    case 53:
    case 55:
      return make("Drizzle", "🌦️", "rain");
    case 56:
    case 57:
      return make("Freezing drizzle", "🌧️", "rain");
    case 61:
      return make("Slight rain", "🌦️", "rain");
    case 63:
      return make("Moderate rain", "🌧️", "rain");
    case 65:
      return make("Heavy rain", "🌧️", "rain");
    case 66:
    case 67:
      return make("Freezing rain", "🌧️", "rain");
    case 71:
      return make("Slight snow", "🌨️", "snow");
    case 73:
      return make("Moderate snow", "❄️", "snow");
    case 75:
      return make("Heavy snow", "❄️", "snow");
    case 77:
      return make("Snow grains", "🌨️", "snow");
    case 80:
      return make("Slight showers", "🌦️", "rain");
    case 81:
      return make("Showers", "🌧️", "rain");
    case 82:
      return make("Violent showers", "⛈️", "storm");
    case 85:
    case 86:
      return make("Snow showers", "🌨️", "snow");
    case 95:
      return make("Thunderstorm", "⛈️", "storm");
    case 96:
    case 99:
      return make("Thunderstorm, hail", "⛈️", "storm");
    default:
      return make("Unknown", "❔", "cloud");
  }
}

/** Compass label (16-point) from meteorological degrees. */
export function windCompass(deg: number | null | undefined): string {
  if (deg == null) return "—";
  const points = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
  ];
  return points[Math.round(deg / 22.5) % 16];
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function shortHour(iso: string): string {
  // Open-Meteo local ISO looks like "2026-07-13T14:00"
  const t = iso.slice(11, 16);
  return t || iso;
}

/** Group consecutive flagged hours into readable risk windows. */
function collapseRisks(
  hours: WeatherHour[],
  predicate: (h: WeatherHour) => boolean,
  kind: WeatherRiskKind,
  label: string,
  peakOf: (h: WeatherHour) => number | null,
  peakFmt: (v: number) => string,
): WeatherRisk[] {
  const out: WeatherRisk[] = [];
  let start = -1;
  let peak = -Infinity;
  const flush = (endIdx: number) => {
    if (start < 0) return;
    const from = shortHour(hours[start].time);
    const to = shortHour(hours[endIdx].time);
    out.push({
      kind,
      label,
      window: from === to ? from : `${from}–${to}`,
      peak: peak > -Infinity ? peakFmt(peak) : "",
    });
    start = -1;
    peak = -Infinity;
  };
  hours.forEach((h, i) => {
    if (predicate(h)) {
      if (start < 0) start = i;
      const p = peakOf(h);
      if (p != null && p > peak) peak = p;
    } else {
      flush(i - 1);
    }
  });
  flush(hours.length - 1);
  return out;
}

type OpenMeteoForecast = {
  timezone?: string;
  current?: Record<string, number | string>;
  hourly?: Record<string, (number | string)[]>;
};

/**
 * Fetch a structured hourly meteogram from Open-Meteo. Covers the next ~24h from
 * the current hour with the variables an EOC watch officer actually scans:
 * condition, temperature, precipitation probability/amount, wind, gusts,
 * direction, and visibility. Derives peak stats and simple severe-weather risk
 * flags tuned for flood/storm operations.
 */
export async function getWeatherForecast(
  lat: number,
  lng: number,
  hoursAhead = 24,
): Promise<WeatherForecast> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lng));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m",
  );
  url.searchParams.set(
    "hourly",
    "temperature_2m,apparent_temperature,relative_humidity_2m,precipitation_probability,precipitation,weather_code,visibility,wind_speed_10m,wind_gusts_10m,wind_direction_10m",
  );
  url.searchParams.set("wind_speed_unit", "ms");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "2");

  const res = await fetch(url.toString(), { next: { revalidate: 900 } });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }
  const j = (await res.json()) as OpenMeteoForecast;

  const H = j.hourly ?? {};
  const times = (H.time as string[] | undefined) ?? [];
  const at = (key: string, i: number) => num(H[key]?.[i]);

  const allHours: WeatherHour[] = times.map((time, i) => ({
    time,
    temperatureC: at("temperature_2m", i),
    apparentC: at("apparent_temperature", i),
    humidity: at("relative_humidity_2m", i),
    condition: decodeWmo(at("weather_code", i)),
    precipProbability: at("precipitation_probability", i),
    precipMm: at("precipitation", i),
    windMs: at("wind_speed_10m", i),
    windGustMs: at("wind_gusts_10m", i),
    windDir: at("wind_direction_10m", i),
    visibilityKm: (() => {
      const v = at("visibility", i);
      return v == null ? null : Math.round((v / 1000) * 10) / 10;
    })(),
  }));

  // Slice from the current hour forward.
  const nowMs = Date.now();
  let startIdx = allHours.findIndex((h) => new Date(h.time).getTime() >= nowMs - 60 * 60 * 1000);
  if (startIdx < 0) startIdx = 0;
  const hours = allHours.slice(startIdx, startIdx + hoursAhead);

  const cur = j.current ?? {};
  const current: WeatherHour | null = cur.time
    ? {
        time: String(cur.time),
        temperatureC: num(cur.temperature_2m),
        apparentC: num(cur.apparent_temperature),
        humidity: num(cur.relative_humidity_2m),
        condition: decodeWmo(num(cur.weather_code)),
        precipProbability: null,
        precipMm: num(cur.precipitation),
        windMs: num(cur.wind_speed_10m),
        windGustMs: num(cur.wind_gusts_10m),
        windDir: num(cur.wind_direction_10m),
        visibilityKm: null,
      }
    : null;

  const collect = (key: keyof WeatherHour) =>
    hours.map((h) => h[key]).filter((v): v is number => typeof v === "number");
  const max = (arr: number[]) => (arr.length ? Math.max(...arr) : null);
  const min = (arr: number[]) => (arr.length ? Math.min(...arr) : null);
  const sum = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) * 10) / 10 : null;

  const risks: WeatherRisk[] = [
    ...collapseRisks(
      hours,
      (h) => (h.precipMm ?? 0) >= 4 || h.condition.severity === "storm",
      "rain",
      "Heavy rain",
      (h) => h.precipMm,
      (v) => `${v.toFixed(1)} mm/h`,
    ),
    ...collapseRisks(
      hours,
      (h) => (h.windGustMs ?? 0) >= 14,
      "wind",
      "Strong wind gusts",
      (h) => h.windGustMs,
      (v) => `${Math.round(v)} m/s`,
    ),
    ...collapseRisks(
      hours,
      (h) => h.condition.severity === "storm",
      "storm",
      "Thunderstorm",
      (h) => h.windGustMs,
      (v) => `${Math.round(v)} m/s gusts`,
    ),
    ...collapseRisks(
      hours,
      (h) => h.visibilityKm != null && h.visibilityKm < 1,
      "visibility",
      "Low visibility",
      (h) => h.visibilityKm,
      (v) => `${v.toFixed(1)} km`,
    ),
  ];

  return {
    provider: "Open-Meteo",
    latitude: lat,
    longitude: lng,
    timezone: j.timezone ?? "auto",
    asOf: new Date().toISOString(),
    current,
    hours,
    peaks: {
      maxTempC: max(collect("temperatureC")),
      minTempC: min(collect("temperatureC")),
      maxWindGustMs: max(collect("windGustMs")),
      totalPrecipMm: sum(collect("precipMm")),
      maxPrecipProbability: max(collect("precipProbability")),
    },
    risks,
    disclaimer: WEATHER_DISCLAIMER,
  };
}
