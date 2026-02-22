import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    passWithNoTests: true,
    setupFiles: ["../../packages/anypost-core/src/setup.ts"],
    exclude: ["dist/**", "node_modules/**"],
  },
});
