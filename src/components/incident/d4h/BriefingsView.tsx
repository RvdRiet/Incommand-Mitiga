"use client";

import { useMemo, useState } from "react";

import { useIncidentStore } from "@/context/EventContext";
import { buildSitrep } from "@/lib/incident/sitrep";

export function BriefingsView() {
  const state = useIncidentStore((s) => s);
  const addLog = useIncidentStore((s) => s.addLog);
  const sitrep = useMemo(() => buildSitrep(state), [state]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(sitrep);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([sitrep], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SITREP-${state.situation.name.replace(/\s+/g, "-")}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const publishToLog = () => {
    addLog("SITREP published to incident log", ["sitrep", "briefing"], "Planning");
  };

  return (
    <section className="ic-briefings">
      <header className="ic-d4h-header">
        <h2 className="ic-d4h-header__title">Briefings & SITREP</h2>
        <p className="ic-d4h-header__sub">
          D4H-style situation reports — auto-generated from Situation, tasks, logs, and
          operational data. Export for IAP packages or agency distribution.
        </p>
        <div className="ic-d4h-header__row">
          <button type="button" className="ic-btn-add" onClick={copy}>
            {copied ? "Copied" : "Copy to clipboard"}
          </button>
          <button type="button" className="ic-btn-secondary" onClick={download}>
            Download .txt
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
