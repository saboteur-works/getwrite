// Storybook-only wrapper over the ADR-021 `node:fs` shim. It adds the named
// `promises` export that Storybook's own node-logger imports
// (`import { promises } from "node:fs"`), which reaches the browser dependency
// optimizer through addon-vitest's `optimizeDeps.include` global-setup entry.
// Kept out of src/native-shims/fs.mjs so the shipped native shim is unchanged.
export { default } from "../src/native-shims/fs.mjs";
export { default as promises } from "../src/native-shims/fs-promises.mjs";
