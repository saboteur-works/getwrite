# Sources and attachments (developer)

Feature 102, Part 2. Spec: [specs/features/folder-metadata-sources-core.md](../../specs/features/folder-metadata-sources-core.md) (FR-18 to FR-32, FR-38). Measurements and the type-branch survey: [experiments.md](../../specs/features/folder-metadata-sources-core/experiments.md). Folder metadata is in [folder-metadata.md](folder-metadata.md).

A Source is a resource of type `source` (`ResourceTypeSchema`, `ResourceType`): one rich-text body, stored as a text resource's body is, plus an ordered list of image and audio attachments. This feature adds no Sources view, panel, excerpts, citations or module seam. The minimum interface is "Source" in the resource tree's create control (`CreateResourceModal.tsx`), the existing editor for the body, and one "Attachments" section in the metadata sidebar.

## What a Source is

- Body: `content.txt` and `content.tiptap.json`, with a canonical revision `v-1` created with the Source (`resource-initial-revision.ts`) and the rules of [revisions.md](revisions.md). Revisions cover the body only: adding, replacing, removing or reordering an attachment creates no revision and copies no bytes into `revisions/`.
- Sidecar: `meta/resource-<id>.meta.json` like any resource, through `sidecar.ts`. The attachment list is the top-level `attachments` array of that sidecar (see [sidecars.md](sidecars.md)). A Source can carry a `resourceSubtype`, and a custom field can be scoped to it with `appliesTo` (see [resource-subtype.md](resource-subtype.md)).
- Create, open, rename, move, delete and Trash go through the generic resource routes and cores (`resource-crud-core.ts`, `resource-factory.ts`, `trash.ts`).
- Text rule (FR-38): a Source is handled as a text resource by full-text search and snippets, backlinks, word counts, the status roll-up, the writing log, the compile outline, previews, spell check, prose diagnostics and mention detection. Annotations are allowed on a Source body. Templates stay text-only: creating a template from a Source, or a Source from a template, is refused. The per-site dispositions are in experiments.md, "Part 2 FR-18 survey" and "Task 32 dispositions". `cli/src/commands/reindex.ts` still hard-codes `type: "text"`; Source reindex through the CLI is not covered yet and is tracked by Task 39.

## Attachments

- Core `source-attachments-core.ts`: `listAttachmentsCore`, `addAttachmentCore`, `reorderAttachmentsCore`, `removeAttachmentCore`, `replaceAttachmentCore`, `restoreTrashedAttachment`. Only a Source is accepted (`AttachmentResourceTypeError`).
- Storage: files live in the Source's own `resources/<id>/` directory under server-generated names `attachment-<uuid>.<ext>`; the client file name is kept as `originalName` for display and is never part of a path. An entry is `AttachmentEntrySchema` (`id`, `fileName`, `originalName`, `mime`, `size`, `addedAt`). Attachments are not tree items and do not appear in the resource list.
- The list is written only by this core, only through `mutateSidecar`, and is not among the keys `updateSidecarCore` stores, so a whole-sidecar client write cannot change it.
- Validation (`media-validation.ts`): `validateMediaFile` (extension and MIME maps, video refused, 100 MB per file `MAX_MEDIA_FILE_BYTES`, allowlisted extension, `isPlainFileName`) plus `validateAttachmentFile`, a magic-byte check applied to attachments only. Existing image and audio uploads are unchanged. Refusal texts shared by every transport are in `ATTACHMENT_MESSAGES`. At most 500 attachments per Source (`MAX_ATTACHMENTS_PER_SOURCE`); the 501st add is refused with `AttachmentLimitError` and nothing is stored. There is no total-size cap.
- Remove and replace move the previous file to Trash as the `attachment` item kind (below). Restore appends it to the end of the list.
- Route `app/api/project/source-attachments/route.ts`, in `withStorageContext`: `GET ?projectId=&resourceId=` list; `POST` multipart add; `PUT` multipart replace; `PATCH { orderedIds }` reorder; `DELETE { attachmentId }` remove. Validation, limit, type and order errors are 400; an unknown Source or attachment is 404; a restore whose Source is in Trash or purged is 409; locked-access errors propagate for 401/409 mapping. Restore has no route of its own: an attachment-kind Trash id goes through the Trash restore route (`restoreOneCore`).
- Client `lib/api/source-attachments.ts` on `createTransport`; native `store/transport/native-source-attachments-backend.ts` + `.web-stub.ts` with the `next.config.mjs` alias, running the same core. Native restore is the native Trash backend's `restore`. Lock parity with the server is reasoned from the shared core, not run.
- UI: `components/Sidebar/SourceAttachmentsSection.tsx`, rendered by `MetadataSidebar.tsx` for a selected Source (add, remove, replace, reorder; no preview or playback). It is the only Source-specific component.

## Trash

An attachment gets its own Trash entry, shown in the Trash tab as "Attachment of <Source name>" (a deleted or unnamed Source has a fixed fallback label). Layout, restore, purge and the locked rules are in [revisions.md](revisions.md), "Attachments and folder sidecars in Trash". Trashing and restoring a Source carries its whole directory including every attachment; purging a Source leaves no attachment file and no sidecar (tests, real directory and encrypted project).

## Compile, export, goals

- New Sources are left out of compile by default and not out of export. `seedSourceCompileExclusion` (`saved-defaults-core.ts`) adds the new id to `config.compileDefaults.excludedResourceIds`, keeping the `{ excludedResourceIds }` shape. It is called on create, copy and duplicate (`resource-crud-core.ts`) and on creating from a template (`resource-templates.ts`). Export defaults are never seeded; existing projects are not migrated; clearing the saved default brings Sources back. At the 5000-id cap, or when the stored default is unusable, the Source is still created and the response carries a visible `notice` (`SOURCE_NOT_EXCLUDED_MESSAGES`). A compile or export run given explicit ids that include a Source outputs its body; no built-in rule excludes it.
- Goals (Owner decision, 2026-11-07, built): with no goal filter, a Source's words do not count toward the project total word goal (`DataView.tsx`) or the daily word goal (`aggregateForRoot` in `writing-log-core.ts` skips writing-log entries whose document is a Source). A goal filter that selects Sources (for example by the `type` intrinsic) includes them. The per-resource word-count goal is unchanged (`WordCountGoalSection` renders no control for a Source). The Data view "Total words" overview figure is left as built and still sums every resource; it is not the goal. A new project's `config` carries no `goalFilter`. Observed values before and after the decision are in experiments.md, "Part 2 FR-28 observation".

## Entities

- Owner decision, 2026-11-07: a Source whose sidecar carries `entityKind` is an entity, keeping the existing behaviour of `backlinks.ts` and `entity-shared-metadata.ts`. This is the rule. The pinning test is Task 39 and is not written yet, so this page does not claim it as tested.
- `updateSidecarCore` refuses `entityKind` or `aliases` submitted for a Source (`SourceEntityFieldsCoreError`, HTTP 400; its docstring and the `entity-alias-table.ts` comment still say a Source is never an entity, which predates the owner decision above); `clearKeys` for them is still allowed so a stored value can be removed. A Source therefore cannot be made an entity through the sidecar route.
- Observed in the code at this commit, not run by this page: `entity-alias-table.ts` skips a sidecar of type `source` even when it carries `entityKind` (a Task 21 line, `3d9af94c`), while the entity id sets in `backlinks.ts` and `entity-shared-metadata.ts` read `entityKind` with no type check. Whether that difference matches the owner decision is for Task 39 to settle with its test.

## Encryption and locked projects

Attachment files and the folder sidecar go through the storage adapter (`io.ts`), never `node:fs` (a source-text test). Observed in tests: an attachment is an envelope at rest in an encrypted project, reads back when unlocked, and each attachment operation rejects with a locked-access error when locked. Restore and purge of any Trash entry in a locked project raise the locked error (`ProjectLockedError`, HTTP 401; `MissingProjectKeyError`, 409) instead of returning `{ ok: false }`; purging an attachment entry in a locked encrypted project is refused and keeps the files and record (Owner decisions, 2026-11-07).

## Not verified

- Android: an attachment of the largest accepted size was added and read through the native transport on an in-memory fake filesystem in Node (experiments.md, "Part 2 FR-31 (d)"). That is not a device run and says nothing about the Phase 3 baseline (about 10 MB/s, 100 MB cap); FR-31 (d) on a device is not verified, and nothing here claims the baseline holds for attachments.
- Native lock parity (native backends against the server's locks): reasoned, not run, on a device or otherwise.
- Not measured: the Trash tab and the Attachments section in a running app (the generic Trash message shows on a rejected locked request; no unlock prompt was added or tested), a real encrypted project through the HTTP routes end to end, and a restore or purge interrupted midway.
- `pnpm test:e2e` (until Task 39 reports) and `pnpm build:native`: not run for this page.
- Source reindex through the CLI and the Source-as-entity pinning test: Task 39.
