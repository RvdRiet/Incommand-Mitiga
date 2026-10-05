/**
 * Minimal structured logging + error capture. Emits JSON in production (ready for
 * log aggregation) and readable lines in dev. `captureError` additionally forwards
 * to Sentry when SENTRY_DSN is set AND @sentry/node is installed — otherwise it
 * just structured-logs, so there's no hard dependency.
 */
type Level = "info" | "warn" | "error";
type Ctx = Record<string, unknown>;

const pretty = process.env.NODE_ENV !== "production";

function emit(level: Level, msg: string, ctx?: Ctx) {
  const line = pretty
    ? `[${level}] ${msg}${ctx ? " " + JSON.stringify(ctx) : ""}`
    : JSON.stringify({ level, msg, time: new Date().toISOString(), ...ctx });
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(line);
}

export const log = {
  info: (msg: string, ctx?: Ctx) => emit("info", msg, ctx),
  warn: (msg: string, ctx?: Ctx) => emit("warn", msg, ctx),
  error: (msg: string, ctx?: Ctx) => emit("error", msg, ctx),
};

type SentryLike = {
  init: (o: Record<string, unknown>) => void;
  captureException: (e: unknown, o?: Record<string, unknown>) => void;
};
let sentry: SentryLike | null = null;
let sentryResolved = false;

async function getSentry(): Promise<SentryLike | null> {
  if (sentryResolved) return sentry;
  sentryResolved = true;
  if (!process.env.SENTRY_DSN) return null;
  try {
    // Non-static specifier so the bundler treats @sentry/node as OPTIONAL —
    // absent unless the operator installs it and sets SENTRY_DSN.
    const pkg = "@sentry/node";
    const mod = (await import(/* webpackIgnore: true */ /* @vite-ignore */ pkg)) as unknown as SentryLike;
    mod.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0, environment: process.env.NODE_ENV });
    sentry = mod;
  } catch {
    log.warn("SENTRY_DSN is set but @sentry/node is not installed — `npm i @sentry/node` to enable it.");
  }
  return sentry;
}

/** Log an error (structured) and forward to Sentry when configured. */
export async function captureError(err: unknown, ctx?: Ctx): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  log.error(message, { ...ctx, stack: err instanceof Error ? err.stack : undefined });
  const s = await getSentry();
  s?.captureException(err, ctx ? { extra: ctx } : undefined);
}
