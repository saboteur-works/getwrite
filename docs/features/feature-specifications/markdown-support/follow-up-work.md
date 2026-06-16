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

2. **Text color (`textStyle` color) deferred to Task 4.**
   `textStyle` color/background/font marks have no GFM representation and are
   currently dropped on export (content text is preserved). They are outside
   Task 3's done-condition (which lists wiki links, images, leading paragraphs,
   highlight, math). Decide in Task 4 whether to (a) HTML-fallback them as
   `<span style>` or (b) drop-and-warn. Same applies to `paragraphLeading`.

3. **Flaky test: `tests/unit/media-file-route.test.ts` (test-isolation bug).**
   This file fails intermittently in the full `pnpm test:ci` run (errors:
   `ENOTEMPTY: directory not empty` on temp-dir `rmdir`, and `Unexpected end of
   JSON input`) but passes reliably in isolation. Observed across Tasks 1–3, so
   it predates this feature. Likely a parallel temp-directory setup/cleanup
   race. Worth fixing independently (unique temp dirs per test / await cleanup).
