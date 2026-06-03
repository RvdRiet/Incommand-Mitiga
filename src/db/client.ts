import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema";

export type MitigaDb = PostgresJsDatabase<typeof schema>;

declare global {
  var __mitigaPostgres: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!globalThis.__mitigaPostgres) {
    globalThis.__mitigaPostgres = postgres(url, { prepare: false, max: 10 });
  }
  return globalThis.__mitigaPostgres;
}

export function getDb(): MitigaDb {
  return drizzle(getSql(), { schema });
}

/** Run work inside a transaction with tenant RLS context (see docs/DATA-MODEL-RLS.md). */
export async function withTenant<T>(tenantId: string, fn: (db: MitigaDb) => Promise<T>): Promise<T> {
  const client = getSql();
  const out = await client.begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${tenantId}::text, true)`;
    const db = drizzle(tx as unknown as Sql, { schema });
    return fn(db);
  });
  return out as T;
}

export { schema, sql };
