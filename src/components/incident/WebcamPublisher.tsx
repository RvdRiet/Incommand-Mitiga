"use client";

import { LiveKitRoom, useLocalParticipant, useTracks, VideoTrack } from "@livekit/components-react";
import { Track } from "livekit-client";
import { useEffect, useRef, useState } from "react";

/**
 * Publishes THIS browser's webcam/mic into a channel's LiveKit room (RFC-007), so live video
 * can be demoed end-to-end without a physical bodycam — click "Test publish", grant camera
 * permission, and the channel's ChannelVideo (any tab watching that room) shows this tile live.
 *
 * Distinct from the bodycam publish path (HMAC-authenticated, /api/livekit/publish-token):
 * this uses the operator's own session (/api/livekit/demo-publish-token) since the browser
 * itself is the identity being granted, not a remote device.
 */
function LocalPreview() {
  const { localParticipant } = useLocalParticipant();
  const tracks = useTracks([Track.Source.Camera]).filter(
    (t) => t.participant.identity === localParticipant.identity,
  );
  if (tracks.length === 0) {
    return <span className="ic-channel-card__video-empty">Starting camera…</span>;
  }
  return <VideoTrack trackRef={tracks[0]} className="ic-webcam-publisher__preview" />;
}

export function WebcamPublisher({ room, onStop }: { room: string; onStop: () => void }) {
  const [conn, setConn] = useState<{ token: string; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Unique per tab/mount so one operator can open several tabs and each becomes its
  // own tile in the room's grid (LiveKit merges duplicate identities into one).
  const tagRef = useRef<string>(
    (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8),
  );

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ room, tag: tagRef.current });
    fetch(`/api/livekit/demo-publish-token?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { token: string; url: string }) => {
        if (!cancelled) setConn({ token: d.token, url: d.url });
      })
      .catch(() => {
        if (!cancelled) setError("Could not start test publish");
      });
    return () => {
      cancelled = true;
    };
  }, [room]);

  if (error) {
    return (
      <div className="ic-webcam-publisher">
        <span className="ic-channel-card__video-empty">{error}</span>
        <button type="button" className="ic-toolbar-text-btn" onClick={onStop}>
          Close
        </button>
      </div>
    );
  }
  if (!conn) {
    return <span className="ic-channel-card__video-empty">Requesting camera…</span>;
  }
  return (
    <LiveKitRoom
      serverUrl={conn.url}
      token={conn.token}
      connect
      audio
      video
      onDisconnected={onStop}
      className="ic-webcam-publisher"
    >
      <LocalPreview />
      <button type="button" className="ic-toolbar-text-btn" onClick={onStop}>
        ■ Stop test publish
      </button>
    </LiveKitRoom>
  );
}
