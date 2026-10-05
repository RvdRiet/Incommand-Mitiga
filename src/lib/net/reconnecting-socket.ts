"use client";

import { useEffect, useRef } from "react";

type ReconnectingSocketHandlers = {
  /** Called on each successful (re)connect — send your hello/subscribe here. */
  onOpen?: (ws: WebSocket) => void;
  onMessage?: (ev: MessageEvent) => void;
  /** Fired when the live/stale state flips, e.g. to drive a "reconnecting…" chip. */
  onStatusChange?: (status: "open" | "closed") => void;
};

/**
 * Imperative core: opens a self-healing WebSocket and returns a `dispose()`. Use
 * this directly inside a `useEffect` (return it as the cleanup) when a hook won't
 * fit — e.g. an effect that conditionally opens a socket. Reconnects with capped
 * exponential backoff and wakes on `online` / window `focus` / `visibilitychange`.
 */
export function openReconnectingSocket(
  url: string,
  handlers: ReconnectingSocketHandlers,
): () => void {
  if (typeof window === "undefined") return () => {};

  let ws: WebSocket | null = null;
  let disposed = false;
  let retry = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleReconnect = () => {
    if (disposed) return;
    clearTimeout(reconnectTimer);
    const delay = Math.min(1000 * 2 ** retry, 15_000); // 1s,2s,4s,… capped at 15s
    retry += 1;
    reconnectTimer = setTimeout(connect, delay);
  };

  function connect() {
    if (disposed) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return; // don't stack sockets
    }
    let sock: WebSocket;
    try {
      sock = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      handlers.onStatusChange?.("open");
      handlers.onOpen?.(sock);
    };
    sock.onmessage = (ev) => handlers.onMessage?.(ev);
    sock.onerror = () => {
      try {
        sock.close();
      } catch {
        /* the onclose below drives the reconnect */
      }
    };
    sock.onclose = () => {
      handlers.onStatusChange?.("closed");
      if (!disposed) scheduleReconnect();
    };
  }

  // Network back / app refocused / tab visible again → reconnect NOW instead of
  // waiting out the backoff (the case that most often leaves a wrapper stale).
  const wake = () => {
    if (disposed) return;
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      retry = 0;
      clearTimeout(reconnectTimer);
      connect();
    }
  };
  const onVisibility = () => {
    if (document.visibilityState === "visible") wake();
  };

  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);
  document.addEventListener("visibilitychange", onVisibility);

  connect();

  return () => {
    disposed = true;
    clearTimeout(reconnectTimer);
    window.removeEventListener("online", wake);
    window.removeEventListener("focus", wake);
    document.removeEventListener("visibilitychange", onVisibility);
    try {
      ws?.close();
    } catch {
      /* noop */
    }
    ws = null;
  };
}

/**
 * A WebSocket that heals itself. Plain `new WebSocket(url)` opens ONCE — if the
 * socket drops (server blip, sleep/wake, or Chromium suspending a backgrounded
 * window) it never returns, so a long-lived desktop-wrapper window silently goes
 * stale while a freshly-loaded browser tab looks fine. This reconnects with capped
 * exponential backoff AND wakes immediately on `online` / window `focus` /
 * `visibilitychange`, so live data (bodycam presence, unit GPS, comms) keeps
 * flowing in both the browser and the Electron wrapper.
 *
 * Handlers are read through a ref, so passing fresh closures every render does NOT
 * churn the connection — it only reconnects when `url` or an item in `deps` changes.
 */
export function useReconnectingWebSocket(
  url: string | undefined,
  handlers: ReconnectingSocketHandlers,
  deps: unknown[] = [],
) {
  // Read handlers through a ref so passing fresh closures each render doesn't churn
  // the connection — it only reconnects when `url` or a `deps` entry changes.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!url) return;
    return openReconnectingSocket(url, {
      onOpen: (ws) => handlersRef.current.onOpen?.(ws),
      onMessage: (ev) => handlersRef.current.onMessage?.(ev),
      onStatusChange: (s) => handlersRef.current.onStatusChange?.(s),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers via ref; reconnect only on url/deps
  }, [url, ...deps]);
}
