// InCommand desktop shell (Electron). Wraps the same Next.js build:
//   • dev  (ELECTRON_DEV=1): loads the running `next dev` server at :3000.
//   • prod: spawns the bundled Next *standalone* server as a Node child process
//           (via ELECTRON_RUN_AS_NODE so no separate Node runtime is needed),
//           waits for it, then loads it in a native window.
const { app, BrowserWindow, screen, shell } = require("electron");
const { spawn } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const DEV = process.env.ELECTRON_DEV === "1";
const HOST = "127.0.0.1";

/** Best-effort load of a .env file into an object (KEY=value lines). */
function loadEnvFile(file) {
  const out = {};
  if (!file || !existsSync(file)) return out;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

// Config source: packaged → a `.env` beside the executable (operator-provided);
// dev/unpackaged → the project's .env.local so the desktop build talks to the
// same local backend. The real process env always wins over the file.
function envFilePath() {
  return app.isPackaged
    ? path.join(path.dirname(process.execPath), ".env")
    : path.join(__dirname, "..", ".env.local");
}
const runtimeEnv = { ...(DEV ? {} : loadEnvFile(envFilePath())), ...process.env };

// ───────────────────────────────────────────────────────────────────────────
// SERVER URL — the one line to change when you deploy.
// The desktop app is a THIN CLIENT: on every launch it loads this URL, so it
// always shows the newest deployed iteration (no per-machine app update needed).
// Set INCOMMAND_SERVER_URL in the .env beside the exe to override without a rebuild.
const DEFAULT_SERVER_URL = "http://localhost:3000"; // ← change to your deployed URL (e.g. https://app.yourdomain.com)
// ───────────────────────────────────────────────────────────────────────────

// Mode:
//   • dev      — load the running `next dev` at :3000.
//   • remote   — THIN CLIENT (the default): loads the web app at DEFAULT_SERVER_URL
//                (or INCOMMAND_SERVER_URL). The server holds all DB/storage creds and
//                does auth + RLS; this client ships NO database credentials. Always
//                newest on launch; offline works via the PWA layer (SW + IndexedDB).
//   • embedded — opt-in only (INCOMMAND_EMBEDDED=1): spawn the bundled Next server
//                locally. Local dev/testing only; do NOT point its DATABASE_URL at a
//                shared prod DB — that would put DB creds on every client.
const REMOTE_URL = (runtimeEnv.INCOMMAND_SERVER_URL || DEFAULT_SERVER_URL).trim();
const EMBEDDED = runtimeEnv.INCOMMAND_EMBEDDED === "1";
const MODE = DEV ? "dev" : EMBEDDED ? "embedded" : "remote";

// The embedded app uses its own port so it never clashes with `next dev` (:3000).
const PORT = Number(runtimeEnv.PORT || (app.isPackaged ? 34115 : 3000));
const appUrl =
  MODE === "dev" ? "http://localhost:3000" : MODE === "remote" ? REMOTE_URL : `http://${HOST}:${PORT}`;

let serverProcess = null;

function standaloneServerPath() {
  // Packaged: extraResources puts the standalone output at resources/standalone.
  // Unpackaged (local prod test): .next/standalone at the project root.
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "standalone")
    : path.join(__dirname, "..", ".next", "standalone");
  return path.join(base, "server.js");
}

function startServer() {
  const serverJs = standaloneServerPath();
  if (!existsSync(serverJs)) {
    throw new Error(`standalone server not found at ${serverJs} — run \`npm run electron:prepare\` first`);
  }
  serverProcess = spawn(process.execPath, [serverJs], {
    env: {
      ...runtimeEnv,
      ELECTRON_RUN_AS_NODE: "1", // run the Electron binary as plain Node
      NODE_ENV: "production",
      PORT: String(PORT),
      HOSTNAME: HOST,
    },
    stdio: "inherit",
  });
  serverProcess.on("exit", (code) => {
    console.log(`[incommand-server] exited with ${code}`);
    serverProcess = null;
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.destroy();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - start > timeoutMs) reject(new Error("timed out waiting for server"));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

// The UI is designed comfortably at ~1440x900. On smaller screens we zoom the
// whole UI down so nothing is clipped; we never zoom past 1 (big screens use the
// extra space natively). MIN_ZOOM floors it so text stays legible.
const BASE_WIDTH = 1440;
const BASE_HEIGHT = 900;
const MIN_ZOOM = 0.6;

/** Auto-scale the UI to whichever display the window is currently on. */
function applyScaling(win) {
  if (!win || win.isDestroyed()) return;
  try {
    const display = screen.getDisplayMatching(win.getBounds());
    const { width, height } = display.workAreaSize;
    const factor = Math.min(1, width / BASE_WIDTH, height / BASE_HEIGHT);
    const zoom = Math.max(MIN_ZOOM, Math.round(factor * 100) / 100);
    win.webContents.setZoomFactor(zoom);
    console.log(`[incommand-desktop] display ${width}x${height} → UI zoom ${zoom}`);
  } catch {
    /* no display info (e.g. headless) — keep default zoom */
  }
}

async function createWindow() {
  // Only the embedded mode runs a local server; dev + remote just load a URL.
  if (MODE === "embedded") {
    startServer();
    await waitForServer(appUrl);
  }
  console.log(`[incommand-desktop] mode=${MODE} → ${appUrl}`);

  // Open no larger than the current display's usable area so nothing spills off
  // the screen on smaller laptops.
  let bounds = { width: BASE_WIDTH, height: BASE_HEIGHT };
  try {
    const wa = screen.getPrimaryDisplay().workAreaSize;
    bounds = { width: Math.min(BASE_WIDTH, wa.width), height: Math.min(BASE_HEIGHT, wa.height) };
  } catch {
    /* keep defaults */
  }

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 800,
    minHeight: 560,
    center: true,
    backgroundColor: "#0b1220",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Command tool: keep live telemetry/comms WebSockets and presence timers
      // running when the window is unfocused/minimised. Chromium's default
      // background throttling suspends them, so a backgrounded wrapper would stop
      // seeing bodycam check-ins (and go stale) while a foreground browser stays live.
      backgroundThrottling: false,
    },
  });

  // Belt-and-braces: some Chromium builds still throttle a fully-occluded window's
  // timers. Disabling render backgrounding keeps the renderer (and its sockets) hot.
  win.webContents.setBackgroundThrottling(false);

  // Electron denies camera/mic/etc. by default — unlike a browser, there's no prompt.
  // Grant the permissions the app actually uses (LiveKit bodycam/webcam video, the QR
  // scanner's camera, geolocation, notifications) so those features work in the wrapper
  // exactly as they do in a browser. Scoped to the app's own origin; everything else is
  // denied, and external links already open in the OS browser (setWindowOpenHandler).
  const GRANTED = new Set([
    "media", // getUserMedia — camera + microphone (LiveKit, QR scanner)
    "mediaKeySystem",
    "geolocation",
    "notifications",
    "fullscreen",
    "clipboard-sanitized-write",
    "pointerLock",
  ]);
  const appOrigin = (() => {
    try {
      return new URL(appUrl).origin;
    } catch {
      return null;
    }
  })();
  const safeOrigin = (u) => {
    if (!u) return null;
    try {
      return new URL(u).origin;
    } catch {
      return null;
    }
  };
  const originAllowed = (origin) => !appOrigin || !origin || origin === appOrigin;
  const ses = win.webContents.session;
  ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
    callback(GRANTED.has(permission) && originAllowed(safeOrigin(details && details.requestingUrl)));
  });
  ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
    return GRANTED.has(permission) && originAllowed(requestingOrigin);
  });

  win.once("ready-to-show", () => {
    applyScaling(win);
    win.show();
  });
  // Re-scale after (re)loads and when the window moves to another monitor or a
  // display's resolution changes.
  win.webContents.on("did-finish-load", () => applyScaling(win));
  win.on("moved", () => applyScaling(win));
  const onDisplayChange = () => applyScaling(win);
  screen.on("display-metrics-changed", onDisplayChange);
  win.on("closed", () => screen.removeListener("display-metrics-changed", onDisplayChange));

  // Open target=_blank / external links in the OS browser, not a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  await win.loadURL(appUrl);
}

app.whenReady().then(createWindow).catch((e) => {
  console.error("[incommand-desktop] failed to start:", e);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("quit", () => {
  if (serverProcess) serverProcess.kill();
});
