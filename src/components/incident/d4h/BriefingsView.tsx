"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";

import { useEventId, useIncidentStore } from "@/context/EventContext";
import { buildSitrep } from "@/lib/incident/sitrep";

export function BriefingsView() {
  const eventId = useEventId();
  const { data: session } = useSession();
  const state = useIncidentStore((s) => s);
  const addLog = useIncidentStore((s) => s.addLog);
  const sitrep = useMemo(() => buildSitrep(state), [state]);
  const [copied, setCopied] = useState(false);
  const [archivedNote, setArchivedNote] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(sitrep);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = async () => {
    const blob = new Blob([sitrep], { type: "text/plain" });
    // Clean slug + calendar date, matching the Library/audit exports (was a raw epoch ms).
    const safe =
      state.situation.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() ||
      "incident";
    const filename = `SITREP-${safe}-${new Date().toISOString().slice(0, 10)}.txt`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);

    if (session) {
      const { uploadIncidentBlob } = await import("@/lib/storage/upload-client");
      const res = await uploadIncidentBlob(
        eventId,
        new File([blob], filename, { type: "text/plain" }),
        "sitrep_txt",
      );
      if (res) {
        setArchivedNote(true);
        setTimeout(() => setArchivedNote(false), 3000);
      }
    }
  };

  const publishToLog = () => {
    addLog("SITREP published to incident log", ["sitrep", "briefing"], "Planning");
  };

  return (
    <section className="ic-briefings">
      <header className="ic-d4h-header">
        <h2 className="ic-d4h-header__title">Briefings & SITREP</h2>
        <p className="ic-d4h-header__sub">
          Situation reports — auto-generated from Situation, tasks, logs, and
          operational data. Export for IAP packages or agency distribution.
        </p>
        <div className="ic-d4h-header__row">
          <button type="button" className="ic-btn-add" onClick={copy}>
            {copied ? "Copied" : "Copy to clipboard"}
          </button>
          <button type="button" className="ic-btn-secondary" onClick={download}>
            {archivedNote ? "Downloaded · archived" : "Download .txt"}
          </button>
          <button type="button" className="ic-btn-secondary" onClick={publishToLog}>
            Log SITREP issued
          </button>
        </div>
      </header>
      <pre className="ic-sitrep-preview">{sitrep}</pre>
    </section>
  );
}
