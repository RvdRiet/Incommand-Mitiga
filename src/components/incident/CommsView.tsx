"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";

import { useEventId, useIncidentStore } from "@/context/EventContext";
import { useDeviceRegistry } from "@/lib/devices/store";
import { devicePresence, lastSeenLabel, offlineThresholdMs, useNow, type DevicePresence } from "@/lib/devices/presence";
import { IconAlertTriangle, IconMic, IconVolume } from "@/components/ui/icons";
import { personReadiness, type ReadinessData } from "@/lib/incident/readiness";
import { openReconnectingSocket } from "@/lib/net/reconnecting-socket";
import type { ChannelMode, DistressKind, FieldUnit, PageMessage } from "@/lib/incident/types";

import { SIP_ENABLED, useSipPtt } from "./useSipPtt";

const PAGING_WS_URL = process.env.NEXT_PUBLIC_PAGING_WS_URL;
const SIGNALING_WS_URL = process.env.NEXT_PUBLIC_SIGNALING_WS_URL;
const LIVEKIT_ENABLED = Boolean(process.env.NEXT_PUBLIC_LIVEKIT_URL);

// Client-only: livekit-client touches browser APIs; keep it out of SSR + the initial bundle.
const ChannelVideo = dynamic(() => import("./ChannelVideo").then((m) => m.ChannelVideo), {
  ssr: false,
  loading: () => <span className="ic-channel-card__video-empty">Loading video…</span>,
});
const WebcamPublisher = dynamic(() => import("./WebcamPublisher").then((m) => m.WebcamPublisher), {
  ssr: false,
  loading: () => <span className="ic-channel-card__video-empty">Loading camera…</span>,
});

type ChannelPresence = { count: number; floor: string | null };

import { CoordCell, InlineInput, InlineSelect, RowDelete } from "./shared";
import { EmptyHint } from "./ui";

const QUICK_PAGES = ["RTB — Return to base", "Move to Div-B", "Hold position", "Report status"];

function pageSummary(p: PageMessage) {
  const total = p.recipients.length;
  const ack = p.recipients.filter((r) => r.status === "ack").length;
  return { total, ack, allAck: total > 0 && ack === total };
}

function pageTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString();
}

export function CommsView() {
  const channels = useIncidentStore((s) => s.channels);
  const fieldUnits = useIncidentStore((s) => s.fieldUnits);
  const forms = useIncidentStore((s) => s.forms);

  const addChannel = useIncidentStore((s) => s.addChannel);
  const updateChannel = useIncidentStore((s) => s.updateChannel);
  const removeChannel = useIncidentStore((s) => s.removeChannel);
  const syncChannels = useIncidentStore((s) => s.syncChannelsFromICS205);
  const addFieldUnit = useIncidentStore((s) => s.addFieldUnit);
  const updateFieldUnit = useIncidentStore((s) => s.updateFieldUnit);
  const removeFieldUnit = useIncidentStore((s) => s.removeFieldUnit);
  const pages = useIncidentStore((s) => s.pages);
  const sendPage = useIncidentStore((s) => s.sendPage);
  const markPageDelivered = useIncidentStore((s) => s.markPageDelivered);
  const markPageAck = useIncidentStore((s) => s.markPageAck);
  const raiseDistress = useIncidentStore((s) => s.raiseDistress);

  const eventId = useEventId();
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const pagingWsRef = useRef<WebSocket | null>(null);

  // Real feed: relay pages + receipts over the paging service when configured.
  // Self-healing socket so a backgrounded/dropped connection recovers instead of
  // leaving receipts (and delivery/ack state) frozen.
  useEffect(() => {
    if (!PAGING_WS_URL) return;
    return openReconnectingSocket(PAGING_WS_URL, {
      onOpen: (ws) => {
        pagingWsRef.current = ws;
        ws.send(JSON.stringify({ t: "hello", role: "operator", incidentId: eventId }));
      },
      onStatusChange: (s) => {
        if (s === "closed") pagingWsRef.current = null;
      },
      onMessage: (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.t !== "receipt") return;
        const pageId = String(msg.pageId);
        const unitId = String(msg.unitId);
        if (msg.status === "ack") markPageAck(pageId, unitId);
        else markPageDelivered(pageId, unitId);
      },
    });
  }, [eventId, markPageDelivered, markPageAck]);

  /** Send a page; over the paging service if configured, else the store's local sim drives it. */
  const doPage = (channelId: string, body: string, recipientIds: string[]) => {
    const id = sendPage(channelId, body);
    const ws = pagingWsRef.current;
    if (id && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          t: "page",
          pageId: id,
          channelId,
          body,
          recipients: recipientIds,
          at: new Date().toISOString(),
        }),
      );
    }
  };

  // Signaling: live channel presence + PTT floor control (RFC-005 §1), when configured.
  const signalWsRef = useRef<WebSocket | null>(null);
  const [presence, setPresence] = useState<Record<string, ChannelPresence>>({});
  const channelIds = channels.map((c) => c.id).join(",");

  useEffect(() => {
    if (!SIGNALING_WS_URL) return;
    return openReconnectingSocket(SIGNALING_WS_URL, {
      onOpen: (ws) => {
        signalWsRef.current = ws;
        ws.send(
          JSON.stringify({ t: "hello", incidentId: eventId, participantId: "operator", role: "command", callsign: "Command" }),
        );
        for (const id of channelIds ? channelIds.split(",") : []) {
          ws.send(JSON.stringify({ t: "join", channelId: id }));
        }
      },
      onStatusChange: (s) => {
        if (s === "closed") signalWsRef.current = null;
      },
      onMessage: (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.t === "presence") {
          const holder = msg.floorHolder as { callsign?: string } | null;
          setPresence((prev) => ({
            ...prev,
            [String(msg.channelId)]: {
              count: Array.isArray(msg.participants) ? msg.participants.length : 0,
              floor: holder?.callsign ?? null,
            },
          }));
        }
      },
    });
  }, [eventId, channelIds]);

  const pttFloor = (channelId: string, action: "request" | "release") => {
    const ws = signalWsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ t: "floor", channelId, action }));
    }
  };

  // Real SIP audio push-to-talk against the fleet Asterisk (RFC-006), when configured.
  const sip = useSipPtt();

  // Which channels the operator has told the bodycams to go live on (RFC-007 command channel).
  const [liveChannels, setLiveChannels] = useState<Set<string>>(() => new Set());
  // Which channels have this browser's own webcam open as a test publisher (no bodycam needed).
  const [publishingChannels, setPublishingChannels] = useState<Set<string>>(() => new Set());
  const togglePublishing = (channelId: string) => {
    setPublishingChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channelId)) next.delete(channelId);
      else next.add(channelId);
      return next;
    });
  };

  // LiveKit reachability: polled so the UI can say "unreachable" instead of every channel's
  // video silently failing one at a time with no explanation.
  const [liveKitHealth, setLiveKitHealth] = useState<"checking" | "ok" | "down">("checking");
  useEffect(() => {
    if (!LIVEKIT_ENABLED) return;
    let cancelled = false;
    const check = () => {
      fetch("/api/livekit/health")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { ok: boolean }) => {
          if (!cancelled) setLiveKitHealth(d.ok ? "ok" : "down");
        })
        .catch(() => {
          if (!cancelled) setLiveKitHealth("down");
        });
    };
    check();
    const id = window.setInterval(check, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const toggleLive = async (channelId: string, room: string, circles: string[]) => {
    const goingLive = !liveChannels.has(channelId);
    try {
      const r = await fetch("/api/comms/go-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: goingLive ? "go_live" : "stop_live",
          circles,
          room,
          channelId,
        }),
      });
      if (!r.ok) return;
      setLiveChannels((prev) => {
        const next = new Set(prev);
        if (goingLive) next.add(channelId);
        else next.delete(channelId);
        return next;
      });
    } catch {
      /* ignore — UI stays in prior state */
    }
  };

  // Simulated device delivery/ACK — used only without a paging service; the real service
  // (RFC-005 §3) drives receipts via the WS handler above.
  useEffect(() => {
    if (PAGING_WS_URL) return;
    const pending = pages.some((p) =>
      p.recipients.some((r) => r.status !== "ack"),
    );
    if (!pending) return;
    const id = window.setInterval(() => {
      const now = Date.now();
      for (const p of pages) {
        for (const r of p.recipients) {
          const age = now - new Date(r.updatedAt).getTime();
          if (r.status === "queued" && age > 900) markPageDelivered(p.id, r.unitId);
          else if (r.status === "delivered" && age > 1600) markPageAck(p.id, r.unitId);
        }
      }
    }, 700);
    return () => window.clearInterval(id);
  }, [pages, markPageDelivered, markPageAck]);

  const registeredDevices = useDeviceRegistry((s) => s.devices);
  const availableFromRegistry = useMemo(
    () => registeredDevices.filter((d) => !fieldUnits.some((u) => u.id === d.id)),
    [registeredDevices, fieldUnits],
  );

  // Live bodycam presence: a unit is reachable only while its device keeps checking
  // in. Recomputed on a timer (useNow) so a device that stops reporting flips to
  // offline on its own — so operators don't try to reach a bodycam that's dark.
  const now = useNow();
  const offlineMs = offlineThresholdMs(useIncidentStore((s) => s.settings.deviceOfflineAfterSec));
  const devicesById = useMemo(
    () => new Map(registeredDevices.map((d) => [d.id, d])),
    [registeredDevices],
  );
  const unitPresence = (u: FieldUnit): DevicePresence => {
    if (u.status === "offline") return "offline";
    const dev = u.deviceId ? devicesById.get(u.deviceId) : undefined;
    if (dev) return devicePresence(dev.lastSeenAt, now, offlineMs);
    return "online";
  };

  // Deployment gating: a unit's assigned responder may be fatigued past a safe limit or
  // carrying an expired certification. Surface that on the unit so command doesn't task an
  // unfit crew member — the same readiness engine Personnel/Roles/Analytics use.
  const personnel = useIncidentStore((s) => s.personnel);
  const shifts = useIncidentStore((s) => s.shifts);
  const certifications = useIncidentStore((s) => s.certifications);
  const roleGroups = useIncidentStore((s) => s.roleGroups);
  const settings = useIncidentStore((s) => s.settings);
  const personnelOptions = useMemo(
    () => [
      { value: "", label: "— Unassigned —" },
      ...personnel.map((p) => ({ value: p.id, label: p.name || "(unnamed)" })),
    ],
    [personnel],
  );
  const unitReadiness = (personnelId: string | null) =>
    personnelId
      ? personReadiness(
          personnelId,
          { shifts, certifications, roleGroups, fieldUnits } as ReadinessData,
          {
            maxShiftHours: settings.maxShiftHours ?? 12,
            maxOnDuty24h: settings.maxOnDuty24h ?? 16,
            minRestHours: settings.minRestHours ?? 8,
          },
          settings.certReminderDays ?? 30,
          now,
        )
      : null;

  const has205 = useMemo(
    () => forms.some((f) => f.templateId === "ICS-205" || /\b205\b/.test(f.formNumber ?? "")),
    [forms],
  );

  const unitsByChannel = useMemo(() => {
    const map = new Map<string, typeof fieldUnits>();
    for (const u of fieldUnits) {
      if (!u.channelId) continue;
      const list = map.get(u.channelId) ?? [];
      list.push(u);
      map.set(u.channelId, list);
    }
    return map;
  }, [fieldUnits]);

  const channelOptions = [
    { value: "", label: "— Unassigned —" },
    ...channels.map((c) => ({ value: c.id, label: c.name })),
  ];

  const doSync = () => {
    const n = syncChannels();
    setSyncMsg(
      n > 0
        ? `Synced ${n} channel(s) from ICS-205.`
        : has205
          ? "ICS-205 found, but it has no named channels yet."
          : "No ICS-205 form in this incident. Add one under Forms first.",
    );
  };

  return (
    <section className="ic-comms">
      <header className="ic-comms__head">
        <div>
          <h2 className="ic-page-heading">Live Ops</h2>
          <p className="ic-comms__sub">
            Your live radio room. Talk to field units over channels, send them pages, and see
            distress alerts the moment they happen. Channels mirror your ICS&nbsp;205
            communications plan.
          </p>
          {LIVEKIT_ENABLED ? (
            <span
              className={`ic-livekit-health ic-livekit-health--${liveKitHealth}`}
              title={
                liveKitHealth === "down"
                  ? "Video server unreachable — check LIVEKIT_URL and that it's running"
                  : undefined
              }
            >
              <span className="ic-livekit-health__dot" aria-hidden />
              LiveKit:{" "}
              {liveKitHealth === "checking"
                ? "checking…"
                : liveKitHealth === "ok"
                  ? "connected"
                  : "unreachable"}
            </span>
          ) : null}
        </div>
        <div className="ic-comms__actions">
          <button type="button" className="ic-btn-add" onClick={doSync}>
            Sync from ICS-205
          </button>
          <button type="button" className="ic-toolbar-text-btn" onClick={() => addChannel()}>
            + Channel
          </button>
          <button type="button" className="ic-toolbar-text-btn" onClick={() => addFieldUnit()}>
            + Field unit
          </button>
          {availableFromRegistry.length > 0 ? (
            <select
              className="ic-inline-input ic-comms__registry"
              value=""
              onChange={(e) => {
                const dev = availableFromRegistry.find((d) => d.id === e.target.value);
                if (dev) addFieldUnit({ id: dev.id, callsign: dev.callsign, deviceId: dev.id });
              }}
            >
              <option value="">+ Add from registry…</option>
              {availableFromRegistry.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.callsign} ({d.model})
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </header>

      {syncMsg ? <p className="ic-comms__notice">{syncMsg}</p> : null}

      {channels.length === 0 ? (
        <EmptyHint>
          No channels yet. Click “+ Channel” to add one, or pull them in from your ICS-205
          communications plan with “Sync from ICS-205”.
        </EmptyHint>
      ) : (
        <div className="ic-comms__channels">
          {channels.map((c) => {
            const units = unitsByChannel.get(c.id) ?? [];
            const onlineUnits = units.filter((u) => unitPresence(u) === "online");
            const offlineUnits = units.filter((u) => unitPresence(u) !== "online");
            const offlineCount = offlineUnits.length;
            // Room alignment: the same string ChannelVideo subscribes to is what we tell bodycams
            // to publish to.
            const videoRoom = c.videoRoom || `vid-${c.id}`;
            const liveCircles = [
              ...new Set(
                units
                  .map((u) => registeredDevices.find((d) => d.id === u.id)?.mqttCircle)
                  .filter((s): s is string => Boolean(s)),
              ),
            ];
            const isLive = liveChannels.has(c.id);
            return (
              <article key={c.id} className="ic-channel-card" style={{ borderTopColor: c.color }}>
                <div className="ic-channel-card__head">
                  <span className="ic-channel-card__dot" style={{ background: c.color }} aria-hidden />
                  <InlineInput
                    value={c.name}
                    onChange={(v) => updateChannel(c.id, { name: v })}
                    className="ic-channel-card__name"
                  />
                  <RowDelete onClick={() => removeChannel(c.id)} />
                </div>

                <div className="ic-channel-card__meta">
                  <InlineInput
                    value={c.function}
                    placeholder="Function"
                    onChange={(v) => updateChannel(c.id, { function: v })}
                  />
                  <InlineSelect
                    value={c.mode}
                    onChange={(v) => updateChannel(c.id, { mode: v as ChannelMode })}
                    options={[
                      { value: "ptt", label: "PTT (tactical)" },
                      { value: "open_net", label: "Open net (command)" },
                    ]}
                  />
                </div>

                {SIGNALING_WS_URL ? (
                  <div className="ic-channel-ptt">
                    <span className="ic-channel-ptt__presence ic-btn-icon">
                      <span className="ic-live-dot" aria-hidden /> {presence[c.id]?.count ?? 0} on channel · Floor:{" "}
                      <strong>{presence[c.id]?.floor ?? "open"}</strong>
                    </span>
                    <button
                      type="button"
                      className="ic-channel-ptt__btn ic-btn-icon"
                      onMouseDown={() => pttFloor(c.id, "request")}
                      onMouseUp={() => pttFloor(c.id, "release")}
                      onMouseLeave={() => pttFloor(c.id, "release")}
                    >
                      <IconMic size={14} /> Hold to talk
                    </button>
                  </div>
                ) : null}

                {SIP_ENABLED ? (
                  <div className={`ic-channel-sip ic-channel-sip--${sip.state}`}>
                    <span className="ic-channel-sip__status ic-btn-icon">
                      {sip.state === "registered" ? <IconVolume size={13} /> : null}
                      {sip.state === "registered"
                        ? "Voice ready"
                        : sip.state === "connecting"
                          ? "Voice connecting…"
                          : "Voice offline"}
                    </span>
                    <button
                      type="button"
                      className={`ic-channel-sip__ptt ic-btn-icon${
                        sip.talking && sip.activeChannelId === c.id ? " ic-channel-sip__ptt--live" : ""
                      }`}
                      disabled={sip.state !== "registered"}
                      onMouseDown={() => sip.pressTalk(c.id, c.sipRoom || `tg-${c.id}`)}
                      onMouseUp={() => sip.releaseTalk()}
                      onMouseLeave={() => sip.releaseTalk()}
                    >
                      <IconMic size={14} />{" "}
                      {sip.talking && sip.activeChannelId === c.id
                        ? "On air — release to stop"
                        : "Hold to talk (audio)"}
                    </button>
                  </div>
                ) : null}

                {LIVEKIT_ENABLED ? (
                  <div className="ic-channel-live">
                    <button
                      type="button"
                      className={`ic-channel-live__btn${isLive ? " ic-channel-live__btn--on" : ""}`}
                      disabled={liveCircles.length === 0}
                      title={
                        liveCircles.length === 0
                          ? "Assign units with a linked bodycam to start video"
                          : `Room ${videoRoom}`
                      }
                      onClick={() => toggleLive(c.id, videoRoom, liveCircles)}
                    >
                      {isLive ? "■ Stop live" : "● Go live"}
                    </button>
                    <button
                      type="button"
                      className={`ic-channel-live__btn${publishingChannels.has(c.id) ? " ic-channel-live__btn--on" : ""}`}
                      title="Publish this browser's own camera into the room — no bodycam needed, for testing/demo"
                      onClick={() => togglePublishing(c.id)}
                    >
                      {publishingChannels.has(c.id) ? "■ Stop test publish" : "🎥 Test publish (this device)"}
                    </button>
                    <span className="ic-channel-live__room">{videoRoom}</span>
                  </div>
                ) : null}

                {LIVEKIT_ENABLED && publishingChannels.has(c.id) ? (
                  <WebcamPublisher room={videoRoom} onStop={() => togglePublishing(c.id)} />
                ) : null}

                {/* Live video grid — LiveKit when configured (RFC-007), else placeholder. */}
                <div className="ic-channel-card__video" aria-label="Live video">
                  {LIVEKIT_ENABLED ? (
                    <ChannelVideo room={videoRoom} />
                  ) : units.length === 0 ? (
                    <span className="ic-channel-card__video-empty">No units on this channel</span>
                  ) : (
                    units.map((u) => {
                      const online = unitPresence(u) === "online";
                      return (
                        <div
                          key={u.id}
                          className={`ic-video-tile${online ? "" : " ic-video-tile--offline"}`}
                        >
                          <span
                            className={`ic-video-tile__badge${online ? "" : " ic-video-tile__badge--offline"}`}
                          >
                            {online ? "● LIVE" : "○ OFFLINE"}
                          </span>
                          <span className="ic-video-tile__label">{u.callsign}</span>
                          <span className="ic-video-tile__pending">
                            {online ? "Connecting…" : "Bodycam offline — no signal"}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* When real video is running (LiveKit), offline bodycams never publish and
                    would silently vanish — surface them so command knows they're dark. */}
                {LIVEKIT_ENABLED && offlineCount > 0 ? (
                  <div className="ic-channel-card__offline-strip" role="status">
                    <span className="ic-channel-card__offline-strip-dot" aria-hidden />
                    <span className="ic-channel-card__offline-strip-label">
                      {offlineCount} offline · not streaming
                    </span>
                    <span className="ic-channel-card__offline-strip-names">
                      {offlineUnits.map((u) => u.callsign).join(" · ")}
                    </span>
                  </div>
                ) : null}

                <div className="ic-channel-card__page">
                  <span className="ic-channel-card__page-label">
                    Page channel:
                    {offlineCount > 0 ? (
                      <span className="ic-channel-card__offline-note">
                        {onlineUnits.length} reachable · {offlineCount} offline
                      </span>
                    ) : null}
                  </span>
                  <div className="ic-channel-card__page-btns">
                    {QUICK_PAGES.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="ic-page-btn"
                        disabled={!c.pageEnabled || onlineUnits.length === 0}
                        title={
                          units.length === 0
                            ? "No units on this channel"
                            : onlineUnits.length === 0
                              ? "All units offline — nothing to page"
                              : `Page ${onlineUnits.length} online unit(s): ${p}`
                        }
                        onClick={() => doPage(c.id, p, onlineUnits.map((u) => u.id))}
                      >
                        {p.split(" — ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <h3 className="ic-comms__section-title">Field units</h3>
      <section className="ic-table-wrap ic-table-wrap--scroll">
        <table className="ic-table">
          <thead>
            <tr>
              <th>Callsign</th>
              <th>Crew</th>
              <th>Channel</th>
              <th>Status</th>
              <th>Signal</th>
              <th>Location</th>
              <th>Distress (simulate device)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {fieldUnits.map((u) => (
              <tr key={u.id}>
                <td>
                  <InlineInput
                    value={u.callsign}
                    onChange={(v) => updateFieldUnit(u.id, { callsign: v })}
                  />
                </td>
                <td>
                  <InlineSelect
                    value={u.personnelId ?? ""}
                    onChange={(v) => updateFieldUnit(u.id, { personnelId: v || null })}
                    options={personnelOptions}
                  />
                  {(() => {
                    const r = unitReadiness(u.personnelId);
                    if (!r || r.level === "ready") return null;
                    return (
                      <span
                        className={`ic-role-flag ic-role-flag--${r.level}`}
                        title={r.issues.join(" · ")}
                      >
                        <IconAlertTriangle size={12} /> {r.issues[0]}
                      </span>
                    );
                  })()}
                </td>
                <td>
                  <InlineSelect
                    value={u.channelId ?? ""}
                    onChange={(v) => updateFieldUnit(u.id, { channelId: v || null })}
                    options={channelOptions}
                  />
                </td>
                <td>
                  <InlineSelect
                    value={u.status}
                    onChange={(v) =>
                      updateFieldUnit(u.id, { status: v as typeof u.status })
                    }
                    options={[
                      { value: "available", label: "Available" },
                      { value: "assigned", label: "Assigned" },
                      { value: "offline", label: "Offline" },
                    ]}
                  />
                </td>
                <td>
                  {(() => {
                    const dev = u.deviceId ? devicesById.get(u.deviceId) : undefined;
                    if (!u.deviceId) {
                      return <span className="ic-signal ic-signal--none" title="No bodycam linked to this unit">No bodycam</span>;
                    }
                    const presence = dev ? devicePresence(dev.lastSeenAt, now, offlineMs) : "offline";
                    const seen = dev ? lastSeenLabel(dev.lastSeenAt, now) : "never seen";
                    return (
                      <span
                        className={`ic-signal ic-signal--${presence}`}
                        title={`Bodycam ${presence} · last check-in ${seen}`}
                      >
                        <span className="ic-signal__dot" />
                        {presence === "online" ? "Online" : "Offline"}
                      </span>
                    );
                  })()}
                </td>
                <td>
                  <CoordCell lat={u.lat} lng={u.lng} onChange={(patch) => updateFieldUnit(u.id, patch)} />
                </td>
                <td>
                  <div className="ic-distress-triggers">
                    {(["sos", "man_down", "duress"] as DistressKind[]).map((k) => (
                      <button
                        key={k}
                        type="button"
                        className="ic-distress-btn"
                        onClick={() => raiseDistress(u.id, k)}
                        title={`Raise ${k.replace("_", " ")}`}
                      >
                        {k === "sos" ? "SOS" : k === "man_down" ? "Man-down" : "Duress"}
                      </button>
                    ))}
                  </div>
                </td>
                <td>
                  <RowDelete onClick={() => removeFieldUnit(u.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {fieldUnits.length === 0 ? (
          <p className="ic-table-empty">No field units. Add one to assign it to a channel.</p>
        ) : null}
      </section>

      {pages.length > 0 ? (
        <>
          <h3 className="ic-comms__section-title">Pages</h3>
          <ul className="ic-pages">
            {pages.slice(0, 8).map((p) => {
              const s = pageSummary(p);
              return (
                <li key={p.id} className="ic-page-row">
                  <div className="ic-page-row__head">
                    <strong>{p.channelName}</strong>
                    <span className="ic-page-row__body">{p.body}</span>
                    <span className="ic-page-row__time">{pageTime(p.createdAt)}</span>
                    <span
                      className={`ic-page-row__status${s.allAck ? " ic-page-row__status--ack" : ""}`}
                    >
                      {s.total === 0 ? "no recipients" : `${s.ack}/${s.total} ack`}
                    </span>
                  </div>
                  {p.recipients.length > 0 ? (
                    <div className="ic-page-recipients">
                      {p.recipients.map((r) => (
                        <span
                          key={r.unitId}
                          className={`ic-page-recipient ic-page-recipient--${r.status}`}
                        >
                          {r.callsign} · {r.status}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </section>
  );
}
