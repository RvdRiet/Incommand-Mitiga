import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { GlobalErrorInit } from "@/components/errors/GlobalErrorInit";
import { OfflineIndicator } from "@/components/pwa/OfflineIndicator";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { Providers } from "./providers";

import "./globals.css";
import "./design-tokens.css";
import "./ui-modern.css";
import "./form-builder.css";
import "./dashboard-cop.css";
import "./events-modern.css";
import "./fema-ics-form.css";
import "./weather-meteogram.css";
import "./module-tools.css";
import "./comms.css";
import "./devices.css";
import "@livekit/components-styles";
import "./mobile.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "InCommand Mitiga",
  description: "Risk and disaster management command dashboard",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0b1220",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <Providers>{children}</Providers>
        <GlobalErrorInit />
        <ServiceWorkerRegister />
        <OfflineIndicator />
      </body>
    </html>
  );
}
