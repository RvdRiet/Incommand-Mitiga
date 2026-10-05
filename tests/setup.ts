import { readFileSync } from "node:fs";

// Load .env.local for tests (vitest doesn't do this automatically), matching the
// smoke test. Integration tests need DATABASE_URL (app role), DATABASE_ADMIN_URL
// (admin) and REDIS_URL; unit tests need nothing.
try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* rely on ambient env */
}
