import type { NextConfig } from "next";

// Content-Security-Policy. Strict on the high-value directives — no external
// SCRIPT hosts (blocks injected script XSS), no framing (clickjacking), no
// object/base/form hijack — while staying scheme-permissive on img/connect so
// the map tiles, presigned S3 downloads and LiveKit/WebSocket realtime keep
// working across deploys without enumerating every configurable origin.
// (Tightening connect-src to an explicit allow-list is a possible follow-up.)
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "connect-src 'self' https: wss: ws:",
  "media-src 'self' blob: https:",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

// Baseline security headers applied to every response.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Force HTTPS for a year incl. subdomains (only acts over HTTPS; harmless on http).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  // Clickjacking protection.
  { key: "X-Frame-Options", value: "DENY" },
  // Don't let browsers MIME-sniff responses.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Trim referrer leakage to other origins.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Only allow the powerful features the app actually uses, and only first-party.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["maplibre-gl"],
  // Emit a self-contained server bundle for a lean container image (PaaS/k8s-ready).
  output: "standalone",
  async headers() {
    return [
      // Security headers on everything EXCEPT the service worker (a CSP on the SW
      // script response can block its registration in some browsers).
      { source: "/((?!sw\\.js).*)", headers: securityHeaders },
      // The service worker needs a root scope and must not be stale-cached.
      {
        source: "/sw.js",
        headers: [
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
};

export default nextConfig;
