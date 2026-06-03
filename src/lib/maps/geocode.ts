/** Forward geocode via Nominatim (OpenStreetMap). */
export async function geocodeSearch(
  query: string,
): Promise<{ lat: number; lng: number; label: string }[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
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

/** Reverse geocode to a city/town name suitable for Census lookup. */
export async function reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
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
