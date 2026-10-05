// Package the desktop app into a runnable folder with @electron/packager. Used by
// `npm run electron:pack` (electron-builder's installer path is blocked on Windows
// without Developer Mode — the winCodeSign bundle has symlinks). Ships ONLY
// electron/ + package.json (never .env / secrets); the standalone Next server is
// added as an extra resource.
import packager from "@electron/packager";

const appPaths = await packager({
  dir: ".",
  name: "InCommand",
  platform: process.platform === "darwin" ? "darwin" : process.platform === "linux" ? "linux" : "win32",
  arch: "x64",
  out: "dist-electron",
  overwrite: true,
  asar: true,
  extraResource: [".next/standalone"],
  // Include only the shell (electron/) + package.json; everything else (src,
  // node_modules, .next, .env*, docs, …) is excluded so no secrets are bundled.
  ignore: (p) => {
    if (p === "" || p === "/package.json") return false;
    if (p === "/electron" || p.startsWith("/electron/")) return false;
    return true;
  },
});

console.log("✅ Packaged →", appPaths[0]);
console.log("   For local embedded use, drop a .env (DATABASE_URL etc.) beside the exe.");
console.log("   For production, set INCOMMAND_SERVER_URL in that .env (thin client, no DB creds).");
