"use client";

import { useEffect, useRef, useState } from "react";

import { useEventId, useIncidentStore } from "@/context/EventContext";
import { captureIncidentMapImage } from "@/lib/maps/map-capture";
import { emptyFeatureCollection } from "@/lib/maps/geo-utils";
import { uploadIncidentBlob } from "@/lib/storage/upload-client";

import type { FemaLayoutProps } from "./layouts/ICS201";

const BLOCK_LABEL =
  "4. Map/Sketch (include sketch, showing the total area of operations, the incident site/area, impacted and threatened areas, overflight results, trajectories, impacted shorelines, or other graphics depicting situational status and resource assignment):";

/** Decode a base64 data URL to a Blob WITHOUT fetch() — the app's CSP blocks
 *  fetching data: URLs, so `fetch(dataUrl)` is not available here. */
function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const meta = dataUrl.slice(0, comma);
  const mime = /data:(.*?)(;base64)?$/.exec(meta)?.[1] || "image/jpeg";
  const bin = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/**
 * ICS-201 Block 4 — a satellite map of the incident location with a single red
 * incident pin (no other layers). The image is captured off-screen as a PNG and
 * stored in the form field `mapSketchImage`, so it round-trips with the saved record
 * AND renders into the DOM-cloned PDF (a GL canvas would not). An optional notes box
 * keeps the FEMA "sketch" annotations. Auto-generates once when a location is set.
 *
 * The captured ~160KB JPEG is uploaded to blob storage and `mapSketchImage` holds a
 * SAME-ORIGIN blob URL rather than a base64 data URL — otherwise several ICS-201s would
 * bloat the incident state past the localStorage quota. (Legacy data-URL values still
 * render; offline captures fall back to the data URL until the next online refresh.)
 */
export function IcsMapSketch({ fields, setField }: FemaLayoutProps) {
  const eventId = useEventId();
  const situation = useIncidentStore((s) => s.situation);
  const hasLocation = situation.lat != null && situation.lng != null;
  const image = fields.mapSketchImage ?? "";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triedAuto = useRef(false);

  const capture = async () => {
    if (situation.lat == null || situation.lng == null) return;
    setBusy(true);
    setError(null);
    try {
      const img = await captureIncidentMapImage({
        center: [situation.lng, situation.lat],
        incidentMarker: [situation.lng, situation.lat],
        overlays: emptyFeatureCollection(), // just the incident pin — no other layers
        layer: "satellite",
        zoom: 15,
        // Compact JPEG — this is persisted in the form content (localStorage + synced
        // to the DB), so it must stay small; a PNG would blow the storage quota.
        width: 768,
        height: 432,
        format: "jpeg",
        quality: 0.72,
      });
      if (!img) {
        setError("Could not capture the map — satellite imagery needs an internet connection.");
        return;
      }
      // Offload the image to blob storage and keep only a short same-origin URL in the
      // form content, so the incident state stays small. Fall back to the data URL if
      // the upload can't complete (offline / not signed in) so the capture isn't lost.
      try {
        const file = new File([dataUrlToBlob(img)], `ics201-map-${Date.now()}.jpg`, {
          type: "image/jpeg",
        });
        const up = await uploadIncidentBlob(eventId, file, "ics_form_map");
        setField("mapSketchImage", up ? `/api/incidents/${eventId}/blobs/${up.id}` : img);
      } catch {
        setField("mapSketchImage", img);
      }
    } catch {
      setError("Could not capture the map.");
    } finally {
      setBusy(false);
    }
  };

  // Generate it automatically the first time the form is opened with a location set.
  useEffect(() => {
    if (triedAuto.current || image || !hasLocation) return;
    triedAuto.current = true;
    void capture();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasLocation, image]);

  return (
    <div className="fema-ics-form__field ic-mapsketch">
      <span>{BLOCK_LABEL}</span>

      {!hasLocation ? (
        <div className="ic-mapsketch__empty">
          Set the incident location on the <strong>Situation</strong> tab (or the Map) to generate
          the satellite map here.
        </div>
      ) : image ? (
        <figure className="ic-mapsketch__frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image}
            alt="Satellite map of the incident location marked with a red incident pin"
            className="ic-mapsketch__img"
          />
          <button
            type="button"
            className="ic-mapsketch__refresh"
            onClick={() => void capture()}
            disabled={busy}
          >
            {busy ? "Refreshing…" : "↻ Refresh map"}
          </button>
        </figure>
      ) : (
        <div className="ic-mapsketch__empty">
          <button type="button" className="ic-btn-add" onClick={() => void capture()} disabled={busy}>
            {busy ? "Generating satellite map…" : "Generate satellite map"}
          </button>
          {error ? <p className="ic-mapsketch__error">{error}</p> : null}
        </div>
      )}

      <textarea
        className="fema-ics-form__box ic-mapsketch__notes"
        value={fields.mapSketch ?? ""}
        onChange={(e) => setField("mapSketch", e.target.value)}
        placeholder="Sketch notes / annotations (optional)"
        aria-label="Map sketch notes"
      />
    </div>
  );
}
