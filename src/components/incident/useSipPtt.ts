"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SIP push-to-talk against the fleet's Asterisk (RFC-006). The browser can't speak native
 * SIP, so this registers over SIP-over-WebSocket (WSS) using SIP.js's SimpleUser and does PTT
 * by muting/unmuting the mic while joined to a channel's conference.
 *
 * ⚠️ Feature-flagged and UNTESTED against a live Asterisk (needs a WSS transport + operator
 * endpoint added server-side — see docs/rfc/RFC-006). Inert unless NEXT_PUBLIC_SIP_WSS_URL is set.
 *
 * NOTE: credentials via NEXT_PUBLIC_* are for local testing only — in production the operator's
 * SIP secret must be minted per-session server-side, never shipped in the client bundle.
 */
const WSS_URL = process.env.NEXT_PUBLIC_SIP_WSS_URL;
const DOMAIN = process.env.NEXT_PUBLIC_SIP_DOMAIN;
const USER = process.env.NEXT_PUBLIC_SIP_USER;
const PASSWORD = process.env.NEXT_PUBLIC_SIP_PASSWORD;

export type SipState = "disabled" | "connecting" | "registered" | "failed";

/** Minimal surface of SIP.js Web.SimpleUser we use (avoids SSR type/runtime coupling). */
interface SipUser {
  connect(): Promise<void>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  disconnect(): Promise<void>;
  call(destination: string): Promise<void>;
  hangup(): Promise<void>;
  mute(): void;
  unmute(): void;
}

export type SipPtt = {
  state: SipState;
  /** Channel whose conference the operator is currently joined to. */
  activeChannelId: string | null;
  talking: boolean;
  /** Press-to-talk on a channel: joins its conference if needed, then unmutes. */
  pressTalk: (channelId: string, roomUri: string) => Promise<void>;
  /** Release: mutes the mic (stays joined so the operator keeps hearing the net). */
  releaseTalk: () => void;
};

export const SIP_ENABLED = Boolean(WSS_URL && DOMAIN && USER);

export function useSipPtt(): SipPtt {
  const [state, setState] = useState<SipState>(SIP_ENABLED ? "connecting" : "disabled");
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [talking, setTalking] = useState(false);
  const suRef = useRef<SipUser | null>(null);

  useEffect(() => {
    if (!SIP_ENABLED) return;
    let cancelled = false;
    let su: SipUser | null = null;
    const audio = document.createElement("audio");
    audio.autoplay = true;

    (async () => {
      try {
        const { Web } = await import("sip.js");
        const simple = new Web.SimpleUser(WSS_URL as string, {
          aor: `sip:${USER}@${DOMAIN}`,
          media: { remote: { audio } },
          userAgentOptions: { authorizationUsername: USER, authorizationPassword: PASSWORD },
        });
        su = simple as unknown as SipUser;
        suRef.current = su;
        await su.connect();
        await su.register();
        if (!cancelled) setState("registered");
      } catch {
        if (!cancelled) setState("failed");
      }
    })();

    return () => {
      cancelled = true;
      const s = suRef.current;
      suRef.current = null;
      s?.unregister().catch(() => {});
      s?.disconnect().catch(() => {});
    };
  }, []);

  const pressTalk = async (channelId: string, roomUri: string) => {
    const su = suRef.current;
    if (!su || state !== "registered") return;
    try {
      if (activeChannelId !== channelId) {
        if (activeChannelId) await su.hangup().catch(() => {});
        await su.call(`sip:${roomUri}@${DOMAIN}`);
        setActiveChannelId(channelId);
      }
      su.unmute();
      setTalking(true);
    } catch {
      /* swallow — UI reflects state */
    }
  };

  const releaseTalk = () => {
    const su = suRef.current;
    if (!su) return;
    su.mute();
    setTalking(false);
  };

  return { state, activeChannelId, talking, pressTalk, releaseTalk };
}
