import { NextResponse } from "next/server";

import { getSql } from "@/db/client";
import { rateLimit } from "@/lib/auth/rate-limit";

/**
 * District picker for the login page. Prefix-search over tenants via the
 * SECURITY DEFINER `search_tenants` helper (needs ≥2 chars, capped at 10 rows),
 * so it can't be used to dump the whole customer list. IP rate-limited.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ tenants: [] });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rl = await rateLimit(`tenant-search:${ip}`, 60, 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const sql = getSql();
  const rows = await sql<{ id: string; name: string; slug: string }[]>`
    select id, name, slug from search_tenants(${q}::text)
  `;
  return NextResponse.json({ tenants: rows });
}
