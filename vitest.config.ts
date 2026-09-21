import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
    globals: true,
    setupFiles: ["__tests__/setup/test-env.ts"],
    globalSetup: ["__tests__/setup/global-setup.ts"],
    // API tests share one Prisma-backed schema; run serially to avoid clashes.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
