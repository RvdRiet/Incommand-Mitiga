import os from "node:os";

import { afterEach, describe, expect, it, vi } from "vitest";

import { currentLanIpv4, resolveLiveKitUrl } from "../../src/lib/livekit/url";

type Nets = ReturnType<typeof os.networkInterfaces>;

function mockNets(nets: Nets) {
  return vi.spyOn(os, "networkInterfaces").mockReturnValue(nets);
}

// Shape helper — only the fields the resolver reads.
const v4 = (address: string, internal = false) =>
  ({ address, family: "IPv4", internal, netmask: "", mac: "", cidr: null }) as unknown as NonNullable<
    Nets[string]
  >[number];

const LAN_MACHINE: Nets = {
  lo: [v4("127.0.0.1", true)],
  wsl: [v4("172.29.0.1")], // Docker/WSL
  vbox: [v4("192.168.56.1")], // VirtualBox host-only
  wifi: [v4("192.168.80.189")], // real LAN
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_URL_STATIC;
});

describe("currentLanIpv4", () => {
  it("prefers an address in the same /24 as the hint (DHCP drift self-heals)", () => {
    mockNets(LAN_MACHINE);
    // Configured host was .187 but the machine is now .189 — same subnet wins.
    expect(currentLanIpv4("192.168.80.187")).toBe("192.168.80.189");
  });

  it("skips virtual adapters when there is no usable hint", () => {
    mockNets(LAN_MACHINE);
    expect(currentLanIpv4()).toBe("192.168.80.189");
  });

  it("returns null when there are no external IPv4 interfaces", () => {
    mockNets({ lo: [v4("127.0.0.1", true)] });
    expect(currentLanIpv4()).toBeNull();
  });
});

describe("resolveLiveKitUrl", () => {
  it("rewrites a private-LAN host to the current LAN IP, keeping scheme + port", () => {
    mockNets(LAN_MACHINE);
    process.env.LIVEKIT_URL = "ws://192.168.80.187:7880";
    expect(resolveLiveKitUrl()).toBe("ws://192.168.80.189:7880");
  });

  it("rewrites localhost to the LAN IP so phones on the LAN can reach it", () => {
    mockNets(LAN_MACHINE);
    process.env.LIVEKIT_URL = "ws://localhost:7880";
    expect(resolveLiveKitUrl()).toBe("ws://192.168.80.189:7880");
  });

  it("leaves a public host untouched", () => {
    mockNets(LAN_MACHINE);
    process.env.LIVEKIT_URL = "wss://livekit.example.com";
    expect(resolveLiveKitUrl()).toBe("wss://livekit.example.com");
  });

  it("honours LIVEKIT_URL_STATIC=1 (no rewrite)", () => {
    mockNets(LAN_MACHINE);
    process.env.LIVEKIT_URL = "ws://192.168.80.187:7880";
    process.env.LIVEKIT_URL_STATIC = "1";
    expect(resolveLiveKitUrl()).toBe("ws://192.168.80.187:7880");
  });

  it("returns undefined when LIVEKIT_URL is unset", () => {
    expect(resolveLiveKitUrl()).toBeUndefined();
  });
});
