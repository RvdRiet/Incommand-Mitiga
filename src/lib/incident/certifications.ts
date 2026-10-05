/** valid = in date · expiring = within the renewal window · expired = past its expiry ·
 *  no-expiry = no expiry date set (treated as always valid). */
export type CertStatus = "valid" | "expiring" | "expired" | "no-expiry";

export const DEFAULT_CERT_REMINDER_DAYS = 30;

const DAY = 86_400_000;

export type CertStatusResult = {
  status: CertStatus;
  /** Whole days until expiry (negative if already expired; null if no expiry). */
  daysLeft: number | null;
};

/** Classify a certification by its expiry date against the renewal-reminder window. */
export function certStatus(
  expiresAt: string,
  now: number = Date.now(),
  reminderDays: number = DEFAULT_CERT_REMINDER_DAYS,
): CertStatusResult {
  if (!expiresAt) return { status: "no-expiry", daysLeft: null };
  const t = Date.parse(expiresAt);
  if (!Number.isFinite(t)) return { status: "no-expiry", daysLeft: null };
  const daysLeft = Math.floor((t - now) / DAY);
  if (daysLeft < 0) return { status: "expired", daysLeft };
  if (daysLeft <= reminderDays) return { status: "expiring", daysLeft };
  return { status: "valid", daysLeft };
}

export const CERT_STATUS_LABEL: Record<CertStatus, string> = {
  valid: "Valid",
  expiring: "Expiring",
  expired: "Expired",
  "no-expiry": "No expiry",
};

/** Human-friendly expiry phrasing, e.g. "in 12 days" / "3 days ago" / "today". */
export function expiryLabel(daysLeft: number | null): string {
  if (daysLeft == null) return "—";
  if (daysLeft === 0) return "today";
  if (daysLeft > 0) return `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const ago = -daysLeft;
  return `${ago} day${ago === 1 ? "" : "s"} ago`;
}
