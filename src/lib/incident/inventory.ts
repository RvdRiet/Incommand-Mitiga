import type {
  InventoryCategory,
  InventoryCondition,
  InventoryItem,
} from "./types";

export const DEFAULT_INVENTORY_REMINDER_DAYS = 30;

const DAY = 86_400_000;

/** Stock level relative to the item's par/reorder point. */
export type StockStatus = "in_stock" | "low" | "out";

/**
 * A time-based check (expiry or maintenance). `none` = not applicable to this item,
 * `ok` = comfortably in date, `due` = inside the reminder window, `overdue` = past.
 */
export type CheckStatus = "ok" | "due" | "overdue" | "none";

/** Visual tone shared by every inventory chip so colours stay consistent. */
export type ChipTone = "ok" | "warn" | "bad" | "muted";

export const INVENTORY_CATEGORIES: { value: InventoryCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "ppe", label: "PPE" },
  { value: "fire", label: "Fire safety" },
  { value: "first_aid", label: "First aid" },
  { value: "medical", label: "Medical" },
  { value: "rescue", label: "Rescue gear" },
  { value: "relief", label: "Relief supplies" },
  { value: "other", label: "Other" },
];

export const CATEGORY_LABEL: Record<InventoryCategory, string> = Object.fromEntries(
  INVENTORY_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<InventoryCategory, string>;

export const CONDITIONS: { value: InventoryCondition; label: string }[] = [
  { value: "serviceable", label: "Serviceable" },
  { value: "monitor", label: "Monitor" },
  { value: "unserviceable", label: "Unserviceable" },
];

export const CONDITION_LABEL: Record<InventoryCondition, string> = {
  serviceable: "Serviceable",
  monitor: "Monitor",
  unserviceable: "Unserviceable",
};

export const CONDITION_TONE: Record<InventoryCondition, ChipTone> = {
  serviceable: "ok",
  monitor: "warn",
  unserviceable: "bad",
};

export const STOCK_LABEL: Record<StockStatus, string> = {
  in_stock: "In stock",
  low: "Low",
  out: "Out of stock",
};

export const STOCK_TONE: Record<StockStatus, ChipTone> = {
  in_stock: "ok",
  low: "warn",
  out: "bad",
};

/** Classify quantity on hand against the reorder/par level. */
export function stockStatus(item: Pick<InventoryItem, "quantity" | "minQuantity">): StockStatus {
  if (item.quantity <= 0) return "out";
  if (item.minQuantity > 0 && item.quantity <= item.minQuantity) return "low";
  return "in_stock";
}

export type CheckResult = {
  status: CheckStatus;
  /** Whole days until the deadline (negative if past; null when N/A). */
  daysLeft: number | null;
  /** ISO date the next check falls due (maintenance only; null otherwise). */
  nextDue: string | null;
};

/** Classify an expiry date against the reminder window. */
export function expiryStatus(
  expiryDate: string,
  now: number,
  reminderDays: number,
): CheckResult {
  if (!expiryDate) return { status: "none", daysLeft: null, nextDue: null };
  const t = Date.parse(expiryDate);
  if (!Number.isFinite(t)) return { status: "none", daysLeft: null, nextDue: null };
  const daysLeft = Math.floor((t - now) / DAY);
  if (daysLeft < 0) return { status: "overdue", daysLeft, nextDue: expiryDate };
  if (daysLeft <= reminderDays) return { status: "due", daysLeft, nextDue: expiryDate };
  return { status: "ok", daysLeft, nextDue: expiryDate };
}

/**
 * Classify maintenance from the last inspection + interval. If an interval is set but
 * no inspection is on record, the item is treated as overdue (it has never been checked).
 */
export function maintenanceStatus(
  item: Pick<InventoryItem, "lastInspection" | "inspectionIntervalDays">,
  now: number,
  reminderDays: number,
): CheckResult {
  if (!item.inspectionIntervalDays || item.inspectionIntervalDays <= 0) {
    return { status: "none", daysLeft: null, nextDue: null };
  }
  const base = item.lastInspection ? Date.parse(item.lastInspection) : NaN;
  if (!Number.isFinite(base)) {
    return { status: "overdue", daysLeft: null, nextDue: null };
  }
  const nextT = base + item.inspectionIntervalDays * DAY;
  const daysLeft = Math.floor((nextT - now) / DAY);
  const nextDue = new Date(nextT).toISOString().slice(0, 10);
  if (daysLeft < 0) return { status: "overdue", daysLeft, nextDue };
  if (daysLeft <= reminderDays) return { status: "due", daysLeft, nextDue };
  return { status: "ok", daysLeft, nextDue };
}

export const CHECK_TONE: Record<CheckStatus, ChipTone> = {
  ok: "ok",
  due: "warn",
  overdue: "bad",
  none: "muted",
};

export const EXPIRY_LABEL: Record<CheckStatus, string> = {
  ok: "In date",
  due: "Expiring",
  overdue: "Expired",
  none: "—",
};

export const MAINT_LABEL: Record<CheckStatus, string> = {
  ok: "Up to date",
  due: "Due soon",
  overdue: "Overdue",
  none: "—",
};

/** Human-friendly day phrasing, e.g. "in 12 days" / "3 days ago" / "today". */
export function daysLabel(daysLeft: number | null): string {
  if (daysLeft == null) return "";
  if (daysLeft === 0) return "today";
  if (daysLeft > 0) return `in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const ago = -daysLeft;
  return `${ago} day${ago === 1 ? "" : "s"} ago`;
}

export type ItemAssessment = {
  stock: StockStatus;
  expiry: CheckResult;
  maintenance: CheckResult;
  /** True when anything needs a manager's attention (low/out, expiring/expired, due/overdue, unserviceable). */
  needsAttention: boolean;
};

/** One-pass assessment of every dimension for an item. */
export function assessItem(
  item: InventoryItem,
  now: number,
  reminderDays: number,
): ItemAssessment {
  const stock = stockStatus(item);
  const expiry = expiryStatus(item.expiryDate, now, reminderDays);
  const maintenance = maintenanceStatus(item, now, reminderDays);
  const needsAttention =
    stock !== "in_stock" ||
    expiry.status === "due" ||
    expiry.status === "overdue" ||
    maintenance.status === "due" ||
    maintenance.status === "overdue" ||
    item.condition !== "serviceable";
  return { stock, expiry, maintenance, needsAttention };
}

export type InventorySummary = {
  total: number;
  low: number;
  out: number;
  /** low + out */
  lowOut: number;
  expiring: number;
  expired: number;
  /** expiring + expired */
  expiryFlagged: number;
  maintDue: number;
  maintOverdue: number;
  /** maintDue + maintOverdue */
  maintFlagged: number;
  /** items needing any attention */
  attention: number;
};

/** Aggregate counts across the whole register — shared by Analytics and the dashboard widget. */
export function inventorySummary(
  items: InventoryItem[],
  now: number,
  reminderDays: number,
): InventorySummary {
  let low = 0;
  let out = 0;
  let expiring = 0;
  let expired = 0;
  let maintDue = 0;
  let maintOverdue = 0;
  let attention = 0;
  for (const it of items) {
    const a = assessItem(it, now, reminderDays);
    if (a.stock === "low") low += 1;
    else if (a.stock === "out") out += 1;
    if (a.expiry.status === "due") expiring += 1;
    else if (a.expiry.status === "overdue") expired += 1;
    if (a.maintenance.status === "due") maintDue += 1;
    else if (a.maintenance.status === "overdue") maintOverdue += 1;
    if (a.needsAttention) attention += 1;
  }
  return {
    total: items.length,
    low,
    out,
    lowOut: low + out,
    expiring,
    expired,
    expiryFlagged: expiring + expired,
    maintDue,
    maintOverdue,
    maintFlagged: maintDue + maintOverdue,
    attention,
  };
}

/**
 * Build a ready-to-send supply alert from every flagged item, grouped by issue.
 * Returns null when nothing needs attention. Used by the Notifications module to
 * pre-fill a mass alert (the operator still picks recipients and sends it).
 */
export function buildSupplyAlert(
  items: InventoryItem[],
  now: number,
  reminderDays: number,
): { subject: string; body: string; count: number } | null {
  const low: string[] = [];
  const expiring: string[] = [];
  const service: string[] = [];
  let count = 0;
  for (const it of items) {
    const a = assessItem(it, now, reminderDays);
    if (!a.needsAttention) continue;
    count += 1;
    const name = it.name || "Unnamed item";
    const loc = it.location ? ` (${it.location})` : "";
    if (a.stock === "out") low.push(`${name} — out of stock${loc}`);
    else if (a.stock === "low")
      low.push(`${name} — ${it.quantity} ${it.unit || "units"}, below par ${it.minQuantity}${loc}`);
    if (a.expiry.status === "overdue")
      expiring.push(`${name} — expired ${daysLabel(a.expiry.daysLeft)}`);
    else if (a.expiry.status === "due")
      expiring.push(`${name} — expires ${daysLabel(a.expiry.daysLeft)}`);
    if (a.maintenance.status === "overdue")
      service.push(
        a.maintenance.daysLeft != null
          ? `${name} — service overdue ${daysLabel(a.maintenance.daysLeft)}`
          : `${name} — never inspected`,
      );
    else if (a.maintenance.status === "due")
      service.push(`${name} — service due ${daysLabel(a.maintenance.daysLeft)}`);
  }
  if (count === 0) return null;

  const lines: string[] = ["The following inventory items need attention:"];
  const section = (title: string, arr: string[]) => {
    if (arr.length) lines.push("", title, ...arr.map((s) => `- ${s}`));
  };
  section("LOW / OUT OF STOCK", low);
  section("EXPIRING / EXPIRED", expiring);
  section("SERVICE DUE / OVERDUE", service);
  lines.push("", "Please replenish or action these before the next operational period.");

  return {
    subject: `Supply alert — ${count} inventory item${count === 1 ? "" : "s"} flagged`,
    body: lines.join("\n"),
    count,
  };
}
