"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useEventId, useIncidentStore } from "@/context/EventContext";
import { moduleHref } from "@/lib/navigation/modules";
import type { DistressEvent } from "@/lib/incident/types";
import { IconAlertTriangle } from "@/components/ui/icons";

const KIND_LABEL: Record<DistressEvent["kind"], string> = {
  sos: "SOS",
  man_down: "MAN-DOWN",
  duress: "DURESS",
};

function since(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}

/**
 * Global takeover banner for active/unresolved distress signals. Rendered on every
 * module so an SOS is impossible to miss. Acknowledge closes the loop back to the
 * unit; Locate jumps to the map (the unit's live COP marker).
 */
export function DistressBanner() {
  const eventId = useEventId();
  const distressEvents = useIncidentStore((s) => s.distressEvents);
  const acknowledge = useIncidentStore((s) => s.acknowledgeDistress);
  const resolve = useIncidentStore((s) => s.resolveDistress);

  const openEvents = useMemo(
    () =>
      distressEvents
        .filter((d) => d.status === "active" || d.status === "acknowledged")
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "active" ? -1 : 1;
          return b.triggeredAt.localeCompare(a.triggeredAt);
        }),
    [distressEvents],
  );

  if (openEvents.length === 0) return null;

  const primary = openEvents[0];
  const extra = openEvents.length - 1;

  return (
    <div
      className={`ic-distress-banner ic-distress-banner--${primary.status}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="ic-distress-banner__main">
        <span className="ic-distress-banner__icon" aria-hidden>
          <IconAlertTriangle size={22} />
        </span>
        <div className="ic-distress-banner__text">
          <strong>
            {KIND_LABEL[primary.kind]} — {primary.unitCallsign}
          </strong>
          <span className="ic-distress-banner__detail">
            {primary.status === "acknowledged"
              ? `Acknowledged${primary.ackBy ? ` by ${primary.ackBy}` : ""}`
              : `Triggered ${since(primary.triggeredAt)}`}
            {primary.lat != null && primary.lng != null
              ? ` · ${primary.lat.toFixed(4)}, ${primary.lng.toFixed(4)}`
              : " · no position"}
            {primary.signalLost ? " · signal lost" : ""}
          </span>
        </div>
        {extra > 0 ? (
          <span className="ic-distress-banner__more">+{extra} more</span>
        ) : null}
      </div>

      <div className="ic-distress-banner__actions">
        {primary.status === "active" ? (
          <button
            type="button"
            className="ic-distress-banner__btn ic-distress-banner__btn--ack"
            onClick={() => acknowledge(primary.id, "Operator")}
          >
            Acknowledge
          </button>
        ) : null}
        <Link
          href={moduleHref(eventId, "map")}
          className="ic-distress-banner__btn ic-distress-banner__btn--locate"
        >
          Locate on map
        </Link>
        <button
          type="button"
          className="ic-distress-banner__btn"
          onClick={() => resolve(primary.id, "resolved")}
        >
          Resolve
        </button>
        <button
          type="button"
          className="ic-distress-banner__btn ic-distress-banner__btn--false"
          onClick={() => resolve(primary.id, "false_alarm")}
        >
          False alarm
        </button>
      </div>
    </div>
  );
}
