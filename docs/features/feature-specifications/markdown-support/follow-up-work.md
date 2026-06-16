# Follow-up Work: Markdown Support

## 2026-06-16 — Task 1 (Tiptap version bump)

1. **Manual editor smoke-test in the running app (deferred).**
   The version bump to `@tiptap/*` 3.26.1 passed typecheck, the full Vitest
   suite (2006 tests), and `next build`. Automated coverage includes the
   editor-mount flow (`tests/flows.test.tsx`), but the app was not launched
   here. Before release, run `pnpm dev` (or `pnpm electron:dev`) and confirm an
   existing resource opens, renders, and autosaves unchanged. *Why deferred:*
   no interactive app session available during implementation.

2. **jsdom landmine for future editor tests (context for Task 5).**
   Tiptap 3.26's Placeholder extension (`@tiptap/extensions`) added viewport
   tracking that calls ProseMirror's `posAtCoords` → `document.elementFromPoint`
   on editor mount. jsdom does not implement `elementFromPoint`, so editor
   mounts throw in the test environment. Stubbed to return `null` in
   `tests/setup.ts` (guarded for the node test environment where `document` is
   undefined). Any new test that mounts the editor (e.g. the Task 5 source/rich
   toggle) relies on this stub — do not remove it.

## 2026-06-16 — Task 3 (custom-node Markdown handlers)

1. **`paragraphLeading` is not preserved in Markdown (deliberate).**
   `GetWriteParagraphLeading` adds a `paragraphLeading` (line-height) global
   attribute to paragraphs. It is presentational with no Markdown
   representation; preserving it would require wrapping affected paragraphs in
   inline `<p style="line-height:…">` HTML, which makes exports unusable as
   Markdown for a display-only setting. Decision: the paragraph and its text
   round-trip; the attribute is normalized to default. *This deviates from a
   literal reading of the Task 3 done-condition ("parse back to the original
   node").* It should instead be reported by the Task 4 lossy-export warning.

2. **Text color (`textStyle` color) deferred to Task 4. — RESOLVED in Task 4.**
   `textStyle` color/background/font marks have no GFM representation and are
   currently dropped on export (content text is preserved). They are outside
   Task 3's done-condition (which lists wiki links, images, leading paragraphs,
   highlight, math). Decide in Task 4 whether to (a) HTML-fallback them as
   `<span style>` or (b) drop-and-warn. Same applies to `paragraphLeading`.
   **Resolution (2026-06-16, Task 4):** chose **(b) drop-and-warn** for both
   `text-style` and `paragraph-leading` — presentational styling, content text
   preserved, surfaced via `collectMarkdownWarnings`. Revisit only if users ask
   for style-preserving exports (would need `<span style>` / `<p style>` HTML
   fallback).

3. **Flaky test: `tests/unit/media-file-route.test.ts` (test-isolation bug).**
   This file fails intermittently in the full `pnpm test:ci` run (errors:
   `ENOTEMPTY: directory not empty` on temp-dir `rmdir`, and `Unexpected end of
   JSON input`) but passes reliably in isolation. Observed across Tasks 1–3, so
   it predates this feature. Likely a parallel temp-directory setup/cleanup
   race. Worth fixing independently (unique temp dirs per test / await cleanup).
   Update (Task 8): `tests/reorder-persistence.test.tsx` and an
   `EnvironmentTeardownError` in `tests/unit/revision-manager.test.ts` were also
   seen failing intermittently in the full run (counts varied 1–3 between runs),
   both passing in isolation — same parallel-worker temp-dir/teardown flake
   family, unrelated to the Markdown work.

## 2026-06-16 — Task 5 (editor source/rich toggle)

1. **No live-editor integration test for the toggle (test-harness limit).**
   `TipTapEditor` short-circuits to a deterministic HTML mock under Vitest
   (`inTestEnv` guard) and never instantiates ProseMirror, so the actual
   in-editor toggle (click "Edit as Markdown" → textarea → "Rich text" → live
   re-render) cannot be exercised from the unit suite. Task 5 covers the
   behavior with a `MarkdownSourceView` component test plus boundary-conversion
   round-trips over the serializer functions the toggle invokes. *To close the
   gap:* a Playwright/Storybook e2e that mounts the real editor (relying on the
   `elementFromPoint` stub from Task 1) and drives the toggle end-to-end, or
   refactoring `TipTapEditor` so the real editor can mount under a dedicated
   test flag. Deferred: out of scope for the unit-test rhythm and would require
   reworking the long-standing `inTestEnv` editor mock.

2. **Manual smoke-test of the toggle in the running app (deferred).**
   The conversion path, autosave wiring, and view swap pass typecheck, the
   targeted Vitest suites, and `next build`, but the app was not launched here.
   Before release, run `pnpm dev`, open a text resource, toggle to Markdown,
   edit, toggle back, and confirm the edited structure renders and autosaves to
   the canonical revision. *Why deferred:* no interactive app session during
   implementation (same constraint noted for Task 1).

## 2026-06-16 — Task 9 (consolidated test coverage)

1. **Pre-existing temp-dir teardown flake persists (not resolved here).**
   The full `pnpm test:ci` run for Task 9 again surfaced the documented
   parallel-worker flake — `tests/unit/media-file-route.test.ts` failing with
   `ENOTEMPTY: directory not empty` on temp-dir `rmdir`, passing 5/5 in
   isolation (see Task 3 follow-up item 3). Task 9 is a Markdown-coverage task
   and deliberately did **not** fix this test-infra issue; it remains open and
   worth fixing independently (unique temp dirs per test / awaited cleanup, or
   `pool: "forks"` isolation for the FS-touching route tests).

2. **No end-to-end (Playwright/Storybook) Markdown coverage added.**
   Task 9 consolidated unit/integration coverage only. The live-editor toggle
   gap from Task 5 (item 1) is unchanged: there is still no e2e exercising the
   real ProseMirror editor through the source/rich toggle, nor an e2e driving
   the export/compile modals end-to-end (download + warning toast). The route
   handlers, serializer, and the `MarkdownSourceView` presentational component
   are covered at the unit/integration layer; the UI wiring that threads
   `format` through the shell (`page.tsx`/`AppShell`/`ShellModalCoordinator`)
   is exercised only via the modal component tests, not a full browser flow.
   *To close:* a Storybook-driven Playwright pass once the `inTestEnv` editor
   mock constraint (Task 5 item 1) is addressed.

## 2026-06-16 — "Edit as Markdown" confirmation modal (enhancement)

Added a warning modal that intercepts the "Edit as Markdown" toggle so the
switch to source mode no longer happens silently. `TipTapEditor` now computes
`collectMarkdownWarnings(editor.getJSON())` on toggle, opens
`MarkdownSwitchWarningModal` (built on the shared `ConfirmDialog`), and only
runs the existing `switchToSource` conversion if the user confirms. The modal
always states the general impact (the conversion is one-way for formatting GFM
can't represent) and, when the live document contains lossy constructs, lists
each affected construct with its occurrence count and how it is handled
(HTML fallback vs. dropped). Covered by component tests in
`tests/markdownSourceToggle.test.tsx` plus a Storybook story.

1. **TipTapEditor wiring is not unit-tested (same `inTestEnv` limit).**
   The new `requestSwitchToSource` → modal → confirm/cancel path lives in
   `TipTapEditor`, which short-circuits to the deterministic mock under Vitest
   and never mounts ProseMirror (see Task 5 item 1). The modal and its
   warning-rendering logic are tested directly via `MarkdownSwitchWarningModal`;
   the toolbar-button → modal → `switchToSource` thread is exercised only once
   the broader editor e2e gap is closed. A manual `pnpm dev` smoke-test (click
   "Edit as Markdown", confirm the modal appears, cancel keeps rich mode,
   confirm enters source mode) is recommended before release.
