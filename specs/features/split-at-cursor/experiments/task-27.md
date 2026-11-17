# Task 27: command palette Split row and Mod+Shift+Enter (FR-13, FR-19)

Results of this task only. The shortcut is Mod+Shift+Enter, the owner's choice (`task-8.md`). Mod is Cmd on macOS, Ctrl elsewhere.

## What was built

- `frontend/components/common/ResourceCommandPalette.tsx`: new optional prop `openResourceId`. When it names a resource in `resources` (and the runtime is not native, by the inline `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME !== "native"` comparison), a "Split at cursor" row follows the Capture row. It matches an empty query or a prefix of "split at cursor". Selecting it closes the palette and calls `openSplitDialog()` (`splitOpenRequest.ts`). For a resource refused by kind (image, audio, folder, Source, entity, merged) the row is disabled: `aria-disabled="true"`, meta "Unavailable", the `SPLIT_REFUSAL_MESSAGES` text as its description, a click or Enter does nothing and the palette stays open. The kind decision is `splitEligibility({ document: null, ... })`; its only non-kind answer here is `stale-cursor` (no document given), read as "not refused by type".
- `frontend/components/Layout/AppShell.tsx`: in the existing `document` keydown handler, before the K branch: Mod+Shift+Enter (no Alt, key `Enter`) calls `openSplitDialog()`. Cmd/Ctrl+K, Cmd/Ctrl+Shift+K and Escape branches are untouched.
- `frontend/components/Layout/ShellModalCoordinator.tsx`: passes `openResourceId` to the palette (4 added lines); `AppShell` passes `selectedResourceId`.
- `frontend/components/common/UI/Listbox/Listbox.tsx`: optional `disabled` on an option (`aria-disabled`, class `listbox-option--disabled`, click ignored).
- `frontend/tests/component/SplitEntryPoints.test.tsx` (new, 28 tests).

## Deviations from the declared Files

- `ShellModalCoordinator.tsx` and `Listbox.tsx` are not in the Files list. The palette cannot know the open document without a prop, and the coordinator is the only parent that renders it; the editor registry holds no id for a media resource, so a registry read could not show the row disabled for an image or audio document (FR-13 forbids hiding it). `Listbox` had no way to mark an option disabled. Both edits are additive and optional; the existing Listbox, palette and coordinator tests pass unmodified.
- No CSS was added for `listbox-option--disabled`: a disabled row looks like an enabled one apart from its "Unavailable" meta text and its description. The description is clamped to two lines by `.listbox-option-description`, so a long reason is cut visually (the full text is in the DOM and in the accessible name).
- No story was added for the new palette row (stories are not in the Files list). The existing palette stories still typecheck.

## Key handler decisions

- Native: the handler returns without acting, so the key is off on Android; the row is off by the same inline comparison.
- Focus: Cmd/Ctrl+K acts wherever focus is. Split instead does nothing when the event target is inside `[role="dialog"]`, `[role="alertdialog"]`, an `input`, `textarea` or `select`, because the split acts on the editor's cursor and the writer is typing elsewhere. The Capture dialog is such a dialog; `CaptureBox.tsx:181` also returns on `shiftKey`. Also ignored: `event.repeat`, `event.defaultPrevented`.
- `preventDefault` is called unless the host answered `no-document`. With no document open the key does nothing: the host answers `no-document` before any flush or request.

## Order of work and failing run

Tests were written first.

- Command (in `frontend/`): `npx vitest run tests/component/SplitEntryPoints.test.tsx`
- Result before implementation: `Tests 11 failed | 18 passed (29)`. The 11 failures: the Split row absent for the text document and each disabled case (the `openResourceId` prop did not exist), the two Mod+Shift+Enter handler tests, and the real-editor Mod+Shift+Enter test (opener called 0 times). The 18 passes were the cases asserting nothing happens (no row, key ignored) which hold without the feature.
- One test written in that first version (a "no document" case built on a leftover helper) was removed before the green run; the file then had 28 tests.
- Result after: `Tests 28 passed (28)`.

## TipTap observation (real editor in jsdom)

Editor: `@tiptap/core` `Editor` with `baseSchemaExtensions`, one paragraph "abcdef", cursor at the end, events dispatched on `editor.view.dom` with the AppShell mounted so the event bubbles to `document`.

- Ctrl+Enter: the editor's JSON changed (TipTap's Mod-Enter binding ran); the opener was not called.
- Ctrl+Shift+Enter: the editor's JSON was unchanged (TipTap's Mod-Enter binding did not run); the opener was called once.
- Enter and Shift+Enter: the JSON changed; the opener was not called.
- What was not observed: which command Mod-Enter ran (only that the document changed); Cmd as Mod in TipTap. `prosemirror-keymap` reads `navigator.platform` once at import and jsdom reports none, so Mod is Ctrl in this run. The AppShell handler tests use both metaKey and ctrlKey.

## Other recorded bindings (task-7.md (j))

Asserted unchanged by tests: Cmd/Ctrl+K opens only the palette, Cmd/Ctrl+Shift+K opens only Capture, Escape closes the palette, and none of them call the split opener; Enter and Shift+Enter in the editor behave as before. The existing AppShell Capture/K tests pass unmodified. Not re-tested: the Electron Cmd/Ctrl+Shift+I handler, the headless-tree hotkeys, the Timeline keys and the other Escape handlers (this task changes none of those files).

## Browser-reserved-key check on hosted web: NOT RUN

A headless run cannot show keys the browser handles before the page sees them, and real-browser runs happen only from the main checkout. Manual steps for the lead: in Chrome, Firefox and Safari on hosted web (macOS: Cmd+Shift+Enter; Windows or Linux: Ctrl+Shift+Enter), focus the editor with a document open, and run in the console `document.addEventListener("keydown", e => console.log(e.key, e.code, e.metaKey, e.ctrlKey, e.shiftKey, e.defaultPrevented))`. Press the combination. Record per browser whether the line is logged, whether the browser acts on it (menu, bookmark, full screen) and whether the split dialog opens.

## Electron default application menu check: NOT RUN

The app sets no menu of its own (`task-7.md` (j) 3), so Electron's default menu applies; its accelerators were never listed. Launching Electron aborted in the command sandbox (`task-7.md`). Probe for the lead, from the main checkout, per platform shipped: a main script that after `app.whenReady()` walks `Menu.getApplicationMenu().items` recursively and prints label, role and accelerator; check none is Cmd/Ctrl+Shift+Enter. Then, in the packaged app, press the combination in the editor and record whether the dialog opens.

## Runs (worktree, command sandbox)

- `npx vitest run tests/component/SplitEntryPoints.test.tsx`: 1 file, 28 tests passed.
- Existing, unmodified, together with the new file: `tests/component/ResourceCommandPalette.test.tsx`, the 14 `tests/appShell*.test.tsx`, `tests/captureBox.test.tsx`, `tests/components/CaptureBoxHost.test.tsx`, `tests/a11y/captureBox.a11y.test.tsx`, `tests/a11y/listbox.a11y.test.tsx`, `tests/shellModalCoordinator.test.tsx`, `tests/component/SplitHost.test.tsx`, `SplitDialog.test.tsx`, `SplitA11y.test.tsx`: 24 files, 268 tests passed.
- `pnpm --filter getwrite-frontend typecheck`: no errors.
- `pnpm --filter getwrite-frontend lint`: first run 1 error (`inOtherSurface` failed the boolean-prefix naming rule), fixed by renaming to `isInOtherSurface`; re-run on the touched files 0 errors (459 existing warnings elsewhere, none in these files).
- `pnpm --filter getwrite-frontend check:no-hex`: no violations.
- `pnpm --filter getwrite-electron typecheck` (both passes): no errors. `pnpm --filter getwrite-cli typecheck`: no errors. No model or CLI file was touched; run because the task asked.
- Not run: `next build`, Storybook build, e2e, any browser or device run, the full test suite.
- axe: run through `runAxe` on the palette with the Split row enabled and with it disabled, jsdom, `color-contrast` disabled by the helper; no violations.
