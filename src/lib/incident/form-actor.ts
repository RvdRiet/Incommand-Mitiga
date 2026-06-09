const STORAGE_KEY = "mitiga-form-actor-name";

/** Local display name when no signed-in user is available. */
export function getStoredFormActorName(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function setStoredFormActorName(name: string) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function resolveFormActor(options: {
  sessionName?: string | null;
  sessionEmail?: string | null;
  storedName?: string;
}): { name: string; email: string | null } {
  const name =
    options.sessionName?.trim() ||
    options.storedName?.trim() ||
    options.sessionEmail?.trim() ||
    "Operator";
  const email = options.sessionEmail?.trim() || null;
  return { name, email };
}
