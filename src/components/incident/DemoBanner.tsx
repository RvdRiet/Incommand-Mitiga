"use client";

import { useEffect, useState } from "react";

import { useEventId } from "@/context/EventContext";

/**
 * Shown only when the current incident was launched as a public sandbox (the
 * /demo route writes a `mitiga-demo-<id>` marker). Gives prospects a persistent,
 * dismissible path back to sales. Reads client-side only to avoid SSR mismatch,
 * and is fully self-contained so it can't affect any real incident.
 */
const WALKTHROUGH_HREF = "mailto:hello@incommand.app?subject=InCommand%20walkthrough";

export function DemoBanner() {
  const eventId = useEventId();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    try {
      const isDemo = localStorage.getItem(`mitiga-demo-${eventId}`) === "1";
      const dismissed = sessionStorage.getItem(`mitiga-demo-dismissed-${eventId}`) === "1";
      setShow(isDemo && !dismissed);
    } catch {
      setShow(false);
    }
  }, [eventId]);

  if (!show) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(`mitiga-demo-dismissed-${eventId}`, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div className="ic-demo-banner" role="note" aria-label="Demo sandbox">
      <style>{`
        .ic-demo-banner{
          display:flex;align-items:center;gap:12px;flex-wrap:wrap;
          padding:9px 16px;font-size:13.5px;color:#334155;
          background:linear-gradient(90deg,rgba(13,148,136,.12),rgba(13,148,136,.04));
          border-bottom:1px solid rgba(13,148,136,.30);
        }
        .ic-demo-banner__pill{
          font-family:ui-monospace,"Cascadia Code",Consolas,monospace;font-size:10.5px;
          letter-spacing:.12em;font-weight:700;color:#fff;background:#0d9488;
          padding:3px 9px;border-radius:6px;flex:none;
        }
        .ic-demo-banner__msg{flex:1;min-width:180px;line-height:1.4;}
        .ic-demo-banner__msg strong{color:#0f172a;font-weight:650;}
        .ic-demo-banner__cta{
          display:inline-flex;align-items:center;gap:7px;flex:none;
          background:#e11d48;color:#fff;font-weight:600;font-size:13px;
          padding:8px 15px;border-radius:9px;text-decoration:none;
          box-shadow:0 6px 16px -8px rgba(225,29,72,.7);transition:filter .18s ease,transform .18s ease;
        }
        .ic-demo-banner__cta:hover{filter:brightness(1.07);transform:translateY(-1px);}
        .ic-demo-banner__x{
          flex:none;border:none;background:none;color:#64748b;cursor:pointer;
          font-size:20px;line-height:1;padding:2px 6px;border-radius:6px;
        }
        .ic-demo-banner__x:hover{color:#0f172a;background:rgba(15,23,42,.06);}
        @media (max-width:560px){
          .ic-demo-banner__cta{order:3;}
          .ic-demo-banner__x{order:2;margin-left:auto;}
        }
      `}</style>
      <span className="ic-demo-banner__pill">DEMO</span>
      <span className="ic-demo-banner__msg">
        <strong>You&rsquo;re exploring a sandbox.</strong> A live flood scenario with sample
        staffing, ICS forms &amp; mapping — changes here won&rsquo;t affect any real incident.
      </span>
      <a className="ic-demo-banner__cta" href={WALKTHROUGH_HREF}>
        Like what you see? Book a walkthrough
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </a>
      <button type="button" className="ic-demo-banner__x" onClick={dismiss} aria-label="Dismiss demo banner">×</button>
    </div>
  );
}
