import Redis from "ioredis";

/**
 * Shared Redis client. Used for cross-pod state that must NOT live in memory
 * (login rate-limiting). Under Kubernetes each pod is separate, so in-process
 * counters would be trivially bypassed by hitting a different replica.
 *
 * REDIS_URL unset → returns null and callers degrade gracefully (fail-open with
 * a warning). Set REDIS_URL in every environment where limits must be enforced.
 */
declare global {
  var __mitigaRedis: Redis | null | undefined;
}

let warned = false;

export function getRedis(): Redis | null {
  if (globalThis.__mitigaRedis !== undefined) return globalThis.__mitigaRedis;

  const url = process.env.REDIS_URL;
  if (!url) {
    if (!warned) {
      console.warn("[redis] REDIS_URL not set — distributed rate-limiting disabled.");
      warned = true;
    }
    globalThis.__mitigaRedis = null;
    return null;
  }

  const client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: false,
  });
  client.on("error", (e) => console.warn("[redis] error:", e.message));
  globalThis.__mitigaRedis = client;
  return client;
}
