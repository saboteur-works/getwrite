# Task 32: engine adapter

Run on 2026-11-15, Node v24.15.0, in a worktree at base commit `2663073b`.

## Engine

Hayagriva 0.10.1 (commit `2dbaa50518f4d93b5cfc7f9f65f0a3a8dd66bd04`) compiled to WebAssembly, vendored in `frontend/src/lib/citations/engine/` (Task 56; `hayagriva_wasm_bg.wasm` SHA-256 `6143abff...acb0`), as recorded in `task-9.md`. The adapter `frontend/src/lib/citations/citation-engine.ts` is the only file importing it (`grep` for `hayagriva_wasm` outside the adapter and `engine/` gives no other import).

## Adapter facts (measured by `frontend/tests/unit/citation-engine.test.ts`, 12 tests)

- Loading: `initCitationEngine(bytes?)` memoises one load. With bytes it calls `initSync`; with none it calls the glue's default `init()`, which fetches the `.wasm` beside the glue (the browser path; NOT run here).
- The engine requires a `noteNumber` for every citation. A `null` was refused with `{"error":{"stage":"citations","message":"invalid type: null, expected usize ..."}}` and a missing one with `missing field noteNumber` (probe in the scratchpad). The adapter therefore sends `index + 1` for every occurrence and returns `noteNumber: null` for `placement: "in-text"`.
- Notes are numbered 1..n in the order of one call; the caller passes the whole manuscript in one call.
- The throwaway test style prints a shortened form for `position="subsequent"`; the test asserts the second citation of one item differs from the first. That shows the engine applies the style's position rule; it says nothing about Chicago's ibid or shortened-note forms (Task 33 style, Task 35 onwards).
- Bibliography: entries come in the style's sort order (test: `alpha` before `zed`), once per item. An item the engine gives no text (interviews, per Task 55) is returned in `omittedFromBibliography` rather than dropped silently. A duplicate item id and an occurrence with no item id return a failure before the engine is called.
- Failures: the engine's thrown JSON string maps to `{ ok: false, stage, message }` (tested for `style` and `citation`); a throw that is not that shape, or output that does not match the request (wrong citation count, empty runs, duplicate bibliography key, malformed runs), maps to `render` or `result`. `renderCitations` before load returns stage `load`.
- No network: a `fetch` spy was not called during a render with bytes supplied (test). This does not cover the no-argument `init()` path, which does fetch the same-origin asset.

## Commands and results

| Command (from `frontend/` unless noted) | Result |
|---|---|
| `pnpm exec vitest run tests/unit/citation-engine.test.ts` before the adapter existed | failed: module `citation-engine` not found (import error, 0 tests) |
| same, after the adapter, first run | 11 passed, 1 failed (in-text with `noteNumber: null`, the engine refusal above) |
| same, after the fix | 12 passed |
| `pnpm typecheck` | pass |
| `pnpm exec eslint src/lib/citations/citation-engine.ts tests/unit/citation-engine.test.ts` | clean (one naming-convention error fixed first) |
| `pnpm lint` | exit 1: 1 error, 459 warnings. The one error is `src/lib/citations/engine/hayagriva_wasm.js` ("was not found by the project service"): the vendored glue from Task 56 is not covered by `tsconfig` or the ESLint ignores. No warning or error comes from this task's files. The fix is an ESLint ignore for `src/lib/citations/engine/**`, in `frontend/eslint.config.mjs`, which is outside this task's Files |
| `pnpm --filter getwrite-electron typecheck` (both tsc passes) | pass |
| `pnpm --filter getwrite-cli typecheck` | pass |

## Not verified

- The browser path (`init()` with no bytes), Turbopack bundling of the `.wasm` asset, the Next.js server route, Electron and the Android export. Server callers must pass the `.wasm` bytes; how Task 38's route obtains them is not settled here.
- Bold, small-caps, superscript and subscript runs (the adapter copies them; no test style produces them).
- Behaviour with the real Chicago style and locale (Task 33).
