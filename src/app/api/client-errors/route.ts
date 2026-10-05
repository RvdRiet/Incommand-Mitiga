import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { clientIp, enforceRateLimit } from "@/lib/auth/api-rate-limit";

/**
 * Sink for client-side error reports (ErrorBoundary + global handlers). Logs each
 * one structurally to stderr as `[client-error] {json}` so it surfaces in prod logs
 * / any aggregator — the app is otherwise blind to browser-side failures. Kept
 * unauthenticated (errors happen on the login page too) but IP-rate-limited and
 * size-capped so it can't be used as a log-spam vector. To forward to a real
 * service (Sentry/Datadog) later, add the call in reportToSink().
 */
const MAX_BYTES = 16 * 1024;

type Incoming = {
  message?: string;
  stack?: string;
  source?: string;
  context?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
  at?: string;
};

function reportToSink(entry: Record<string, unknown>) {
  // Structured single-line log — greppable, aggregator-friendly.
  console.error(`[client-error] ${JSON.stringify(entry)}`);
}

export async function POST(req: Request) {
  const limited = await enforceRateLimit(`clienterr:${clientIp(req)}`, 60, 60);
  if (limited) return limited;

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return new NextResponse(null, { status: 413 });

  const raw = await req.text();
  if (raw.length > MAX_BYTES) return new NextResponse(null, { status: 413 });

  let body: Incoming | null;
  try {
    body = raw ? (JSON.parse(raw) as Incoming) : null;
  } catch {
    body = null;
  }
  if (!body || typeof body.message !== "string") {
    return new NextResponse(null, { status: 400 });
  }

  // Attach who/where when a session exists (errors can be unauthenticated).
  let tenantId: string | undefined;
  let userId: string | undefined;
  try {
    const session = await auth();
    tenantId = session?.tenantId;
    userId = session?.userId;
  } catch {
    /* no session — fine */
  }

  reportToSink({
    at: body.at ?? new Date().toISOString(),
    source: String(body.source ?? "unknown").slice(0, 32),
    message: body.message.slice(0, 1000),
    context: typeof body.context === "string" ? body.context.slice(0, 200) : undefined,
    url: typeof body.url === "string" ? body.url.slice(0, 500) : undefined,
    stack: typeof body.stack === "string" ? body.stack.slice(0, 4000) : undefined,
    componentStack:
      typeof body.componentStack === "string" ? body.componentStack.slice(0, 4000) : undefined,
    userAgent: typeof body.userAgent === "string" ? body.userAgent.slice(0, 300) : undefined,
    tenantId,
    userId,
    ip: clientIp(req),
  });

  return new NextResponse(null, { status: 204 });
}
