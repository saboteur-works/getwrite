import { defineConfig } from "vitest/config";
import path from "node:path";

// Experiment-only config: reaches this directory from frontend/ without
// editing frontend/vitest.config.ts. Run from frontend/ with
// `pnpm exec vitest run --config ../specs/features/project-json-single-lock/scripts/vitest.fr15.config.ts`.
export default defineConfig({
  root: path.resolve(__dirname, "../../../../frontend"),
  test: {
    globals: true,
    environment: "node",
    dir: __dirname,
    include: ["**/fr15-*.test.ts"],
  },
});
