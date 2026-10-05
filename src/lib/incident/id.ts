export function newId() {
  return crypto.randomUUID();
}

export function nowIso() {
  return new Date().toISOString();
}

/**
 * Local wall-clock "now" as a `<input type=datetime-local>` value (YYYY-MM-DDTHH:mm).
 * Use this for fields the UI reads back as local time (incident start date, the elapsed
 * timer) — `nowIso().slice(0,16)` stores UTC, which shows/counts off by the tz offset.
 */
export function nowLocalInput() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
