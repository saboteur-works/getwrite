import { defineConfig } from "vitest/config";
import path from "node:path";

// Experiment-only config: reaches this directory from frontend/ without
// editing frontend/vitest.config.ts. Run from frontend/ with
// `pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e67.config.ts`.
// Bare imports from this directory are aliased to frontend/node_modules.
const frontend = path.resolve(__dirname, "../../../../frontend");

export default defineConfig({
  root: frontend,
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      {
        find: /^(react|react-dom|react-redux|@testing-library\/[^/]+)(\/.*)?$/,
        replacement: `${frontend}/node_modules/$1$2`,
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: [path.join(frontend, "tests/setup.ts")],
    dir: __dirname,
    include: ["**/e67-*.test.ts"],
  },
});
