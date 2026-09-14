# Feature Spec: Trash UI — browse, restore, purge

**Feature ID:** Feature 26 (`specs/product/getwrite.features.md`)
**Requirements covered (parent):** FR-28 (`specs/product/getwrite.md`)
**User stories (parent):** US-11

## Overview

A writer who deletes a resource today has no way to see, recover, or
permanently remove it from within the app — the underlying soft-delete
model (`frontend/src/lib/models/trash.ts`) moves a resource's sidecar and
files into a project's `.trash/` directory, but nothing in the UI or its
transport layer ever lists, restores, or purges what lands there, and
deleting a folder doesn't move its contents to `.trash/` at all — it only
removes the folder from Redux/on-disk folder-tree state, orphaning its
children (a gap `getwrite-cli doctor` exists to detect). Permanent purge
today is also incomplete: it deletes only the trashed sidecar and resource
files, never the resource's revisions, its entries in the inverted index,
backlinks, or the mention index, or any authored relationship edges naming
it. This feature adds a dedicated, per-project Trash UI and completes the
underlying model so that browsing, restoring, and permanently purging
soft-deleted content — including deleted folders and everything nested
under them — is something a writer can actually do, and so that "permanently
purge" actually means the resource is gone everywhere.

## Goals

- A writer can see every soft-deleted resource and folder in the currently
  open project, and take a bulk restore, bulk permanent delete, or "Empty
  trash" action, each behind one explicit confirmation for the whole batch.
- Deleting a folder moves it and everything beneath it into Trash as a
  single restorable/purgeable unit, closing the current orphaning gap.
- Restore never blocks: a missing original parent folder falls back to the
  project root, a name collision gets a suffix, and the writer is told when
  either happened.
- Permanent purge removes a resource's trashed files, sidecar, all
  revisions, and its entries in the inverted index, backlinks, the mention
  index, and any authored relationship edges naming it — leaving nothing
  behind.
- A restored resource has its previously nullified `ResourceRef` mentions in
  other sidecars pointed back at it, with any still-dangling reference
  reported to the writer.

## Non-goals

- Any workspace-wide Trash view aggregating more than one project (resolved
  parent OQ-24) — Trash stays scoped to the currently open project.
- Automatic retention windows or auto-purge of trashed items (resolved
  parent OQ-25) — nothing leaves Trash without an explicit writer action.
- Native Android transport parity for restore/purge (resolved parent OQ-29)
  — deferred, not rejected.
- Any change to how a resource is soft-deleted in the first place (the
  delete confirmation and the initial move into `.trash/`) beyond what
  folder-delete cascade and reference-nullification recording require.
- Undo of a permanent purge — once confirmed, purge is irreversible
  (resolved parent OQ-28's "permanent" wording).

## User stories

- US-1: As a writer who deleted a resource by mistake, I want to see it in a
  Trash view and restore it, so that I recover it without a filesystem
  detour. [parent US-11]
- US-2: As a writer cleaning up a project, I want to select several trashed
  items (or empty Trash entirely) and permanently delete them in one
  confirmed action, so that I don't have to purge one item at a time.
  [parent US-11]
- US-3: As a writer who deletes a folder full of drafts, I want to have the
  whole folder and its contents land in Trash together, so that I can
  restore or purge them as one unit instead of losing track of orphaned
  children. [parent US-11]
- US-4: As a writer restoring a resource that other notes used to reference,
  I want to have those references point at it again, so that I don't have
  to manually re-link everything I once connected to it. [parent US-11]

## Functional requirements

1. FR-1: The Trash view MUST be a new "Trash" tab in `ViewSwitcher.tsx`'s
   `VIEW_OPTIONS` and `ViewName` union (resolved: OQ-1), MUST NOT be gated
   behind any feature flag (resolved: OQ-1), MUST be reachable from within an
   open project, and MUST list only that project's own `.trash/` contents —
   no cross-project aggregation (resolved parent OQ-24; `trash.ts`'s
   `trashPaths` is keyed by a single `projectRoot`). The list MUST come from
   a single route returning trashed resources and trashed folders together,
   mirroring `GET /api/projects`'s combined-shape response (resolved: OQ-10).
   [US-1]
2. FR-2: The Trash view MUST support multi-select restore, multi-select
   permanent delete, and an "Empty trash" action that purges everything in
   the project's Trash; each of these MUST require one explicit confirmation
   for the whole batch, not one per item (resolved parent OQ-25/OQ-28), and
   each MUST run per item and report a per-item outcome to the writer (e.g.
   "12 of 15 permanently deleted; 3 failed"), leaving any failed item listed
   in Trash rather than dropping it silently (resolved: OQ-9). [US-1][US-2]
3. FR-3: Deleting a folder MUST move the folder and every resource and
   nested folder beneath it into the project's Trash as a single unit, via a
   manifest capturing the folder's own descriptor plus every descendant
   folder/resource id with its `parentId` and order index at delete time
   (resolved parent OQ-26; resolved: OQ-6), rather than removing only the
   folder's own Redux/on-disk descriptor and orphaning its contents as today
   (evidence: no existing delete route or `trash.ts` function touches
   `folders/`, and the only folder-removal code today is
   `resourcesSlice.ts`'s client-side `removeResource` reducer filtering
   `state.folders`). [US-3]
4. FR-4: The Trash view MUST represent a trashed folder as a single entry
   whose former contents can be restored or permanently deleted together
   with it as one unit, never independently — a nested item's row inside a
   trashed folder is display-only, with no restore/purge control of its own
   (resolved parent OQ-26; resolved: OQ-3). [US-3]
5. FR-5: Restoring a resource or folder MUST NOT block on a missing original
   parent folder — it MUST fall back to the project root — and MUST NOT
   block on a name collision at the destination — it MUST apply a suffix,
   " (restored)" on first collision and " (restored 2)", " (restored 3)", and
   so on for each further collision (resolved: OQ-2). The UI MUST tell the
   writer when an item was relocated or renamed on restore (resolved parent
   OQ-27; evidence: `restoreResource`'s doc comment already notes "restores
   the first match" with no parent-existence or collision check). [US-1]
6. FR-6: A permanent delete (single item, multi-select, or "Empty trash")
   MUST end with everything associated with the resource gone: the trashed
   resource's files, its sidecar, all its revisions
   (`.trash/revisions/<resourceId>/v-<N>/` per resolved OQ-4, or the legacy
   `revisions/<resourceId>/v-<N>/` path per resolved OQ-12), its entry in the
   inverted index (`inverted-index.ts`'s `removeResourceFromIndex`, which
   already supports single-resource removal), its entries in backlinks and
   the mention index, and any authored relationship edges naming it as
   source or target (`entity-relationships.ts`'s
   `removeEntityRelationshipsForEntity`, which already removes edges for a
   single entity id in one `withMetaLock` call) — matching today's
   `purgeResource`, which removes only the trashed sidecar and resource
   files and touches none of the above (resolved parent OQ-28). Index,
   backlinks, and mention-index removal at this step is idempotent: it is a
   no-op when FR-16's soft-delete-time removal already ran, and otherwise
   performs the removal itself (resolved: OQ-7, OQ-8). [US-2]
7. FR-7: Purging a folder MUST apply FR-6's full sweep, in FR-18's defined
   order, to every resource that was nested under it at delete time (via
   FR-20's manifest), not only to the folder's own descriptor and manifest.
   [US-2][US-3]
8. FR-8: At delete time, the product MUST persist a record of exactly which
   other sidecars and fields `nullifyResourceRefs` cleared for the deleted
   resource, as a Zod-validated sibling file
   `.trash/meta/refs-<resourceId>.json` (already computed in-memory by
   `nullifyResourceRefs` but discarded after the call returns — evidence:
   `trash.ts`'s `nullifyResourceRefs` patches sidecars in place and returns
   `void`, with no persisted trace of what it changed). Per cleared
   reference the record MUST capture: the referencing resource's id, the
   field key, the array index within that field when the field is
   multi-valued (omitted for a scalar field), and the prior value
   `{ id, name }` before `patchRef` (`trash.ts:30-58`) cleared it (resolved:
   OQ-5). [US-4]
9. FR-9: Restoring a resource MUST use FR-8's record to re-link: every
   recorded reference still in its cleared `{ id: null, name }` state MUST
   be pointed back at the restored resource, and a reference that changed
   since deletion MUST be left alone and reported to the writer (resolved
   parent OQ-30). A resource restored with no ref record (a legacy item, per
   resolved OQ-12) MUST perform no re-linking, and the UI MUST tell the
   writer that references couldn't be restored. [US-4]
10. FR-10: FR-8's record MUST be purged along with the resource it belongs
    to, as part of FR-6's sweep, at the ordering position FR-18 defines
    (resolved parent OQ-30; resolved: OQ-8). [US-2][US-4]
11. FR-11: Trash browsing, restore, and purge MUST ship on hosted web and
    Electron desktop, both served by the same Next.js API routes; native
    Android transport parity is deferred (resolved parent OQ-29). New
    client-facing trash functions (list/restore/purge) MUST still be
    written through the existing `createTransport(httpImpl, loadNative)`
    seam with a `native-trash-backend.ts` + `.web-stub.ts` pair, matching
    every other `src/lib/api/*` module added since ADR-021 Phase 2 (e.g.
    `entity-relationships.ts`), rather than calling the HTTP transport
    directly — this keeps a future Android implementation a matter of
    filling in the native backend rather than retrofitting call sites. The
    native backend MAY reject with a clear "not supported on this platform"
    error until Android parity is built. [US-1][US-2]
12. FR-12: Every new or changed trash API route MUST resolve its project
    directory the same way the existing delete route does — via
    `resolveProjectPath`/`validateProjectId` (`project-path.ts`) against a
    client-supplied `projectId`, never a client-supplied filesystem path —
    per `docs/standards/security.md`'s no-client-supplied-paths rule.
    [US-1][US-2]
13. FR-13: A permanent-delete or "Empty trash" confirmation dialog MUST use
    the existing shared `ConfirmDialog` component
    (`frontend/components/common/ConfirmDialog.tsx`) and MUST use its
    `destructive` button styling for the confirm action, never GetWrite's
    reserved brand red for a non-destructive control (CLAUDE.md's "red is
    reserved" rule). [US-1][US-2]
14. FR-14: The Trash view and its restore/purge controls MUST meet
    `docs/standards/accessibility.md`'s WCAG 2.1 AA target: every action
    MUST be keyboard-operable, multi-select state MUST be exposed to
    assistive tech, and the confirmation dialogs MUST follow the same
    semantic dialog pattern already used by `RemoveEntityControl.tsx`.
    [US-1][US-2]
15. FR-15: Every new component added for this feature MUST ship a Storybook
    story per `docs/standards/storybook-implementation.md`, mirroring the
    existing per-component story convention (e.g. `ConfirmDialog`'s own
    stories). [US-1][US-2]
16. FR-16: Soft-deleting a resource MUST remove it from the inverted index,
    backlinks, and the mention index immediately, not only at purge time.
    Restoring a resource MUST re-index it through the normal indexing path
    (`indexer-queue.ts`'s `enqueueIndex`, whose task runs `indexResource`,
    then `computeBacklinks`/`persistBacklinks`, then mention detection and
    `persistMentionIndex`). Authored relationship edges MUST NOT be removed
    at soft delete — only at purge, per FR-6 (resolved: OQ-7). [US-1][US-4]
17. FR-17: `backlinks.ts` and `mention-index.ts` MUST each gain a new
    single-resource removal function, mirroring `inverted-index.ts`'s
    existing `removeResourceFromIndex` and `entity-relationships.ts`'s
    existing `removeEntityRelationshipsForEntity` — a load, filter/modify,
    and persist sequence run inside one `withMetaLock` call, matching each
    module's own existing load-modify-persist shape (`backlinks.ts`'s
    `persistBacklinks` and `mention-index.ts`'s `persistMentionIndex` are
    both already `withMetaLock`-wrapped). Neither module has any
    single-resource removal today — only whole-index load/persist (resolved:
    OQ-7). [US-1][US-2]
18. FR-18: The purge sweep (single item, multi-select, or "Empty trash")
    MUST run in this fixed order: (1) inverted index, backlinks, and
    mention-index entries (idempotent per FR-6/FR-16); (2) authored
    relationship edges; (3) trashed revisions; (4) trashed sidecar and ref
    record (or, for a folder, its manifest); (5) trashed content files,
    last. Every step MUST be idempotent. On a step's failure, the sweep MUST
    stop, the item MUST remain listed in Trash, and the error MUST be
    reported to the writer; re-running purge on that item MUST complete only
    the remaining steps, with no journal mechanism relied on for correctness
    (resolved: OQ-8). [US-2][US-3]
19. FR-19: A resource's revisions MUST move into `.trash/revisions/<resourceId>/v-<N>/`
    alongside its sidecar and content files at delete time, MUST move back
    to `revisions/<resourceId>/v-<N>/` on restore, and MUST be removed on
    purge as part of FR-18's step 3 — behavior `softDeleteResource` does not
    implement today (resolved: OQ-4). [US-1][US-2]
20. FR-20: A trashed folder MUST be represented by a Zod-validated manifest
    at `.trash/meta/folder-<folderId>.json`, capturing the folder's own
    descriptor plus every descendant folder and resource id together with
    its `parentId` and order index at delete time; the folder's own
    descriptor MUST move to `.trash/folders/<slug>/folder.json`. Restore
    MUST rebuild the tree from the manifest's captured `parentId`/order-index
    pairs, applying FR-5's root-fallback and collision-suffix rules to the
    top-level folder itself when needed (resolved: OQ-6). [US-3]
21. FR-21: The existing "Resource not found." fallback (`AppShell.tsx`'s
    `removeResource` dispatch and its rendered fallback state) MUST remain
    the sole behavior when an open resource is deleted or purged from this
    feature's Trash UI; this feature MUST NOT add any new open-editor-tab
    behavior for that case (resolved: OQ-11). [US-1][US-2]
22. FR-22: Trash browsing, restore, and purge MUST work against `.trash/`
    content that predates this feature — no ref record, revisions still at
    their original (non-trash) path, no folder manifest — with no migration
    step: such an item MUST be listable, restorable, and purgeable. A
    restore with no ref record MUST perform no re-linking and MUST tell the
    writer references couldn't be restored (also required by FR-9). A purge
    MUST remove revisions at the legacy path when found there instead of
    under `.trash/revisions/` (resolved: OQ-12). [US-1][US-2][US-4]
23. FR-23: This feature MUST add test coverage, including fixtures, for: a
    new-layout trashed resource/folder and a legacy-layout one (resolved:
    OQ-12) in the same suite; FR-18's per-step idempotent purge, including a
    simulated mid-sweep failure followed by a retry that completes only the
    remaining steps; cascade folder delete and restore (FR-3/FR-4/FR-20);
    restore-time collision naming through at least two collisions (FR-5);
    restore's missing-parent root fallback (FR-5); and re-linking on
    restore, including a case where a recorded reference was changed since
    deletion and MUST be left untouched and reported rather than
    overwritten (FR-9). [US-1][US-2][US-3][US-4]

## Open questions

- OQ-1 (resolved, owner decision, 2026-09-14): Trash is a new Work Area tab,
  "Trash", added to `ViewSwitcher.tsx`'s `VIEW_OPTIONS` (`:46-54`) and its
  `ViewName` union, following the existing Organizer/Timeline/Entities/Graph
  tab pattern, with keyboard operability and assistive-tech support per
  `docs/standards/accessibility.md`. Verified in code: `AppShell.tsx`'s
  `disabledViews` computation (`:1222-1257`) gates only the Entities and
  Graph tabs behind the `entities` feature flag (`isEntitiesEnabled`); the
  Trash tab is deliberately NOT gated behind any feature flag — FR-28 adds
  none. — Impact: FR-1, FR-15.
- OQ-2 (resolved, owner decision, 2026-09-14): A restore-time name collision
  appends " (restored)"; a further collision at that resulting name appends
  " (restored 2)", then " (restored 3)", and so on, incrementing until the
  name is free. — Impact: FR-5.
- OQ-3 (resolved, owner decision, 2026-09-14): A trashed folder restores and
  purges only as a whole unit — an item nested inside it cannot be restored
  or purged on its own. The Trash view shows the folder's former contents
  nested inside it for visibility, but those nested rows are display-only
  and carry no independent restore/purge control. — Impact: FR-4, FR-5.
- OQ-4 (resolved, owner decision, 2026-09-14): A resource's revisions move
  into `.trash/` alongside its sidecar and content files at delete time, at
  `.trash/revisions/<resourceId>/v-<N>/` (mirroring the original
  `revisions/<resourceId>/v-<N>/` layout defined by `revision.ts`'s
  `revisionsBaseDir`/`revisionDir`). They move back to that original path on
  restore and are removed from `.trash/` on purge. Today `softDeleteResource`
  does not move revisions at all (evidence: `trash.ts` never imports from
  `revision.ts`/`revision-manager.ts`), so this is new behavior, not a
  preserved one. — Impact: FR-6, FR-19.
- OQ-5 (resolved, owner decision, 2026-09-14): FR-8's nullified-reference
  record is a sibling file, `.trash/meta/refs-<resourceId>.json`,
  Zod-validated at the filesystem boundary in `schemas.ts`, created at delete
  time, moved alongside the resource on restore (or, for a legacy item, simply
  absent — see OQ-12), and removed at purge. Verified in code: `trash.ts`'s
  `patchRef` (`:30-58`) replaces a matching `ResourceRef` value
  `{ id: deletedId, name }` with `{ id: null, name }`, patching a scalar field
  directly and an array field (a multi-valued `resource-ref` field)
  element-by-element. The record's minimum content, per cleared reference, is:
  the referencing resource's id, the field key, the array index within that
  field when the field is multi-valued (omitted for a scalar field), and the
  prior value `{ id, name }` before it was cleared. — Impact: FR-8, FR-9,
  FR-10.
- OQ-6 (resolved, owner decision, 2026-09-14): A trashed folder is
  represented by a manifest, `.trash/meta/folder-<folderId>.json`,
  Zod-validated, holding the folder's own descriptor plus every descendant
  folder and resource id together with the `parentId` and order index each
  held at delete time. Verified in code: `resource-persistence.ts`'s
  `resolveFolderDir` (`:60-79`) confirms folders persist flat, one
  `folders/<slug>/folder.json` per folder, with tree hierarchy expressed only
  through each folder's own `parentId` field — there is no on-disk nesting to
  move. The folder's own descriptor moves to `.trash/folders/<slug>/folder.json`
  (mirroring the original `folders/<slug>/` layout). A cascade delete moves
  every descendant resource (content, sidecar, revisions, and ref record, per
  OQ-4/OQ-5) into Trash under that manifest. Restore rebuilds the tree from
  the manifest's captured `parentId`/order-index pairs; OQ-27's root-fallback
  and this spec's OQ-2 collision-suffix rules apply to the top-level folder
  itself if its own original parent no longer exists or its name collides. —
  Impact: FR-3, FR-4, FR-7, FR-20.
- OQ-7 (resolved, owner decision, 2026-09-14): Removal happens at delete
  time, not only at purge. Soft-deleting a resource removes it from the
  inverted index, backlinks, and the mention index immediately; restoring it
  re-indexes it through the normal indexing path (`indexer-queue.ts`'s
  `enqueueIndex`, whose task runs `indexResource`, then
  `computeBacklinks`/`persistBacklinks`, then mention detection and
  `persistMentionIndex`, together — `:176-231`). Authored relationship edges
  are NOT removed at soft delete — consistent with the product spec's edge
  rules, so restore needs no edge reconstruction — and are removed only at
  purge. — Impact: FR-6, FR-7, FR-16, FR-17.
- OQ-8 (resolved, owner decision, 2026-09-14): The purge sweep runs in this
  fixed order: (1) inverted index, backlinks, and mention-index entries —
  idempotent, a no-op when OQ-7's soft-delete-time removal already ran; (2)
  authored relationship edges; (3) trashed revisions; (4) trashed sidecar and,
  for a resource, its ref record (or, for a folder, its manifest); (5)
  trashed content files, last. Every step MUST be idempotent. On a step's
  failure, the sweep stops, the item stays listed in Trash, and the error is
  reported to the writer; re-running purge on that item completes only the
  remaining steps. There is no journal mechanism — each step's own
  idempotency is what makes a safe retry possible, since no cross-file
  transaction primitive exists in this codebase (`io.ts` offers only
  per-file atomic writes via `atomicWriteFile`). — Impact: FR-6, FR-7, FR-18.
- OQ-9 (resolved, owner decision, 2026-09-14): A batch action (multi-select
  delete, multi-select restore, or "Empty trash") is confirmed once for the
  whole batch, then runs per item, and reports per item — e.g. "12 of 15
  permanently deleted; 3 failed" — with any failed item left listed in Trash
  rather than silently dropped. The same per-item report applies to
  multi-select restore. `withMetaLock` is keyed by `projectRoot`
  (`meta-locks.ts:16`), so per-item locking inside a batch serializes exactly
  the same way one lock held for the whole batch would; this follows
  `removeEntityRelationshipsForEntity`'s (`entity-relationships.ts:229-246`)
  one-call-per-item precedent rather than a new batch-lock primitive.
  `write-barrier.ts` needs no additional plumbing for this: its check already
  lives inside `io.ts`'s mutating wrappers (`write-barrier.ts:21-27`), and
  `trash.ts` already goes through `./io`, so every per-item trash write
  already passes through the existing barrier. — Impact: FR-2, FR-6, FR-7.
- OQ-10 (resolved, owner decision, 2026-09-14): A single list route returns a
  project's trashed resources and trashed folders together, in one shape,
  mirroring `GET /api/projects` (`app/api/projects/route.ts:11-16`). It
  resolves the project directory from a server-validated `projectId`
  (`project-path.ts`), never a client-supplied path. — Impact: FR-1, FR-11,
  FR-12.
- OQ-11 (resolved, owner decision, 2026-09-14): No new behavior is added.
  When an open resource is deleted or purged, the existing "Resource not
  found." fallback applies unchanged: `AppShell.tsx` dispatches
  `removeResource` without clearing selection (`:1124-1131`) and renders the
  existing fallback state (`:1438-1448`). — Impact: FR-1, FR-2, FR-6, FR-21.
- OQ-12 (resolved, owner decision, 2026-09-14): Legacy `.trash/` content
  (soft-deleted before this feature existed — no ref record, revisions still
  at their original `revisions/<resourceId>/` path, no folder manifest) MUST
  be listable, restorable, and purgeable by the new Trash UI, with no
  migration step. A missing ref record means restore performs no re-linking,
  and the UI's restore notice states that references couldn't be restored.
  Purge removes revisions at the legacy path when found there instead of
  under `.trash/revisions/`. Legacy-layout fixtures are part of this
  feature's test requirements. — Impact: FR-1, FR-5, FR-6, FR-9, FR-22,
  FR-23.

## Out of scope (deferred)

- Any workspace-wide Trash view (resolved parent OQ-24).
- Automatic retention windows or scheduled auto-purge of trashed items
  (resolved parent OQ-25).
- Native Android transport parity for Trash browsing, restore, and purge
  (resolved parent OQ-29) — `native-trash-backend.ts`'s real implementation,
  not just its stub shape, is future work.
- Undo of a completed permanent purge.
- Any change to the existing soft-delete confirmation flow for a single
  resource beyond what folder-cascade (FR-3/FR-4) and reference-nullification
  recording (FR-8) require.
