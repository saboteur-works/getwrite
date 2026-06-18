import { defineConfig } from "vitest/config";
import path from "node:path";

// The CLI consumes the model layer through the single `@gw/core` barrel. Mirror
// the tsconfig path alias here so tests resolve it the same way esbuild does at
// build time.
export default defineConfig({
  resolve: {
    alias: {
      "@gw/core": path.resolve(__dirname, "../frontend/src/lib/core.ts"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**"],
  },
});
