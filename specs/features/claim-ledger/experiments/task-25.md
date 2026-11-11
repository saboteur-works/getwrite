# Task 25 results: registry wiring, Claims tab and editor gating

Environment: worktree `agent-aa7638d97ac9fd422`, 2026-11-11, vitest 4.1.6.

## Order

Tests first: two extra cases in `frontend/tests/unit/module-ui-registry.test.tsx` and new `frontend/tests/component/claims-registry-wiring.test.tsx`. First run: 11 failed, 19 passed (claims entry absent from `UI_MODULE_VIEWS`; no Claims tab; no "Mark a claim" group). After `uiRegistry.ts` and `AppShell.tsx` were edited: 3 of 14 wiring tests failed, all test-side (a `listClaims` argument that used the store project id where the hook passes the directory id `claims-wiring`; two `getByRole("status")` queries that matched Sources' status region too). Fixed in the test; then 14 of 14.

## Commands (frontend)

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/component/claims-registry-wiring.test.tsx` | run, 14 passed |
| `pnpm exec vitest run tests/unit/module-ui-registry.test.tsx tests/work-area-view-gating.test.tsx tests/citationControl.test.tsx tests/a11y/citationControl.a11y.test.tsx tests/component/claims-registry-wiring.test.tsx tests/unit/core-import-graph.test.ts` | run, 123 passed, 1 failed (see Existing test that must change) |
| `pnpm typecheck` | run, no errors (one earlier run flagged implicit-any in my test, fixed) |
| `pnpm exec eslint` on `uiRegistry.ts`, `AppShell.tsx`, the wiring test, `module-ui-registry.test.tsx` | 0 errors; 1 warning (`UiSlotKind` unused in `uiRegistry.ts`, line existed before this task) |
| `pnpm exec prettier --write` on the same files | applied |
| `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-cli typecheck` | not run: nothing under `frontend/src/lib/models/` touched |

Not run: the full vitest suite, `next build`, `build:native`, e2e, Storybook, any device.

## What changed

- `frontend/components/Modules/uiRegistry.ts`: a `claims` entry after `sources`, with a `view` slot (label and id from the manifest, `ListChecks` icon, not `alwaysEnabled`) and a `citationControl` slot. No new slot kind (`UI_SLOT_KINDS` unchanged, pinned by the existing test). Local, non-exported components: `ClaimsViewHost` (`useClaimList` into `ClaimsView`, plus `UnlockModal` from the hook's `unlock` handle and the unlock-at-desktop text) and `MarkClaimHost` (tracks the editor selection through `selectionUpdate`, captures `{from, to}` for the write, calls `addClaimFlow` with an adapter `{ add: addClaim, update: updateClaim }`, calls `onStored` after a stored claim, including the stored-but-not-marked case, and throws the flow's message so `MarkClaimControl` shows it).
- `frontend/components/Layout/AppShell.tsx`: `claims` added to the two hard-coded `view === "trash" || view === "sources"` conditions (the render guard and the module-slot render). Nothing else in the shell changed.
- `CitationControlSlot.tsx`: not edited. Task 1 (g) read it as generic, and the wiring test confirms it: with both modules on, the Sources group and the Mark a claim group both render.

## Observed by the tests

- `UI_MODULE_VIEWS` ids: `trash`, `sources`, `claims`; the claims view id and label equal the manifest's; the id is assignable to `ViewName`.
- Claims tab is absent by default (the manifest default is off), appears immediately after Sources with `claims: true`, opens `ClaimsView` fed by `listClaims("claims-wiring")`, and a rejected read shows "Try again" and not "There are no claims."
- With the module switched off while the Claims tab is open, the tab disappears and the Edit tab is active (the existing generic fall-back).
- Opening a claim: the Edit tab becomes active, the resource is selected, and with the active-editor registry holding an editor whose document carries the `annotation` mark, the editor selection becomes the marked passage.
- Editor gating through `CitationControlSlot`: both modules on shows both groups; Sources off shows only "Mark a claim"; claims off or unset shows none; a Source resource and an unknown resource id show none. A read-only editor never mounts the slot (`TipTapEditor.tsx` condition `!readonly`, read, not re-tested here).
- Mark as claim: `addClaim` is called with project directory id, resource id, statement and the selected text as quote; the document then holds the mark with the same id; `onStored` is called once. A rejected write leaves no mark and the control shows "The claim could not be saved. write refused".

## Existing test that must change (not edited here; not in this task's Files)

`frontend/tests/citationControl.test.tsx`, test "the Sources module registers a citation control and nothing else does", asserts the module ids with a `citationControl` equal `["sources"]`. It now receives `["sources", "claims"]`. This is a direct consequence of the task's required registration, not of a Sources change. Observed: this is the only failure in the six files run. The owner of that file (or the lead) should update the expected list to `["sources", "claims"]`.

## Decisions, assumptions and gaps

- Gating to "text" is `type === "text"` from the store's resource list; a Source resource gets no Mark as claim (Sources keeps its own excerpt control). A resource missing from the store also gets none (fail closed).
- Focus after open: `focusClaimPassage` polls `getActiveEditor` and `getActiveEditorResourceId` every 50 ms for up to 3 s, then selects, scrolls to and highlights the passage. If the editor never settles on that resource it does nothing further (the resource is still open). Not observed in a real editor.
- Detached claims: `useClaimList.open` reports `passage: "detached"`; this task opens the resource and does not focus anything. It does not open the annotations panel, so the detached state is not itself shown by this wiring; the panel (Task 24) lists it as detached when the writer opens it. List rows pass `isDetached: false` because the list read does not inspect documents.
- The view holds its own filter state (Task 22), so the host passes all live claims, not the hook's `visibleClaims`; the hook's filter state is unused by this wiring.
- `uiRegistry.ts` now imports `ClaimsView`, `useClaimList`, `claim-flows`, `api/claims`, store hooks and `UnlockModal`; it still lives outside `lib/models` and the worker graph (the graph test passes).

## Not verified

No Storybook, no `next build` or `build:native`, no real route or native backend behind `addClaim`/`listClaims`, no real TipTap editor in the running app (the hook-host scroll and highlight were only exercised on a standalone jsdom editor), no touch or device behaviour, no axe run on the composed tab.
