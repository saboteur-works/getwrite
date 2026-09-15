# Feature Spec: Trash UI Follow-ups

**Feature ID:** Follow-up to Feature 26 (`specs/product/getwrite.features.md`)
**Requirements covered (parent):** FR-28 (`specs/product/getwrite.md`)
**Source:** `specs/features/trash-ui/follow-up-work.md` (owner-scoped to FU-1,
FU-2, FU-3, FU-4, FU-6, FU-8 for this spec)

## Overview

Feature 26 (Trash UI) shipped 2026-09-14 (merge `2f180cd5`, PR #200). Its
Gate 6 re-check recorded nine follow-up findings in
`specs/features/trash-ui/follow-up-work.md`. This spec addresses six of
them — a rename notice that can't show a name past the first collision
(FU-1), a folder-delete confirmation that always says "the resource"
(FU-2), two `lib/api/resources.ts` functions that bypass the app's
transport-collapse pattern and ignore failed HTTP responses (FU-3), an
now-settled claim about the "Resource not found." fallback reachability
after a Trash-tab purge (FU-4, closed by live check with no code change),
a legacy-folder edge case whose origin is now confirmed rather than fixed
(FU-6, closed by evidence with no code change), and a Trash view that
doesn't refresh when a delete happens elsewhere while the tab is open
(FU-8). At Gate 3 on 2026-09-14 the owner reviewed triage's evidence for
all five open questions this spec raised and resolved each one (see Open
questions). The remaining three findings (FU-5, FU-7, FU-9) are
owner-scoped out of this spec.

## Goals

- A restore notice states the item's true resolved name, including past
  the first name collision.
- The delete confirmation dialog uses folder-appropriate wording when the
  target is a folder.
- `deleteFolder` and `remove` in `lib/api/resources.ts` reject on a
  non-2xx response, `deleteFolder` goes through the same
  `ResourcesTransport`/`createTransport` collapse `remove` already uses,
  and a failed delete leaves the item in state and tells the writer,
  instead of removing it from state unconditionally.
- The FU-4 and FU-6 questions are settled by evidence, not assumption:
  FU-4 by a live check of what a writer actually sees when purging the
  open resource from the Trash tab (closed: the fallback isn't reachable
  through delete-then-purge, no code change); FU-6 by comparing the
  pre-Feature-26 delete code path against the claim that it never moved a
  folder to `.trash/` (closed: confirmed unreachable, no code change).
- The Trash view reflects a delete made elsewhere in the app while its own
  tab is already selected and showing.

## Non-goals

- FU-5 (replacing `trash-view.a11y.test.tsx`'s hand-written assertions with
  a real axe-backed run) — a testing-infrastructure change with its own
  dependency and suite-adoption decision, out of scope here.
- FU-7 (`ConfirmDialog`'s confirm button always using the brand-red
  `destructive` `Button` variant app-wide) — a shared-primitive
  design-system decision affecting every `ConfirmDialog` caller, not
  specific to Trash UI.
- FU-9 (two color-contrast failures under a strict axe run of `TrashView`
  Storybook stories) — a design/styling-token decision the owner already
  deferred at the Gate 6 re-check.
- Any change to the initial soft-delete confirmation's scope beyond its
  wording (FU-2) — the underlying soft-delete/restore/purge model is
  unchanged.
- Building manifest reconstruction for a legacy trashed folder (FU-6) —
  FU-6 is confirmed unreachable through the product (resolved: OQ-4), so
  no code changes for it at all.

## User stories

- US-1: As a writer restoring several same-named items from Trash, I want
  to see the name my restored item actually has, so that I can find it
  afterward.
- US-2: As a writer deleting a folder, I want to see the confirmation say
  "folder," not "resource," so that the dialog matches what I'm about to
  delete.
- US-3: As a writer whose folder delete fails (e.g. a network or server
  error), I want to be told it failed and see the folder still in the
  tree, so that it doesn't silently vanish from the UI while it still
  exists on disk.
- US-4: As a writer who permanently purges the resource I currently have
  open, I want to be shown an accurate, verified state (not an assumed
  one), so that a real gap isn't mistaken for a resolved one.
- US-5: As a writer with the Trash tab open, I want to see an item deleted
  from the resource tree appear there right away, so that I don't have to
  leave and return to the tab to see it.

## Functional requirements

1. FR-1: `RestoreResourceResult.restoredName` / `RestoreFolderResult.restoredName`
   (`frontend/src/lib/models/trash.ts`) MUST be threaded through
   `RestoreItemResult` in `frontend/app/api/project/[project-id]/trash/restore/route.ts`
   and `frontend/src/lib/api/trash.ts`, and `TrashView.tsx`'s
   `buildRestoreNotices` MUST render that resolved name instead of
   synthesizing `"${name} (restored)"`. [US-1]
2. FR-2: The delete confirmation dialog (`ShellModalCoordinator.tsx`'s
   `ConfirmDialog` for `contextAction.action === "delete"`) MUST use
   folder-appropriate wording — exactly "This will move the folder and
   everything in it to Trash. Proceed?" — when the target id names a
   folder (checked via the coordinator's existing `folders` prop, the same
   way `resourcesSlice.ts`'s `removeResource` determines `isFolder`), and
   MUST keep the existing resource wording ("This will remove the
   resource. Proceed?") otherwise (resolved: OQ-5). [US-2]
3. FR-3: `deleteFolder` (`frontend/src/lib/api/resources.ts`) MUST be
   added to `ResourcesTransport` and resolved through
   `resolveResourcesTransport`/`createTransport`, with a native-path
   implementation in `native-resource-backend.ts` that calls a
   transport-agnostic core, `softDeleteFolderCore`, for folder soft delete,
   mirroring `deleteResourceCore`'s existing pattern. `softDeleteFolderCore`
   MUST be a thin wrap — `resolveResourceProjectRootOrThrow` plus a call
   into the existing `softDeleteFolder` model function — mirroring
   `renameFolderCore`'s own shape (`resource-crud-core.ts:447-455`); the
   folder delete route and the new native backend MUST both call this core
   instead of calling `softDeleteFolder` directly (resolved: OQ-1). [US-3]
4. FR-4: Both the HTTP `remove` and the new `deleteFolder` transport
   methods MUST reject (throw) on a non-2xx response, rather than treating
   any settled `fetch` as success. [US-3]
5. FR-5: `handleResourceAction`'s `"delete"` branch (`app/(app)/page.tsx`)
   MUST NOT remove a resource or folder (and, for a folder, its
   descendants) from local/Redux state when `deleteResource`/`deleteFolder`
   rejects, and MUST surface the failure to the writer via
   `toastService.error`, consistent with the existing `toastService`
   pattern already used for success cases in the same function. [US-3]
6. FR-6: This spec's implementation MUST include a regression test for
   FR-1 through FR-5, each written to fail against the pre-fix code.
   Failure-path tests for FR-4/FR-5 (a rejected/non-2xx delete) MUST be
   simulated at the test level — e.g. a mocked `fetch` returning a non-2xx
   status, or a rejected transport call — not by causing a real delete to
   fail in a live app. [US-1][US-2][US-3]
7. FR-7: This feature's changes MUST pass `pnpm --filter getwrite-frontend
   lint` with 0 errors, `pnpm --filter getwrite-frontend typecheck`, and
   the full `pnpm --filter getwrite-frontend test:ci` suite. [US-1][US-2][US-3]
8. FR-8: Whether the "Resource not found." fallback (`AppShell.tsx`,
   FR-21/OQ-11 of `specs/features/trash-ui.md`) is reachable when the
   currently open resource is purged from the Trash tab was settled by a
   live check, not left as an unverified claim: `AppShell.tsx` renders
   `TrashView` unconditionally when `view === "trash"`, before the
   `!selectedResource` fallback check (`:1449-1463`), so the fallback
   branch cannot execute while the Trash tab itself is showing. The lead
   ran the live check in Chromium against a dev server on this branch
   (code equal to `main` at `2f180cd5`) on 2026-09-14 (resolved: OQ-3):
   with "Chapter One" open in the editor, deleting it from the tree
   cleared the selection and showed the project landing page with a
   "Resource deleted — Chapter One" toast, not "Resource not found.";
   purging Chapter One from the Trash tab then left no open resource and a
   disabled Edit tab, with no stale state shown. The "Resource not found."
   fallback is therefore not reachable through delete-then-purge, because
   soft delete already clears the selection before purge is ever possible.
   This is a recorded verification result — no implementation is required
   or made by this requirement. [US-4]
9. FR-9: FU-6's claim that a manifest-less trashed folder cannot arise
   through the product (only through manual filesystem edits) MUST be
   checked against the pre-Feature-26 delete code path and the result
   recorded as an observation. Evidence gathered for this spec: at
   `15d77139` (the commit immediately before Feature 26 merged), `page.tsx`'s
   `"delete"` branch called `deleteResource(resourceId, projectId)`
   unconditionally — no folder-specific branch existed — and only filtered
   the flat `resources` array client-side, never `folders`; the resource
   route's `"delete"` action called `deleteResourceCore`, which operates on
   a resource's sidecar/content paths, not a folder's. This is consistent
   with the follow-up-work.md claim that pre-Feature-26 folder "deletion"
   never moved anything into `.trash/` and only removed the folder from
   client-visible state. No code change is made for FU-6 by this
   requirement; the owner confirmed this closure, with no further
   hardening of FR-22's manifest-less-folder handling requested (resolved:
   OQ-4). [US-4]
10. FR-10: The Trash view MUST reflect a delete made elsewhere in the app
    (e.g. from the resource tree) while its own tab is already selected
    and mounted, without requiring the writer to leave and return to the
    tab. It MUST do so by selecting a cheap value from `resourcesSlice`
    state that changes whenever `removeResource` runs (`resourcesSlice.ts:169-178`,
    which filters both `state.resources` and `state.folders` on every
    delete) via `useAppSelector`, and refetching the trash list when that
    value changes while `TrashView` stays mounted — no new context,
    provider, or dispatched action (resolved: OQ-2). [US-5]
11. FR-11: This feature's changes MUST be re-checked by the lead in the
    real app (not only unit/integration tests) for FU-1, FU-2, FU-3 (its
    failure path via a simulated failure per FR-6), and FU-8. FU-4 needs no
    re-check here: FR-8 already records its live-check result, and no code
    change was made for it. [US-1][US-2][US-3][US-5]

## Open questions

- OQ-1 (resolved, owner decision, 2026-09-14): `softDeleteFolderCore`
  wraps the existing `softDeleteFolder` model function unchanged, mirroring
  `renameFolderCore`'s own thin-wrap shape. Verified in code:
  `renameFolderCore` (`frontend/src/lib/models/resource-crud-core.ts:447-455`)
  is exactly `resolveResourceProjectRootOrThrow` plus one call into the
  existing model function; the folder delete route
  (`frontend/app/api/folder/[folder-id]/delete/route.ts`) already does
  precisely this by calling `softDeleteFolder(projectRoot, folderId)`
  directly, and `softDeleteFolder` (`trash.ts:420-520`) already contains
  the nullify, ref-record, and soft-delete sequence per descendant — no
  additional shaping is needed to match the `*Core` naming convention.
  `softDeleteFolderCore` takes `(projectId, folderId)`, resolves
  `projectRoot` the same way `renameFolderCore` does, and calls
  `softDeleteFolder(projectRoot, folderId)`; the route and the new native
  backend both call this core instead of `softDeleteFolder` directly. —
  Impact: FR-3.
- OQ-2 (resolved, owner decision, 2026-09-14): No new context, provider, or
  action. `TrashView.tsx` selects a cheap value from `resourcesSlice`
  state that changes whenever `removeResource` runs — e.g. a derived key
  such as `state.resources.length + state.folders.length`, or the
  resource/folder count pair, computed via `useAppSelector` — and refetches
  the trash list when that value changes while the view stays mounted.
  Verified in code: `removeResource` (`frontend/src/store/resourcesSlice.ts:169-178`)
  filters both `state.resources` and `state.folders` on every delete
  (including a folder's cascaded descendants), so either array's length
  changes on every delete this feature or `page.tsx`'s existing delete
  handler dispatches. This also settles the mount-point question raised
  during triage (a refresh-token provider can't sit at `AppShell.tsx` and
  be notified from `page.tsx`'s `handleResourceAction`, since `page.tsx`
  is `AppShell`'s parent, `:521`/`:840-846`) — it's moot, since no provider
  is added. The regression test: with `TrashView` mounted, dispatching
  `removeResource` triggers a refetch and the list shows the newly trashed
  item. — Impact: FR-10.
- OQ-3 (resolved, owner decision, 2026-09-14): The lead ran FR-8's live
  check in Chromium against a dev server on this branch (code equal to
  `main` at `2f180cd5`) on 2026-09-14. With "Chapter One" open in the
  editor, deleting it from the tree cleared the selection: the Work Area
  showed the project landing page ("Select a file from the resource tree,
  or create a new resource to continue.") with a "Resource deleted —
  Chapter One" toast, not "Resource not found." Purging Chapter One from
  the Trash tab then left no open resource — the Edit tab was disabled
  (nothing selected), with no stale state shown. So the FR-21 "Resource
  not found." fallback isn't reachable through delete-then-purge, because
  soft delete already clears the selection before purge is ever possible.
  Owner rule applied: decide after the check. Nothing was found, so FU-4
  closes with this evidence and no code task — no fix is in scope for this
  spec. — Impact: FR-8, FR-11.
- OQ-4 (resolved, owner decision, 2026-09-14): FU-6 closes on the
  evidence, with no code change and no further hardening requested. The
  lead ran `git show` at `15d77139`, the last commit before Feature 26:
  `trash.ts` contained no reference to folders; `page.tsx`'s delete branch
  (line 651) called `deleteResource` and filtered only `resources`; the
  resource delete route called only `softDeleteResource`; the only other
  files mentioning `.trash` were the Scrivener and DOCX import reports. No
  pre-Feature-26 code path could put a folder into `.trash/`. FR-22's
  manifest-less-folder handling (list/restore/purge with a clear,
  non-crashing "cannot act as a unit" outcome) stays as `trash-ui.md`
  already specifies it — no hardening beyond that. — Impact: FR-9.
- OQ-5 (resolved, owner decision, 2026-09-14): The folder-delete
  confirmation wording is exactly "This will move the folder and
  everything in it to Trash. Proceed?" (superseding this spec's earlier
  draft wording). The resource wording in
  `ShellModalCoordinator.tsx:202`, "This will remove the resource.
  Proceed?", stays unchanged. The dialog picks the wording by checking
  whether `contextAction.resourceId` names a folder — the coordinator
  already receives a `folders` prop (`ShellModalCoordinator.tsx:104,180`,
  passed to `RenameResourceModal`'s `parents` and the resource picker at
  `:263`/`:307`), so the `"delete"` `ConfirmDialog`'s `description` checks
  `folders?.some((f) => f.id === contextAction.resourceId)`, mirroring the
  same `isFolder` check `resourcesSlice.ts`'s `removeResource` already uses
  (`:171`). — Impact: FR-2.

## Out of scope (deferred)

- FU-5 (real axe-backed Vitest a11y suite for Trash UI stories).
- FU-7 (`ConfirmDialog`/`Button` shared `destructive`-variant red-confirm
  design-system decision).
- FU-9 (Trash UI color-contrast failures under a strict, non-`"todo"` axe
  run).
- Any workspace-wide Trash view, automatic retention/auto-purge, or native
  Android transport parity — all already deferred by the parent
  `trash-ui.md` spec and unaffected by this follow-up work.
