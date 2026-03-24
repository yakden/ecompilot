// ─────────────────────────────────────────────────────────────────────────────
// EcomPilot PL — auth-service: Vitest configuration
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "src/__tests__/**",
        "src/index.ts",
        "src/db/schema.ts",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    testTimeout: 15_000,
    // Resolve workspace packages via path aliases
    alias: {
      "@ecompilot/shared-types": new URL(
        "../../packages/shared-types/src/index.ts",
        import.meta.url,
      ).pathname,
      "@ecompilot/event-contracts": new URL(
        "../../packages/event-contracts/src/index.ts",
        import.meta.url,
      ).pathname,
      "@ecompilot/shared-observability": new URL(
        "../../packages/shared-observability/src/index.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
