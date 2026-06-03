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
