/**
 * Verify planned routes against a fresh OSRM request (free, no API key).
 * Google Maps: opens comparison URLs only — Google driving API is not used.
 *
 * Run: npx tsx scripts/verify-routes.ts
 */
import { planRouteVariants } from "../src/lib/maps/route-engine";
import {
  formatVerificationReport,
  verifyAllVariants,
} from "../src/lib/maps/route-verify";

const CASES = [
  {
    name: "Short urban (Sandton → Pretoria CBD approx)",
    origin: { lat: -26.1076, lng: 28.0567, label: "Sandton" },
    destination: { lat: -25.7479, lng: 28.2293, label: "Pretoria" },
  },
  {
    name: "Long haul (Johannesburg → Durban approx)",
    origin: { lat: -26.2041, lng: 28.0473, label: "Johannesburg" },
    destination: { lat: -29.8587, lng: 31.0218, label: "Durban" },
  },
] as const;

async function main() {
  for (const c of CASES) {
    console.log("\n" + "=".repeat(60));
    console.log(c.name);
    console.log("=".repeat(60));

    const variants = await planRouteVariants({
      origin: c.origin,
      destination: c.destination,
    });

    if (variants.length === 0) {
      console.log("No routes returned.\n");
      continue;
    }

    console.log(`Planned ${variants.length} variant(s).\n`);

    const rows = await verifyAllVariants(variants, c.origin, c.destination);
    console.log(formatVerificationReport(c.origin, c.destination, rows));
  }

  console.log(
    "Manual Google check: open each Google Maps URL above in a browser and compare km/time.",
  );
  console.log("Typical OSM vs Google difference in SA: roughly 0–15% on long trips.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
