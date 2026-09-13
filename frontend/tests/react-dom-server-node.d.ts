/**
 * `react-dom/server.node` (and its `react-dom/server` alias) ships no
 * "types" condition in the real `react-dom` package's `package.json`
 * `exports` map, so TypeScript's `bundler` module resolution never finds
 * `@types/react-dom`'s matching `server.node.d.ts` for this subpath import
 * — a known gap in subpath-exports type resolution, not a missing
 * dependency. This ambient declaration re-exposes the same signature
 * `@types/react-dom/server.d.ts` declares, scoped to test files that need
 * `renderToString` for SSR-equivalence assertions.
 */
declare module "react-dom/server.node" {
  export {
    renderToString,
    renderToStaticMarkup,
  } from "react-dom/server.browser";
}
