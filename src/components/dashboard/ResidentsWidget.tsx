"use client";

import Link from "next/link";

import { useEventId } from "@/context/EventContext";
import type { ResidentArea } from "@/lib/incident/types";
import { sortResidentAreas } from "@/lib/incident/residents";
import { formatPopulation } from "@/lib/sa-population";
import { moduleHref } from "@/lib/navigation/modules";

import { MetricGroup } from "./MetricGroup";

export function ResidentsWidget({
  areas,
  individualsCount,
}: {
  areas: ResidentArea[];
  individualsCount: number;
}) {
  const eventId = useEventId();
  const sorted = sortResidentAreas(areas, "city_asc").slice(0, 6);
  const censusTotal = areas.reduce((s, a) => s + a.censusPopulation, 0);
  const affectedTotal = areas.reduce((s, a) => s + a.estimatedAffected, 0);

  return (
    <div className="ic-residents-widget">
      <MetricGroup
        items={[
          { value: areas.length, label: "Cities / areas" },
          { value: individualsCount, label: "Shelter registrations" },
        ]}
      />
      {censusTotal > 0 ? (
        <p className="ic-residents-widget__hint">
          Census 2022 baseline: {formatPopulation(censusTotal)} across {areas.length} area
          {areas.length === 1 ? "" : "s"}
          {affectedTotal > 0 ? ` · ${formatPopulation(affectedTotal)} est. affected` : ""}
        </p>
      ) : null}
      {sorted.length > 0 ? (
        <ul className="ic-residents-widget__list">
          {sorted.map((a) => (
            <li key={a.id}>
              <span className="ic-residents-widget__city">{a.city || a.municipality}</span>
              <span className="ic-residents-widget__pop">
                {a.censusPopulation > 0 ? formatPopulation(a.censusPopulation) : "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ic-residents-widget__hint">Add cities on the Residents module for Census estimates.</p>
      )}
      <Link href={moduleHref(eventId, "residents")} className="ic-residents-widget__link">
        Residents module →
      </Link>
    </div>
  );
}
