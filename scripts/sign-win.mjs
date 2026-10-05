// Code-sign the packaged Windows app with signtool. Signing needs a certificate
// (see deploy/CODE-SIGNING.md) — this script just automates the signing once you
// have one. Configure via env:
//   • WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD   → a .pfx file + its password, OR
//   • WIN_CERT_THUMBPRINT                    → a cert already in the Windows store
//   • WIN_TIMESTAMP_URL (optional)           → RFC-3161 timestamp (default DigiCert)
//
// With no cert configured it prints guidance and exits 0 (unsigned build still works).
import { execFileSync, execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const APP_DIR = "dist-electron/InCommand-win32-x64";
const TS_URL = process.env.WIN_TIMESTAMP_URL || "http://timestamp.digicert.com";

function findSigntool() {
  try {
    return execSync("where signtool", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().split(/\r?\n/)[0];
  } catch {
    // Common Windows SDK locations
    const roots = ["C:/Program Files (x86)/Windows Kits/10/bin", "C:/Program Files/Windows Kits/10/bin"];
    for (const root of roots) {
      if (!existsSync(root)) continue;
      for (const ver of readdirSync(root).sort().reverse()) {
        const p = join(root, ver, "x64", "signtool.exe");
        if (existsSync(p)) return p;
      }
    }
    return null;
  }
}

function certArgs() {
  if (process.env.WIN_CSC_LINK) {
    return ["/f", process.env.WIN_CSC_LINK, ...(process.env.WIN_CSC_KEY_PASSWORD ? ["/p", process.env.WIN_CSC_KEY_PASSWORD] : [])];
  }
  if (process.env.WIN_CERT_THUMBPRINT) return ["/sha1", process.env.WIN_CERT_THUMBPRINT];
  return null;
}

const cert = certArgs();
if (!cert) {
  console.log("ℹ️  No signing certificate configured — skipping (build is unsigned).");
  console.log("   Set WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD (a .pfx) or WIN_CERT_THUMBPRINT.");
  console.log("   See deploy/CODE-SIGNING.md.");
  process.exit(0);
}

const signtool = findSigntool();
if (!signtool) {
  console.error("❌ signtool.exe not found — install the Windows SDK (Signing Tools).");
  process.exit(1);
}

if (!existsSync(APP_DIR)) {
  console.error(`❌ ${APP_DIR} not found — run \`npm run electron:pack\` first.`);
  process.exit(1);
}

const exe = join(APP_DIR, "InCommand.exe");
console.log(`Signing ${exe} …`);
execFileSync(signtool, ["sign", "/fd", "SHA256", ...cert, "/tr", TS_URL, "/td", "SHA256", exe], { stdio: "inherit" });
// Verify
execFileSync(signtool, ["verify", "/pa", "/v", exe], { stdio: "inherit" });
console.log("✅ Signed + verified.");
