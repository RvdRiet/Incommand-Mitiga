import { notFound } from "next/navigation";

import { DeviceRegistryPage } from "@/components/devices/DeviceRegistryPage";
import { isModuleInEdition } from "@/lib/editions";

export default function DevicesPage() {
  // The bodycam registry is a standalone page; gate it by the active edition like a
  // module (hidden + 404 in Command Core, available in Full).
  if (!isModuleInEdition("devices")) notFound();
  return <DeviceRegistryPage />;
}
