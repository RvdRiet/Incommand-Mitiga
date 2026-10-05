// Next's `output: "standalone"` doesn't copy the static assets or /public into
// the standalone folder — the server expects them beside it. Mirror what the
// Dockerfile does so the desktop build serves a complete app.
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(standalone)) {
  console.error('❌ .next/standalone missing — run `npm run build` first (next.config output: "standalone").');
  process.exit(1);
}

cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
}

// Next's file tracer sometimes omits .next/server/vendor-chunks from the standalone
// output on Windows, leaving webpack-runtime.js unable to require './vendor-chunks/next.js'
// (every request then 500s with MODULE_NOT_FOUND). Copy it in explicitly if present.
const vendorChunks = join(root, ".next", "server", "vendor-chunks");
if (existsSync(vendorChunks)) {
  cpSync(vendorChunks, join(standalone, ".next", "server", "vendor-chunks"), { recursive: true });
}

console.log("✅ Prepared .next/standalone (copied .next/static + public + vendor-chunks).");
