"use client";

import { useMemo, useState, type ReactNode } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { useNow } from "@/lib/devices/presence";
import {
  assessItem,
  CHECK_TONE,
  CONDITIONS,
  CONDITION_LABEL,
  CONDITION_TONE,
  daysLabel,
  DEFAULT_INVENTORY_REMINDER_DAYS,
  EXPIRY_LABEL,
  INVENTORY_CATEGORIES,
  MAINT_LABEL,
  STOCK_LABEL,
  STOCK_TONE,
  type ChipTone,
} from "@/lib/incident/inventory";
import type { InventoryCategory, InventoryCondition } from "@/lib/incident/types";
import { IconAlertTriangle } from "@/components/ui/icons";

import { RowDelete } from "../shared";
import { EmptyHint } from "../ui";

function Chip({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return <span className={`ic-inv-chip ic-inv-chip--${tone}`}>{children}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="ic-inv-f">
      <span className="ic-inv-f__lab">{label}</span>
      {children}
    </label>
  );
}

const CATEGORY_OPTIONS = INVENTORY_CATEGORIES;

export function InventoryView() {
  const inventory = useIncidentStore((s) => s.inventory);
  const addInventoryItem = useIncidentStore((s) => s.addInventoryItem);
  const updateInventoryItem = useIncidentStore((s) => s.updateInventoryItem);
  const removeInventoryItem = useIncidentStore((s) => s.removeInventoryItem);
  const settings = useIncidentStore((s) => s.settings);
  const updateSettings = useIncidentStore((s) => s.updateSettings);
  const now = useNow(60000);

  const reminderDays = settings.inventoryReminderDays ?? DEFAULT_INVENTORY_REMINDER_DAYS;

  const [category, setCategory] = useState<"all" | InventoryCategory>("all");
  const [query, setQuery] = useState("");

  const enriched = useMemo(
    () => inventory.map((item) => ({ item, ...assessItem(item, now, reminderDays) })),
    [inventory, now, reminderDays],
  );

  const summary = useMemo(() => {
    let lowOut = 0;
    let expiry = 0;
    let maint = 0;
    for (const r of enriched) {
      if (r.stock !== "in_stock") lowOut += 1;
      if (r.expiry.status === "due" || r.expiry.status === "overdue") expiry += 1;
      if (r.maintenance.status === "due" || r.maintenance.status === "overdue") maint += 1;
    }
    return { total: enriched.length, lowOut, expiry, maint };
  }, [enriched]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enriched
      .filter((r) => category === "all" || r.item.category === category)
      .filter(
        (r) =>
          !q ||
          `${r.item.name} ${r.item.location} ${r.item.serial}`.toLowerCase().includes(q),
      )
      .sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention));
  }, [enriched, category, query]);

  const num = (v: string) => (v.trim() === "" ? 0 : Number(v));

  const severity = (r: (typeof enriched)[number]): "crit" | "warn" | "" => {
    const bad =
      r.stock === "out" ||
      r.expiry.status === "overdue" ||
      r.maintenance.status === "overdue" ||
      r.item.condition === "unserviceable";
    if (bad) return "crit";
    if (r.needsAttention) return "warn";
    return "";
  };

  const reason = (r: (typeof enriched)[number]): string => {
    const bits: string[] = [];
    if (r.stock === "out") bits.push("Out of stock");
    else if (r.stock === "low") bits.push("Low stock");
    if (r.expiry.status === "overdue") bits.push(`Expired ${daysLabel(r.expiry.daysLeft)}`);
    else if (r.expiry.status === "due") bits.push(`Expires ${daysLabel(r.expiry.daysLeft)}`);
    if (r.maintenance.status === "overdue")
      bits.push(
        r.maintenance.daysLeft == null
          ? "Never inspected"
          : `Service overdue ${daysLabel(r.maintenance.daysLeft)}`,
      );
    else if (r.maintenance.status === "due")
      bits.push(`Service due ${daysLabel(r.maintenance.daysLeft)}`);
    if (r.item.condition === "unserviceable") bits.push("Unserviceable");
    else if (r.item.condition === "monitor") bits.push("Monitor condition");
    return bits.join(" · ");
  };

  return (
    <section className="ic-roster-mod">
      <header className="ic-roster-mod__head">
        <div>
          <h2 className="ic-page-heading" style={{ padding: 0, border: 0 }}>
            Inventory &amp; equipment
          </h2>
          <p className="ic-roster-mod__sub">
            Every stock line and piece of gear — relief and first‑aid supplies plus special
            equipment like fire extinguishers and PPE. Set par levels, expiry dates and service
            intervals and anything running low, lapsing or due for a check is flagged here.
          </p>
        </div>
        <button type="button" className="ic-btn-add" onClick={() => addInventoryItem()}>
          + Add item
        </button>
      </header>

      {/* Summary + reminder window */}
      <div className="ic-inv-summary">
        <div className="ic-inv-summary__stat">
          <span className="ic-inv-summary__num">{summary.total}</span>
          <span className="ic-inv-summary__lab">Line items</span>
        </div>
        <div className={`ic-inv-summary__stat${summary.lowOut ? " ic-inv-summary__stat--warn" : ""}`}>
          <span className="ic-inv-summary__num">{summary.lowOut}</span>
          <span className="ic-inv-summary__lab">Low / out of stock</span>
        </div>
        <div className={`ic-inv-summary__stat${summary.expiry ? " ic-inv-summary__stat--warn" : ""}`}>
          <span className="ic-inv-summary__num">{summary.expiry}</span>
          <span className="ic-inv-summary__lab">Expiring / expired</span>
        </div>
        <div className={`ic-inv-summary__stat${summary.maint ? " ic-inv-summary__stat--warn" : ""}`}>
          <span className="ic-inv-summary__num">{summary.maint}</span>
          <span className="ic-inv-summary__lab">Service due / overdue</span>
        </div>
        <label className="ic-inv-reminder">
          <span className="ic-inv-f__lab">Flag within</span>
          <span className="ic-inv-reminder__ctl">
            <input
              type="number"
              min={1}
              max={365}
              value={reminderDays}
              onChange={(e) => updateSettings({ inventoryReminderDays: Number(e.target.value) })}
            />
            days
          </span>
        </label>
      </div>

      {/* Controls */}
      <div className="ic-inv-controls">
        <label className="ic-filter-panel__label">
          <span>Category</span>
          <select
            className="ic-filter-panel__select"
            value={category}
            onChange={(e) => setCategory(e.target.value as "all" | InventoryCategory)}
          >
            <option value="all">All categories</option>
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <input
          type="search"
          className="ic-inv-search"
          placeholder="Search name, location or asset tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="ic-inv-count">
          {rows.length} of {inventory.length} shown
        </span>
      </div>

      {/* Register — one card per item */}
      {inventory.length === 0 ? (
        <EmptyHint>
          No inventory yet. Use “+ Add item” to log stock and gear — set a par level to catch low
          stock, an expiry date for perishables, and a service interval for equipment that needs
          periodic inspection.
        </EmptyHint>
      ) : rows.length === 0 ? (
        <EmptyHint>No items match this filter.</EmptyHint>
      ) : (
        <div className="ic-inv-grid">
          {rows.map((r) => {
            const it = r.item;
            const sev = severity(r);
            return (
              <article
                key={it.id}
                className={`ic-inv-card${sev ? ` ic-inv-card--${sev}` : ""}`}
              >
                <header className="ic-inv-card__head">
                  <input
                    className="ic-inv-card__name"
                    value={it.name}
                    placeholder="Item name"
                    onChange={(e) => updateInventoryItem(it.id, { name: e.target.value })}
                  />
                  <RowDelete onClick={() => removeInventoryItem(it.id)} />
                </header>

                <div className="ic-inv-card__chips">
                  <Chip tone={STOCK_TONE[r.stock]}>
                    {STOCK_LABEL[r.stock]}
                    <span className="ic-inv-chip__sub">
                      {" "}
                      · {it.quantity} {it.unit || "units"}
                    </span>
                  </Chip>
                  <Chip tone={CONDITION_TONE[it.condition]}>{CONDITION_LABEL[it.condition]}</Chip>
                  {r.expiry.status !== "none" ? (
                    <Chip tone={CHECK_TONE[r.expiry.status]}>
                      {EXPIRY_LABEL[r.expiry.status]}
                      {(r.expiry.status === "due" || r.expiry.status === "overdue") &&
                      r.expiry.daysLeft != null ? (
                        <span className="ic-inv-chip__sub"> · {daysLabel(r.expiry.daysLeft)}</span>
                      ) : null}
                    </Chip>
                  ) : null}
                  {r.maintenance.status !== "none" ? (
                    <Chip tone={CHECK_TONE[r.maintenance.status]}>
                      {MAINT_LABEL[r.maintenance.status]}
                      {(r.maintenance.status === "due" || r.maintenance.status === "overdue") &&
                      r.maintenance.daysLeft != null ? (
                        <span className="ic-inv-chip__sub">
                          {" "}
                          · {daysLabel(r.maintenance.daysLeft)}
                        </span>
                      ) : null}
                    </Chip>
                  ) : null}
                </div>

                {sev ? (
                  <p className={`ic-inv-card__reason ic-inv-card__reason--${sev}`}>
                    <IconAlertTriangle size={12} /> {reason(r)}
                  </p>
                ) : null}

                <div className="ic-inv-card__grid">
                  <Field label="Category">
                    <select
                      value={it.category}
                      onChange={(e) =>
                        updateInventoryItem(it.id, { category: e.target.value as InventoryCategory })
                      }
                    >
                      {CATEGORY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="On hand">
                    <span className="ic-inv-f__row">
                      <input
                        type="number"
                        className="ic-inv-f__num"
                        value={it.quantity}
                        onChange={(e) =>
                          updateInventoryItem(it.id, { quantity: num(e.target.value) })
                        }
                      />
                      <input
                        type="text"
                        value={it.unit}
                        placeholder="unit"
                        onChange={(e) => updateInventoryItem(it.id, { unit: e.target.value })}
                      />
                    </span>
                  </Field>
                  <Field label="Par / reorder">
                    <input
                      type="number"
                      className="ic-inv-f__num"
                      value={it.minQuantity}
                      onChange={(e) =>
                        updateInventoryItem(it.id, { minQuantity: num(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Condition">
                    <select
                      value={it.condition}
                      onChange={(e) =>
                        updateInventoryItem(it.id, {
                          condition: e.target.value as InventoryCondition,
                        })
                      }
                    >
                      {CONDITIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Location">
                    <input
                      type="text"
                      value={it.location}
                      placeholder="Store / vehicle"
                      onChange={(e) => updateInventoryItem(it.id, { location: e.target.value })}
                    />
                  </Field>
                  <Field label="Serial / asset tag">
                    <input
                      type="text"
                      value={it.serial}
                      placeholder="—"
                      onChange={(e) => updateInventoryItem(it.id, { serial: e.target.value })}
                    />
                  </Field>
                  <Field label="Expiry date">
                    <input
                      type="date"
                      value={it.expiryDate}
                      onChange={(e) => updateInventoryItem(it.id, { expiryDate: e.target.value })}
                    />
                  </Field>
                  <Field label="Service interval">
                    <span className="ic-inv-f__row">
                      <input
                        type="number"
                        className="ic-inv-f__num"
                        value={it.inspectionIntervalDays}
                        onChange={(e) =>
                          updateInventoryItem(it.id, { inspectionIntervalDays: num(e.target.value) })
                        }
                      />
                      <span className="ic-inv-f__suffix">days</span>
                    </span>
                  </Field>
                  <Field label="Last service">
                    <input
                      type="date"
                      value={it.lastInspection}
                      onChange={(e) =>
                        updateInventoryItem(it.id, { lastInspection: e.target.value })
                      }
                    />
                  </Field>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
