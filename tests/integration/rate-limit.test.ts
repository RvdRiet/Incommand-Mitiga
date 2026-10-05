import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { rateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { getRedis } from "@/lib/redis";

/** Redis-backed login rate limiting. Requires REDIS_URL; skipped otherwise. */
describe.skipIf(!process.env.REDIS_URL)("rate limiting", () => {
  // Wait for the connection so the first calls don't fail-open during warmup.
  beforeAll(async () => {
    const r = getRedis();
    if (r && r.status !== "ready") {
      await new Promise<void>((res) => {
        const t = setTimeout(res, 3000);
        r.once("ready", () => {
          clearTimeout(t);
          res();
        });
      });
    }
  });

  afterAll(async () => {
    await getRedis()?.quit();
  });

  it("allows up to the limit, then blocks with a retry-after", async () => {
    const key = `test:${randomUUID()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(key, 3, 60));

    expect(results.slice(0, 3).every((r) => r.allowed)).toBe(true);
    expect(results[3].allowed).toBe(false);
    expect(results[3].retryAfterSec).toBeGreaterThan(0);

    await resetRateLimit(key);
    const afterReset = await rateLimit(key, 3, 60);
    expect(afterReset.allowed).toBe(true);
    await resetRateLimit(key);
  });
});
