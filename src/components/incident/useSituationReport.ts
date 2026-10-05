"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";

import { useEventId, useIncidentStore } from "@/context/EventContext";
import {
  buildSituationReport,
  situationReportToPdf,
  type SitrepWeather,
} from "@/lib/incident/situation-report";
import { triggerDownload } from "@/lib/incident/custom-form-export";
import { captureIncidentMapImage } from "@/lib/maps/map-capture";
import { buildCopFeatures, COP_LAYERS } from "@/lib/maps/cop-features";
import { mergeFeatureCollections } from "@/lib/maps/geo-utils";
import { annotationsToFeatureCollection } from "@/lib/maps/map-annotations";
import { windCompass } from "@/lib/weather";

/**
 * One-click "export the whole situation as a PDF". Assembles the report from live
 * incident state, pulls current weather, snapshots the map (COP + named zones),
 * builds the SITREP PDF, downloads it, and archives it to server storage.
 * Shared by the Library and the dashboard button.
 */
export function useSituationReport() {
  const eventId = useEventId();
  const { data: session } = useSession();
  const state = useIncidentStore((s) => s);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(
    async (preparedBy: string) => {
      setBusy(true);
      setNotice("Generating situation report…");
      try {
        const sitrep = buildSituationReport(state, { preparedBy: preparedBy || "Operator" });

        // Current weather (best-effort).
        let weather: SitrepWeather = null;
        const { lat, lng } = state.situation;
        if (lat != null && lng != null) {
          try {
            const res = await fetch(`/api/weather/forecast?lat=${lat}&lng=${lng}`);
            if (res.ok) {
              const f = await res.json();
              const c = f.current;
              if (c) {
                weather = {
                  tempC: c.temperatureC ?? null,
                  feelsLikeC: c.apparentC ?? null,
                  conditionLabel: c.condition?.label ?? "",
                  windMs: c.windMs ?? null,
                  windDirLabel: windCompass(c.windDir),
                  humidity: c.humidity ?? null,
                  risks: Array.isArray(f.risks) ? f.risks.map((r: { label: string; window: string }) => `${r.label} ${r.window}`) : [],
                };
              }
            }
          } catch {
            /* weather is optional */
          }
        }

        // Map snapshot (COP + named zones + incident pin).
        let mapImage: string | null = null;
        if (lat != null && lng != null) {
          setNotice("Snapshotting the map…");
          const cop = buildCopFeatures(
            {
              fieldUnits: state.fieldUnits,
              personnel: state.personnel,
              shelters: state.shelters,
              damages: state.damages,
              roadDamages: state.roadDamages,
              resourceRequests: state.resourceRequests,
            },
            new Set(COP_LAYERS.map((l) => l.key)),
          );
          const overlays = mergeFeatureCollections(cop, annotationsToFeatureCollection(state.mapAnnotations));
          mapImage = await captureIncidentMapImage({
            center: [lng, lat],
            overlays,
            incidentMarker: [lng, lat],
          });
        }

        setNotice("Building PDF…");
        const { filename, blob } = situationReportToPdf(sitrep, { mapImage, weather });
        triggerDownload(blob, filename);

        let archived = false;
        if (session) {
          try {
            const { uploadIncidentBlob } = await import("@/lib/storage/upload-client");
            const res = await uploadIncidentBlob(
              eventId,
              new File([blob], filename, { type: "application/pdf" }),
              "ics_pdf",
            );
            archived = res !== null;
          } catch {
            /* archive is best-effort */
          }
        }
        setNotice(
          `Downloaded ${filename}${archived ? " · archived to server" : ""}${mapImage ? "" : " (map image unavailable)"}`,
        );
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "Export failed");
      } finally {
        setBusy(false);
      }
    },
    [state, eventId, session],
  );

  return { run, busy, notice, setNotice };
}
