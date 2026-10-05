// Generates public/sw.js from scripts/sw-template.js, stamping the cache name
// with a build version (git short SHA, else a timestamp). Run as `prebuild`, so
// every production build → a fresh SW cache. public/sw.js is gitignored.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

function buildVersion() {
  // Prefer an explicit CI-provided id, then git SHA, then a timestamp.
  if (process.env.BUILD_ID) return process.env.BUILD_ID.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 20);
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return `t${Date.now()}`;
  }
}

const version = buildVersion();
const template = readFileSync("scripts/sw-template.js", "utf8");
writeFileSync("public/sw.js", template.replaceAll("__SW_VERSION__", version));
console.log(`✅ Generated public/sw.js (cache = incommand-shell-${version})`);
