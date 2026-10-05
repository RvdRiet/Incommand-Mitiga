/**
 * Client helper to archive a file to an incident's blob storage via the API.
 * Best-effort: returns null (never throws) when offline or not signed in (401),
 * so callers can always attempt it without breaking the local download flow.
 */
export async function uploadIncidentBlob(
  incidentId: string,
  file: File,
  kind: string,
): Promise<{ id: string; url: string; size: number } | null> {
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", kind);
    const res = await fetch(`/api/incidents/${incidentId}/blobs`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) return null;
    return (await res.json()) as { id: string; url: string; size: number };
  } catch {
    return null;
  }
}
