import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type MitigaDb = PostgresJsDatabase<typeof schema>;

declare global {
  var __mitigaPostgres: ReturnType<typeof postgres> | undefined;
  var __mitigaShutdownHooked: boolean | undefined;
}

export function getSql() {
  // DATABASE_URL must point at the least-privilege app role (mitiga_app), NOT a
  // superuser — RLS is only enforced for non-superuser / NOBYPASSRLS roles, so
  // a superuser connection silently defeats tenant isolation. Migrations + seed
  // use DATABASE_ADMIN_URL instead. See migrations/0004_app_role.sql.
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalThis.__mitigaPostgres) {
    // `prepare: false` keeps us compatible with PgBouncer / managed transaction
    // pooling. Each pod keeps a SMALL pool (DB_POOL_MAX, default 10) — behind a
    // transaction pooler set it to ~5 so N replicas don't exhaust Postgres.
    globalThis.__mitigaPostgres = postgres(url, {
      prepare: false,
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idle_timeout: Number(process.env.DB_IDLE_TIMEOUT ?? 30), // seconds
      max_lifetime: Number(process.env.DB_MAX_LIFETIME ?? 60 * 30), // recycle conns
      connect_timeout: Number(process.env.DB_CONNECT_TIMEOUT ?? 10),
    });
    registerShutdown();
  }
  return globalThis.__mitigaPostgres;
}

/** Drain the pool on SIGTERM/SIGINT so rolling deploys don't leak connections. */
function registerShutdown() {
  if (globalThis.__mitigaShutdownHooked) return;
  globalThis.__mitigaShutdownHooked = true;
  const close = async () => {
    try {
      await globalThis.__mitigaPostgres?.end({ timeout: 5 });
    } catch {
      /* best-effort */
    }
  };
  process.once("SIGTERM", close);
  process.once("SIGINT", close);
}

/** Lightweight liveness/readiness check: is Postgres reachable? */
export async function pingDb(): Promise<boolean> {
  try {
    await getSql()`select 1`;
    return true;
  } catch {
    return false;
  }
}

export function getDb(): MitigaDb {
  return drizzle(getSql(), { schema });
}

/** Run work inside a transaction with tenant RLS context (see docs/DATA-MODEL-RLS.md). */
export async function withTenant<T>(tenantId: string, fn: (db: MitigaDb) => Promise<T>): Promise<T> {
  // Use Drizzle's own transaction so the callback gets a real query builder; setting
  // app.tenant_id transaction-locally scopes RLS for every statement inside it.
  // (Wrapping a raw postgres.js `tx` in drizzle() breaks — the driver needs the client.)
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}::text, true)`);
    return fn(tx as unknown as MitigaDb);
  });
}

export { schema, sql };
