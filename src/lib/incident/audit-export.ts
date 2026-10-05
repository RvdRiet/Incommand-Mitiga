import type { AuditEntry } from "./types";

/** Render the full audit trail as plain text, oldest entry first. */
export function buildAuditTrailText(audit: AuditEntry[], incidentName?: string): string {
  const sorted = [...audit].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lines: string[] = [
    `AUDIT TRAIL${incidentName ? ` — ${incidentName}` : ""}`,
    `Generated: ${new Date().toLocaleString()}`,
    `Entries: ${audit.length}`,
    "=".repeat(60),
  ];
  for (const e of sorted) {
    lines.push(`[${new Date(e.createdAt).toLocaleString()}] ${e.actor}: ${e.action}`);
  }
  return lines.join("\r\n");
}

/**
 * Build the current audit trail, trigger a .txt download, and return the filename +
 * the generated Blob so the caller can also archive it to blob storage.
 */
export function downloadAuditTrailTxt(
  audit: AuditEntry[],
  incidentName?: string,
): { filename: string; blob: Blob } {
  const text = buildAuditTrailText(audit, incidentName);
  const safe = (incidentName || "incident").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  const filename = `audit-trail-${safe}-${new Date().toISOString().slice(0, 10)}.txt`;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { filename, blob };
}
