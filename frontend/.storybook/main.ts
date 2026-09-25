import path from "node:path";
import { fileURLToPath } from "node:url";
import type { StorybookConfig } from "@storybook/nextjs-vite";

const storybookDir = path.dirname(fileURLToPath(import.meta.url));
const shimsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "native-shims",
);

/**
 * Node builtins reached from the model layer, mapped to the browser-safe shims
 * ADR-021 already ships for the native build (`src/native-shims/`).
 *
 * Storybook's preview is a browser bundle, so Vite rewrites every `node:*`
 * import to `__vite-browser-external` — a stub that exports nothing. A
 * NAMED import from it is a hard build error, not a warning, which is what
 * `storage-context.ts`'s `import { AsyncLocalStorage } from "node:async_hooks"`
 * hit: the preview failed to build, so every story and the 202 Playwright e2e
 * tests that run against them could never start.
 *
 * Reusing the native shims rather than writing Storybook-specific ones keeps a
 * single browser-safe implementation per builtin. The stories render
 * components, which never enter an explicit `runInStorageContext` scope, so the
 * async-hooks shim's documented limitation — `run()` does not propagate across
 * `await` — is not exercised here; `getStore()` returning `undefined` is the
 * same fallback the native path relies on. `fs` keeps its loud throw for every
 * member but `watch`/`existsSync`, so a story that genuinely reaches the
 * filesystem fails visibly instead of appearing to work.
 */
const nodeBuiltinShims = {
  "node:async_hooks": path.join(shimsDir, "async-hooks.mjs"),
  async_hooks: path.join(shimsDir, "async-hooks.mjs"),
  "node:path": path.join(shimsDir, "path.mjs"),
  "node:fs/promises": path.join(shimsDir, "fs-promises.mjs"),
  "fs/promises": path.join(shimsDir, "fs-promises.mjs"),
  "node:fs": path.join(storybookDir, "fs-shim.mjs"),
  fs: path.join(storybookDir, "fs-shim.mjs"),
};

const config: StorybookConfig = {
  stories: ["../stories/**/*.stories.@(tsx|mdx)"],
  addons: [
    "@storybook/addon-a11y",
    "@storybook/addon-vitest",
    "@storybook/addon-mcp",
  ],
  framework: { name: "@storybook/nextjs-vite", options: {} },
  docs: {},
  viteFinal: (viteConfig) => ({
    ...viteConfig,
    resolve: {
      ...viteConfig.resolve,
      alias: { ...viteConfig.resolve?.alias, ...nodeBuiltinShims },
    },
  }),
};

export default config;
