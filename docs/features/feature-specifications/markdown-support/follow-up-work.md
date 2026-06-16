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
