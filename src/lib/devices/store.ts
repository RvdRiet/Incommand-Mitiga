"use client";

import { useEffect, useState } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { nowIso } from "@/lib/incident/id";

import { parseDeviceQrPayload, type RegisteredDevice } from "./types";

type DeviceRegistryState = {
  devices: RegisteredDevice[];
};

type DeviceRegistryActions = {
  /** Add/update a device. Keyed on id — re-registering updates in place. Returns the id. */
  upsertDevice: (device: Partial<RegisteredDevice> & { id: string }) => string;
  /** Register from a scanned QR payload or a bare device id. Returns the id, or null if invalid. */
  registerFromPayload: (payload: string) => string | null;
  updateDevice: (id: string, patch: Partial<RegisteredDevice>) => void;
  removeDevice: (id: string) => void;
  /** Record that a device was seen live (telemetry) — auto-registers unknown ids. */
  markSeen: (id: string, callsign?: string) => void;
};

export type DeviceRegistryStore = DeviceRegistryState & DeviceRegistryActions;

function normalize(input: Partial<RegisteredDevice> & { id: string }): RegisteredDevice {
  return {
    id: input.id.trim(),
    callsign: input.callsign?.trim() || input.id.trim(),
    label: input.label?.trim() ?? "",
    model: input.model?.trim() || "Bodycam",
    mqttCircle: input.mqttCircle?.trim() ?? "",
    registeredAt: input.registeredAt ?? nowIso(),
    lastSeenAt: input.lastSeenAt ?? null,
  };
}

export const useDeviceRegistry = create<DeviceRegistryStore>()(
  persist(
    (set, get) => ({
      devices: [],

      upsertDevice: (device) => {
        const id = device.id.trim();
        if (!id) return "";
        set((s) => {
          const existing = s.devices.find((d) => d.id === id);
          if (existing) {
            return {
              devices: s.devices.map((d) =>
                d.id === id ? { ...d, ...device, id } : d,
              ),
            };
          }
          return { devices: [normalize(device), ...s.devices] };
        });
        return id;
      },

      registerFromPayload: (payload) => {
        const parsed = parseDeviceQrPayload(payload);
        if (!parsed?.id) return null;
        return get().upsertDevice({ id: parsed.id, ...parsed });
      },

      updateDevice: (id, patch) => {
        set((s) => ({
          devices: s.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)),
        }));
      },

      removeDevice: (id) => {
        set((s) => ({ devices: s.devices.filter((d) => d.id !== id) }));
      },

      markSeen: (id, callsign) => {
        set((s) => {
          const existing = s.devices.find((d) => d.id === id);
          if (existing) {
            const name = callsign?.trim();
            // Upgrade a placeholder callsign (empty or still == the raw id) once a real name
            // arrives from the device, but never clobber an operator-set callsign.
            const upgrade = name && (!existing.callsign || existing.callsign === existing.id);
            return {
              devices: s.devices.map((d) =>
                d.id === id
                  ? { ...d, lastSeenAt: nowIso(), ...(upgrade ? { callsign: name } : {}) }
                  : d,
              ),
            };
          }
          // Auto-register a device that appears live but was never registered.
          return {
            devices: [normalize({ id, callsign, label: "", lastSeenAt: nowIso() }), ...s.devices],
          };
        });
      },
    }),
    { name: "mitiga-devices-v1" },
  ),
);

/** Avoids SSR/client hydration mismatch before localStorage rehydrates. */
export function useDeviceRegistryHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (useDeviceRegistry.persist.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return useDeviceRegistry.persist.onFinishHydration(() => setHydrated(true));
  }, []);
  return hydrated;
}
