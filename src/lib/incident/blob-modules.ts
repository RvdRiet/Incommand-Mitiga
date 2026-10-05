/**
 * Maps a stored blob's `kind` to the module that owns it, so listing/downloading
 * archived files respects the same per-module visibility as the rest of the app.
 * Unknown kinds fall back to the Library (where the Server archive is surfaced).
 */
const KIND_MODULE: Record<string, string> = {
  ics_pdf: "forms",
  sitrep_txt: "briefings",
  audit_txt: "logs",
  incident_json: "library",
  photo: "library",
  video: "library",
  attachment: "library",
};

export function blobKindModule(kind: string | null | undefined): string {
  return (kind && KIND_MODULE[kind]) || "library";
}
