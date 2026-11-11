# Task 24 results: annotations panel wiring (claim rows, update actions, module off)

Environment: worktree `agent-a67c8cad82e56fbe7`, 2026-11-11, vitest 4.1.6.

## Order

`frontend/tests/component/AnnotationsPanelClaims.test.tsx` written first. First run: 14 of 17 failed (the 3 that passed assert absence, e.g. no claim row, so they passed before any wiring). After the panel and hook changes: 17 of 17 pass. One test then needed a fix of my own expected value (the active project id is the directory id `dir-1`, not `p/dir-1`). The hook tests in `tests/hooks/useAnnotations.test.tsx` (`useClaimActions`) were written after the hook, in the same sitting; the order was inverted because the hook's shape was settled while writing the panel tests.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run` on `AnnotationsPanelClaims.test.tsx`, `annotationsPanel.test.tsx`, `annotationsPanel.a11y.test.tsx`, `useAnnotations.test.tsx`, `ClaimRow.test.tsx`, `feature-101-client-no-server-imports.test.ts` (frontend) | run, 6 files, 105 passed |
| `pnpm typecheck` (frontend) | run, no errors |
| `pnpm exec eslint` on the panel, hook, stories, both test files | run, no findings |
| `pnpm exec prettier --check` on the touched files | run, clean |
| electron / cli typecheck | not run: nothing under `frontend/src/lib/models/`, `core.ts`, `cli/` or `electron/` touched |

Not run: the full vitest suite, Storybook (stories only typechecked and linted), `next build`, `build:native`, e2e, anything against the real route, a native backend or a device.

## What was built

- `AnnotationsPanel.tsx`: new optional props `resourceId` and `claimApi` (default `{ add: addClaim, update: updateClaim }` from `lib/api/claims`). With the claims module on, an annotation that has a `claim` renders as `ClaimRow` inside the existing `li` (`data-testid="annotation-item"`); everything else renders through the unchanged code path. A `SourcePicker` (Select with "No Source" first, then the project's Sources, Save Source / Cancel) opens under a row when its Link Source / Change Source control is used. The delete dialog reads "claim" for a claim. Delete uses the existing confirm and `handle.remove`; the `permanentDeletion` limit disables it with the visible reason string passed to `ClaimRow`.
- `useAnnotationsPanel.ts`: `usePanelScope` (project id, selected resource id, Sources from the store; tolerates no store), `useModuleSwitch`, `useClaimActions` (status, statement, target writes through the claim flows with the injected `ClaimFlowApi`), exported `LoadedSourceRef`.
- Stories: `Claim`, `ClaimSourced`, `ClaimSourcesOff`, `ClaimDetached`, `ClaimModuleOff` added; existing stories unchanged apart from the `PanelStory` wrapper gaining a `modules` arg (typechecked and linted only).

## Behaviour pinned by the tests (fakes only)

- Module on: a claim is a `claim-row` with the "Claim" marker, never an `annotation-row`; a non-claim beside it keeps the note controls.
- Status change: one `update(projectId, resourceId, annotationId, { status })` call; the select keeps the stored value until the write resolves, then shows the returned one. A rejected write shows its message in the panel alert and the select stays on the stored value.
- Statement edit: one call with `{ statement }`; stored text shown; focus returns to the row's Edit button. A failed save keeps the form open with the message.
- Source link: Link Source is present with Sources on and absent with it off; a chosen Source writes `{ target: { sourceId, sourceName } }`; "No Source" writes `{ target: null }` and the row reads "unsourced"; a failed relink shows text and the row keeps its prior link.
- Module off, or the module absent from `config.modules` with no override (claims default off): the claim renders on the existing note path; a body edit calls `handle.update(id, body)` and the claim client is never called.
- Detached claim: Re-attach calls `handle.reattach(id, { from, to })`. Delete asks for confirmation, then calls `handle.remove`. Under the `permanentDeletion` limit Delete is disabled with `PERMANENT_DELETION_LIMITED_REASON` visible.
- axe (jsdom, `region` rule disabled, contrast not checked) passes with a claim and the Source picker open.
- `useClaimActions` (hook tests): a stored write is laid over the entry it was written against and dropped once the handle replaces that entry; a failure returns its message and changes nothing; no resource id and an invalid status each make no write.

## Decisions and deviations

- `useModuleEnabled` was not used directly: it calls `useSelector`, which throws without a Redux Provider, and the existing panel tests mount the panel without one. `useModuleSwitch` applies the same rule (`isModuleEnabled` over `ModulesOverrideContext` or `selectActiveProjectModules`) and tolerates a missing store. No module hook was edited.
- `useAnnotations.ts` is not in this task's Files, so the handle has no claim update. The stored result is held as an override inside the panel hook, keyed to the list entry it replaced.
- Module off renders the claim through the unchanged note path, not through `ClaimRow`'s own module-off mode, so a claim that also has a `target` shows the same Source line a citation shows today.
- Resource id for claim writes: `resourceId` prop, else the store's `selectedResourceId`. `TipTapEditor.tsx` (not a declared file) passes no `resourceId`, so the running app relies on the fallback.
- Focus return after Cancel of the statement form is not implemented (`ClaimRow` owns that form and has no cancel callback); focus returns after a successful save and after the Source picker closes.

## Not verified

- That the store's selected resource always equals `annotationResourceId` in `TipTapEditor` (read, not measured). A mismatch would send a write for a resource that does not hold the claim; the core would be expected to refuse it (not run here). Task 25 or a follow-up can pass `resourceId` explicitly.
- Real route, native backend, locked-project behaviour, Storybook rendering and contrast, any device.
