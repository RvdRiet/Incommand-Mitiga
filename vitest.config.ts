import { resolve } from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Integration tests share one Postgres/Redis — don't run them in parallel.
    fileParallelism: false,
    testTimeout: 20000,
  },
});
