import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { openReconnectingSocket } from "../../src/lib/net/reconnecting-socket";

/** Minimal fake WebSocket that records instances and lets tests drive lifecycle. */
class FakeWebSocket {
  static CONNECTING = 0 as const;
  static OPEN = 1 as const;
  static CLOSING = 2 as const;
  static CLOSED = 3 as const;
  static instances: FakeWebSocket[] = [];

  readyState: number = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sent: string[] = [];

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
  // Test helpers
  _open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }
  _drop() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

type Listener = () => void;

function installDom() {
  const winListeners: Record<string, Listener[]> = {};
  const docListeners: Record<string, Listener[]> = {};
  const mk = (bag: Record<string, Listener[]>) => ({
    addEventListener: (t: string, fn: Listener) => {
      (bag[t] ??= []).push(fn);
    },
    removeEventListener: (t: string, fn: Listener) => {
      bag[t] = (bag[t] ?? []).filter((f) => f !== fn);
    },
  });
  const win = mk(winListeners);
  const doc = { ...mk(docListeners), visibilityState: "visible" as string };
  (globalThis as Record<string, unknown>).window = win;
  (globalThis as Record<string, unknown>).document = doc;
  (globalThis as Record<string, unknown>).WebSocket = FakeWebSocket;
  return {
    fireWindow: (t: string) => (winListeners[t] ?? []).forEach((f) => f()),
    fireDocument: (t: string) => (docListeners[t] ?? []).forEach((f) => f()),
    doc,
  };
}

describe("openReconnectingSocket", () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).WebSocket;
  });

  it("opens once and calls onOpen on connect", () => {
    installDom();
    const onOpen = vi.fn();
    const dispose = openReconnectingSocket("ws://x", { onOpen });
    expect(FakeWebSocket.instances).toHaveLength(1);
    FakeWebSocket.instances[0]!._open();
    expect(onOpen).toHaveBeenCalledTimes(1);
    dispose();
  });

  it("reconnects with backoff after an unexpected drop", () => {
    installDom();
    const dispose = openReconnectingSocket("ws://x", {});
    FakeWebSocket.instances[0]!._open();
    FakeWebSocket.instances[0]!._drop(); // socket dies

    // Nothing reconnects instantly; first retry is ~1s.
    expect(FakeWebSocket.instances).toHaveLength(1);
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2);

    // Second drop backs off to ~2s.
    FakeWebSocket.instances[1]!._drop();
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(2); // not yet
    vi.advanceTimersByTime(1000);
    expect(FakeWebSocket.instances).toHaveLength(3);
    dispose();
  });

  it("stops reconnecting after dispose", () => {
    installDom();
    const dispose = openReconnectingSocket("ws://x", {});
    FakeWebSocket.instances[0]!._open();
    dispose(); // dispose closes the socket (fires onclose with disposed=true)
    vi.advanceTimersByTime(60_000);
    expect(FakeWebSocket.instances).toHaveLength(1); // no reconnect
  });

  it("wakes and reconnects immediately on focus when closed", () => {
    const dom = installDom();
    const dispose = openReconnectingSocket("ws://x", {});
    FakeWebSocket.instances[0]!._open();
    FakeWebSocket.instances[0]!._drop();

    // Focus fires before the backoff timer elapses → reconnect NOW.
    dom.fireWindow("focus");
    expect(FakeWebSocket.instances).toHaveLength(2);
    dispose();
  });

  it("removes listeners and closes the socket on dispose", () => {
    installDom();
    const dispose = openReconnectingSocket("ws://x", {});
    const sock = FakeWebSocket.instances[0]!;
    sock._open();
    dispose();
    expect(sock.readyState).toBe(FakeWebSocket.CLOSED);
  });
});
