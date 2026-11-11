// Build a Windows installer (Setup.exe) from the @electron/packager output using
// electron-winstaller (Squirrel.Windows).
//
// Why not electron-builder's NSIS target? Its toolchain downloads a `winCodeSign`
// bundle that contains macOS symlinks; extracting it on Windows fails without
// Developer Mode / admin rights, which blocked the installer build. Squirrel.Windows
// needs none of that — it packages the already-built app folder into a Setup.exe
// plus delta packages, with no winCodeSign step.
//
// Usage:  npm run electron:installer   (runs electron:pack first, then this)
//
// Prereq: dist-electron/InCommand-win32-x64/ must exist (produced by electron:pack).
// Output: dist-electron/installers/InCommand Setup.exe
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import electronInstaller from "electron-winstaller";

const APP_DIR = path.resolve("dist-electron/InCommand-win32-x64");
const OUT_DIR = path.resolve("dist-electron/installers");

if (process.platform !== "win32") {
  console.error("✗ electron:installer builds a Windows installer and must run on Windows.");
  process.exit(1);
}

if (!existsSync(APP_DIR)) {
  console.error(`✗ Packaged app not found at ${APP_DIR}`);
  console.error("  Run `npm run electron:pack` first (it produces that folder).");
  process.exit(1);
}

await mkdir(OUT_DIR, { recursive: true });

// Optional icon: use electron/icon.ico when present, else Squirrel's default.
const iconPath = path.resolve("electron/icon.ico");
const hasIcon = existsSync(iconPath);

console.log("Building Windows installer with Squirrel (no winCodeSign)…");
try {
  await electronInstaller.createWindowsInstaller({
    appDirectory: APP_DIR,
    outputDirectory: OUT_DIR,
    exe: "InCommand.exe",
    name: "InCommand", // package id — letters/numbers/dots/dashes only (no spaces)
    title: "InCommand",
    authors: "InCommand",
    description: "InCommand — disaster-management command platform",
    noMsi: true,
    setupExe: "InCommand-Setup.exe",
    ...(hasIcon ? { setupIcon: iconPath, iconUrl: `file:///${iconPath.replace(/\\/g, "/")}` } : {}),
  });
  console.log(`✅ Installer built → ${path.join(OUT_DIR, "InCommand-Setup.exe")}`);
  if (!hasIcon) {
    console.log("   (No electron/icon.ico found — used Squirrel's default icon.)");
  }
} catch (err) {
  console.error("✗ Installer build failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
