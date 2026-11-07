# Folder metadata (developer)

Feature 102, Part 1. Spec: [specs/features/folder-metadata-sources-core.md](../../specs/features/folder-metadata-sources-core.md) (FR-1 to FR-17). Measurements: [experiments.md](../../specs/features/folder-metadata-sources-core/experiments.md). The Sources half of the feature is in [sources.md](sources.md).

A folder has its own plain-text notes, custom field values and an optional subtype, stored in a folder sidecar apart from the folder's structure. Queries, smart folders, the Organizer and the Data view can show and filter folders by them.

## Storage

- The folder sidecar is `meta/folder-<id>.meta.json` (`folderSidecarFilename`, `folderSidecarPathForProject` in `sidecar.ts`; both throw on an id that is not a UUID). It holds `userMetadata` (notes at `userMetadata.notes`, field values as the other `userMetadata` keys) and the top-level `resourceSubtype`. It has no document body. `folder.json` stays structural (identity, parent, order) and holds none of these keys.
- A folder with no sidecar reads as empty notes, no field values and no subtype. A read creates nothing; the first write creates the file. A sidecar that exists but cannot be read, parsed or matched to `FolderSidecarSchema` raises `FolderSidecarUnreadableError` and is never shown as empty (`readFolderSidecar`). A locked-access error propagates unchanged.
- Folder notes are not the top-level `notes` of `ResourceBase` or `Folder`; nothing in the folder path sets or reads that key.
- The subtype is stored under the same key resource sidecars use, `resourceSubtype`, matched to `config.subtypes` with `normalizeSubtypeLabel` and stored in the list's spelling. No built-in folder subtype ships. Removing a label from the project list rewrites no folder; the stored value is shown marked "(not in the current list)", as for resources (see [resource-subtype.md](resource-subtype.md)).
- A document does not inherit its folder's notes or fields (FR-12).

## Core, route, transports

- `folder-metadata-core.ts`: `getFolderMetadataCore`, `updateFolderMetadataCore`; the only writer of the folder sidecar. The client-writable allowlist is `FOLDER_METADATA_WRITABLE_KEYS` (`notes`, `fieldValues`, `resourceSubtype`; `resourceSubtype: null` clears). A payload with any other key, a reserved field key (`notes`, `__proto__`) or a value that fails validation raises `InvalidFolderMetadataError` before any lock or write (HTTP 400, same message on native). A write takes `withMetaLock` then the sidecar's file lock and reads the stored value inside it, the order of `mutateSidecar`.
- A write for a folder id with no folder behind it raises `FolderNotFoundError` ("Folder not found"): HTTP 404 on the route, the same message on the native backend, and no sidecar is created (Owner decision, 2026-11-07). The check reads `project.json` first, then `listFolderDescriptors` (`backlinks.ts`); a `folder.json` that exists but does not parse raises `FolderDescriptorUnreadableError`. A `GET` for an unknown id still returns the empty value.
- Route `app/api/project/folder-metadata/route.ts` (`GET ?projectId=&folderId=`, `PUT { projectId, folderId, metadata }`), in `withStorageContext`; ids are UUID-validated and no client path is accepted.
- Client `lib/api/folder-metadata.ts` on `createTransport` (rejects on a network error, a non-2xx status or a malformed body; a failed read never resolves empty). Native: `store/transport/native-folder-metadata-backend.ts` + `native-folder-metadata-backend.web-stub.ts`, with the `next.config.mjs` `turbopack.resolveAlias` entry; it runs the same core. Desktop needs no Electron change: the bundled server uses the same route (a reading of `electron/src/main.ts`; a review step, not a measurement).
- Nothing logs a stored value, note or error text.

## Rename, reorder, move, Trash

- Rename, reorder and move write only `folder.json` and neither read nor lock the sidecar. Reorder holds `withMetaLock` and must not call the folder metadata core inside it (the lock is not reentrant). Tests pin that a metadata save and each operation, run at once, lose neither change (`tests/unit/folder-json-concurrency.test.ts`).
- Every `folder.json` writer writes atomically (`atomicWriteFile`): rename, reorder and move (`folder-utils.ts`), `writeResourceToFile` (used by `restoreFolder` and the importers) and project creation. None takes a per-file lock; this feature adds none, so the lost-write race between them is still open. Observed before the feature, with two such writers started at once, a change was missing from the final file in most repetitions (see experiments.md, "Part 1 FR-2 (a)"). The cause of those losses was not traced.
- Trash: `softDeleteFolder` moves `meta/folder-<id>.meta.json` to `.trash/meta/folder-<id>.meta.json` under the sidecar's file lock, and `restoreFolder` moves it back; an absent sidecar is a no-op. Purge, and so empty Trash, delete the sidecar (trashed or live) of the target and of every manifest descendant folder before the manifest is removed; an absent one is a no-op. See [revisions.md](revisions.md), "Soft-Delete (Trash)".
- Observed before the feature (FR-2 (b)): a key `FolderSchema` does not declare, added to `folder.json`, was absent after a Trash and restore round trip. The folder sidecar does not rely on `folder.json` keys. Whether that key now survives was not re-measured for this doc.

## Fields and subtype scope

One rule (`field-subtype-scope.ts`, `getFieldsOfferedOnFolder`; `isFieldVisibleForSubtype` is reused unchanged and called explicitly by the folder section):

- A custom field with no `appliesTo` is offered on every document and every folder; `appliesToFolders` has no effect on it.
- A custom field with `appliesTo` is offered on a folder only when its `appliesToFolders` is true, and then only when the folder's subtype matches `appliesTo` (through `normalizeSubtypeLabel`). On documents it is offered as before.
- Among built-in fields, only notes is offered on a folder.
- `appliesToFolders` is an optional boolean on the field definition, declared in `types.ts`, `schemas.ts` and `lib/api/schemas.ts` (that one strips undeclared keys).

## Query, smart folders, Data view, Organizer

- The query evaluator (`query-evaluate-core.ts`) loads folders through a second id source (`listFolderDescriptors`) only when the query names `type = folder` (`queryNamesFolderType`, which also looks inside `not` and `ne`). A query that does not name the folder type loads no folders, so its results are unchanged. A failed folder read is an error, never "no folders".
- Data view: folder rows appear only in smart folders whose query asks for type folder. A row shows name, subtype and the non-deprecated custom fields offered to that folder (`lib/folder-data-rows.ts`, `hooks/useFolderRowMetadata.ts`, `components/WorkArea/FolderListItem.tsx`); no notes preview and no child count. A failed folder read shows as a failure.
- Organizer: folder cards show name and subtype (`OrganizerCard.tsx`); `organizerFolderChildren.ts` lets the existing filters apply to a folder's sidecar field values.
- Metadata sidebar: selecting a folder shows `components/Sidebar/FolderMetadataSection.tsx` (notes, offered fields, subtype) in place of the old placeholder; a failed save shows as failed and keeps the writer's edit.

## Compile, export, import

- Folder notes are not read by compile or export and the dialogs offer no option for them (a test compares extracted content in each format).
- A Scrivener import creates no folder sidecar, and its report states that folder metadata (synopsis, notes and metadata) was not imported (`scrivener/import-report.ts`).

## Not verified

- Android: the folder metadata native backend was exercised only through the native transport in unit tests; no device run. Lock parity between the native backend and the server is reasoned from the shared core, not run.
- `pnpm test:e2e` and `pnpm build:native`: not run for this page; the acceptance run is Task 39 and its result is in experiments.md, "Acceptance".
- Trash restore or an import writer overlapping a metadata save, and two renames at once, were not measured.
