// Secure bridge: contextIsolation is on, so the renderer (the web app) only sees
// this minimal, explicit API — never Node or Electron internals. The web app can
// feature-detect desktop mode via `window.incommandDesktop`.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("incommandDesktop", {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
