/**
 * Address → coordinates (and reverse). Google Geocoding is used when
 * GOOGLE_MAPS_API_KEY is set — its coverage of SA (townships, rural, informal
 * addresses, plus-codes) and its throughput far exceed Nominatim's ~1 req/s cap.
 * Nominatim (OpenStreetMap) is the free fallback when no key is set or Google
 * returns nothing / errors, so geocoding always works, keyed or not. The resolved
 * coordinates are then used on the OSM/MapTiler basemap and OSRM routing exactly
 * as before — only the address lookup changes providers.
 */

type GeocodeHit = { lat: number; lng: number; label: string };

function googleKey(): string | undefined {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || undefined;
}

/** Optional ISO country bias for Google geocoding (e.g. "za"). */
function geocodeRegion(): string | undefined {
  return process.env.GEOCODE_REGION?.trim() || undefined;
}

// ---- Google Geocoding ----

async function geocodeSearchGoogle(query: string, key: string): Promise<GeocodeHit[]> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", query);
  url.searchParams.set("key", key);
  const region = geocodeRegion();
  if (region) url.searchParams.set("region", region);

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    status?: string;
    results?: {
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
    }[];
  };
  if (data.status && data.status !== "OK") return [];

  return (data.results ?? [])
    .map((r) => ({
      lat: Number(r.geometry?.location?.lat),
      lng: Number(r.geometry?.location?.lng),
      label: r.formatted_address ?? "",
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng))
    .slice(0, 6);
}

async function reverseGeocodeCityGoogle(
  lat: number,
  lng: number,
  key: string,
): Promise<string | null> {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${lat},${lng}`);
  url.searchParams.set("key", key);
  url.searchParams.set("result_type", "locality|postal_town|administrative_area_level_2");

  const res = await fetch(url.toString(), { next: { revalidate: 3600 } });
  if (!res.ok) return null;
  const data = (await res.json()) as {
    status?: string;
    results?: { address_components?: { long_name: string; types: string[] }[] }[];
  };
  if (data.status && data.status !== "OK") return null;

  const components = data.results?.[0]?.address_components ?? [];
  const pick = (type: string) =>
    components.find((c) => c.types.includes(type))?.long_name ?? null;
  return (
    pick("locality") ??
    pick("postal_town") ??
    pick("administrative_area_level_2") ??
    pick("administrative_area_level_1") ??
    null
  );
}

// ---- Nominatim (OpenStreetMap) fallback ----

async function geocodeSearchNominatim(query: string): Promise<GeocodeHit[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "6");
  url.searchParams.set("addressdetails", "0");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "InCommand/1.0 (incident geocoding)",
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];

  const rows = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return rows
    .map((r) => ({
      lat: Number(r.lat),
      lng: Number(r.lon),
      label: r.display_name,
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

async function reverseGeocodeCityNominatim(lat: number, lng: number): Promise<string | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "10");

  const res = await fetch(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "InCommand/1.0 (incident geocoding)",
    },
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as {
    address?: {
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      county?: string;
      state?: string;
    };
  };

  const a = data.address;
  if (!a) return null;
  return a.city ?? a.town ?? a.municipality ?? a.village ?? a.county ?? null;
}

// ---- Public API: Google-preferred, Nominatim fallback ----

/** Forward geocode — Google when keyed (falls back to Nominatim), else Nominatim. */
export async function geocodeSearch(query: string): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const key = googleKey();
  if (key) {
    try {
      const hits = await geocodeSearchGoogle(q, key);
      if (hits.length > 0) return hits;
    } catch {
      /* fall through to Nominatim */
    }
  }
  return geocodeSearchNominatim(q);
}

/** Reverse geocode to a city/town name — Google when keyed (falls back), else Nominatim. */
export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
  const key = googleKey();
  if (key) {
    try {
      const city = await reverseGeocodeCityGoogle(lat, lng, key);
      if (city) return city;
    } catch {
      /* fall through to Nominatim */
    }
  }
  return reverseGeocodeCityNominatim(lat, lng);
}
