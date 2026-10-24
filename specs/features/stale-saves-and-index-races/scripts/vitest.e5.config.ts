import { defineConfig } from "vitest/config";
import path from "node:path";

// Experiment-only config (E-5). Run from frontend/ with
// `pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e5.config.ts`.
// Same construction as vitest.e4.config.ts; only the include glob differs.
const frontend = path.resolve(__dirname, "../../../../frontend");

export default defineConfig({
  root: frontend,
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: [
      {
        find: /^(react|react-dom|react-redux|next|@testing-library\/[^/]+)(\/.*)?$/,
        replacement: `${frontend}/node_modules/$1$2`,
      },
    ],
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: [path.join(frontend, "tests/setup.ts")],
    dir: __dirname,
    include: ["**/e5-*.test.ts", "**/e5-*.test.tsx"],
    testTimeout: 300000,
  },
});
