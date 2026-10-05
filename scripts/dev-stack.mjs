// One command to run the full InCommand app stack for a live/demo session:
//
//     npm run stack
//
// Starts the three realtime sidecar servers (which have DEMO mode on by default,
// so bodycam units move + check in and comms animate WITHOUT hardware) plus the
// Next dev server. Ctrl+C stops them all.
//
// PREREQUISITES this script does NOT do (see LAUNCH.md):
//   • Docker Desktop running + `docker compose up -d`  (Postgres, Redis, MinIO,
//     LiveKit, Mailpit) — Docker can't be started headlessly.
//   • `npm run db:migrate && npm run db:seed` at least once (idempotent).
//
import { spawn } from "node:child_process";

const procs = [
  { label: "telemetry", cmd: "npx tsx server/telemetry-server.ts", color: "\x1b[36m" }, // 8787
  { label: "paging", cmd: "npx tsx server/paging-server.ts", color: "\x1b[35m" }, //     8788
  { label: "signaling", cmd: "npx tsx server/signaling-server.ts", color: "\x1b[33m" }, // 8789
  { label: "web", cmd: "npx next dev", color: "\x1b[32m" }, //                            3000
];
const RESET = "\x1b[0m";

const children = [];
let shuttingDown = false;

function launch({ label, cmd, color }) {
  const child = spawn(cmd, { shell: true, cwd: process.cwd() });
  const tag = `${color}[${label}]${RESET} `;
  const pipe = (stream, out) => {
    let buf = "";
    stream.on("data", (d) => {
      buf += d.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) out.write(tag + line + "\n");
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code) => {
    process.stdout.write(`${tag}exited (${code})\n`);
    if (!shuttingDown) shutdown(code ?? 1);
  });
  children.push(child);
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    try {
      c.kill();
    } catch {
      /* already gone */
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

console.log("Starting InCommand stack — telemetry:8787 paging:8788 signaling:8789 web:3000");
console.log("(ensure Docker services are up: docker compose up -d)  Ctrl+C to stop.\n");
for (const p of procs) launch(p);
