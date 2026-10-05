"use client";

import { GridLayout, LiveKitRoom, ParticipantTile, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useEffect, useState } from "react";

/**
 * Live bodycam video for a channel (RFC-007). Fetches a subscribe-only LiveKit token from
 * /api/livekit/token, connects to the channel's room, and shows a tile per publishing unit.
 *
 * ⚠️ Feature-flagged and UNTESTED against a live LiveKit server + a publishing bodycam.
 * Renders a graceful placeholder if LiveKit isn't configured/reachable.
 */
function CameraGrid() {
  const tracks = useTracks([Track.Source.Camera], { onlySubscribed: true });
  if (tracks.length === 0) {
    return <span className="ic-channel-card__video-empty">Waiting for a unit to go live…</span>;
  }
  return (
    <GridLayout tracks={tracks} className="ic-channel-video__grid">
      <ParticipantTile />
    </GridLayout>
  );
}

export function ChannelVideo({ room }: { room: string }) {
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setConn(null);
    setError(null);
    fetch(`/api/livekit/token?room=${encodeURIComponent(room)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { token: string; url: string }) => {
        if (!cancelled) setConn({ token: d.token, url: d.url });
      })
      .catch(() => {
        if (!cancelled) setError("Live video unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [room]);

  if (error) {
    return <span className="ic-channel-card__video-empty">{error}</span>;
  }
  if (!conn) {
    return <span className="ic-channel-card__video-empty">Connecting video…</span>;
  }
  return (
    <LiveKitRoom
      serverUrl={conn.url}
      token={conn.token}
      connect
      audio={false}
      video={false}
      className="ic-channel-video"
    >
      <CameraGrid />
    </LiveKitRoom>
  );
}
