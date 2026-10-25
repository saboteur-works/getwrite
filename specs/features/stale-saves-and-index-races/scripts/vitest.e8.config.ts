import { defineConfig } from "vitest/config";
import path from "node:path";

// Experiment-only config (E-8): reaches this directory from frontend/ without
// editing frontend/vitest.config.ts. Run from frontend/ with
// `pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e8.config.ts`.
const frontend = path.resolve(__dirname, "../../../../frontend");

export default defineConfig({
  root: frontend,
  test: {
    globals: true,
    environment: "node",
    setupFiles: [path.join(frontend, "tests/setup.ts")],
    dir: __dirname,
    include: ["**/e8-*.test.ts"],
    testTimeout: 600000,
  },
});
