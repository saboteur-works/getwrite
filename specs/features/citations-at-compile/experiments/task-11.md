# Task 11: FR-3 (c), (d): sidecar writers and a new top-level key

Measured 2026-11-14 at commit `962a910f` on branch `worktree-agent-a12ff08117f3ce795`. No production file was edited.

## Method

- Probe: one vitest file, run with `pnpm exec vitest run` from `frontend/` under the repo's vitest config. It was placed temporarily at `frontend/tests/unit/zz-probe-task11.test.ts` because the config and aliases resolve only inside the repo tree. It has been deleted. Its raw output was written to `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/f23d67b0-4986-41c8-9d32-176755fd0f75/scratchpad/task11-results.json`.
- Data: a temporary project under `os.tmpdir()` (`GETWRITE_PROJECTS_DIR` pointed at it), never the repo's `projects/`.
- Subject: a Source sidecar (`type: "source"`) seeded through `writeSidecar` with `citationFields = { referenceType: "book", title: "T", author: [{ family: "Doe", given: "J" }] }`, `userMetadata`, `attachments: []` and a content directory.
- "Survived" means the key read back from the sidecar file on disk is deep-equal (JSON) to the seeded value after the call.
- Labels: OBSERVED = run by the probe. READ = read in source, not run. A READ line is a reading until a test runs it.

## Behaviour that loses a stored value (for the owner, first)

1. OBSERVED. `writeResourceToFile` (`resource-persistence.ts`, which builds the sidecar with `buildResourceSidecarData`) overwrites the sidecar whole. Called on an existing Source id that carried `citationFields`, the key is gone afterwards (`survived: false`). Keys left in the file: `id, name, type, createdAt, orderIndex, folderId, slug, userMetadata, wordCount, attachments`. This also drops `annotations` and `updatedAt`, which are not in that key list. Probe: seed Source with key, then `writeResourceToFile(root, { id, type: "source", ... })`. `buildResourceSidecarData` given a resource object that itself carries `citationFields` also emits no such key (`citationFieldsInOutput: false`).
   - Today's callers of this writer, READ (grep of `writeResourceToFile(` and `writeResourceWithInitialRevision(`): `project-creator.ts:391`, `inbox-folder-core.ts:173` (folder), `resource-crud-core.ts:173` (create) and `:308` (upload), `resource-initial-revision.ts:65` (create path), `resource-templates.ts:321` (create from template), `trash.ts:1211` and `:1229` (folders), and the three importers. Each builds a new id or a folder, so no caller was found that runs it on an existing Source. This is a reading from the call sites; no test ran each caller. The loss therefore applies to any future caller that does, including a Task that rewrites a Source through this path.
2. OBSERVED (by design, listed so Task 17 sees it): a client cannot write or clear the key through the existing sidecar route. `updateSidecarCore` stores only `entityKind, aliases, wordCountGoal, resourceSubtype, userMetadata` (`CLIENT_WRITABLE_SIDECAR_KEYS`), so a client-sent `citationFields` is ignored and the stored value is kept. `clearKeys: ["citationFields"]` throws `InvalidClearKeysCoreError` ("Invalid clearKeys") and the key is kept. So the only writer for the key has to be the new core of FR-6 through `mutateSidecar`. This loses nothing.
3. OBSERVED: `SourceResourceSchema.parse` and `AnyResourceSchema.parse` strip an unknown key. Parsed output keys: `id, slug, name, type, orderIndex, createdAt`; `citationFieldsKept: false`, `bogusKept: false`. A parse followed by a persist would lose the key. READ: the parse sites outside `schemas.ts` are `resource-factory.ts:126` (result discarded, `res` returned) and `:200` (`validateResource`, returns parsed data), and `lib/api/schemas.ts` (response schemas, which strip, so a client reading a Source through them does not see the key unless it is declared there as well; CLAUDE.md says the same for undeclared persisted fields). No path was found that parses a stored sidecar and writes the parsed object back. Not run.

## (c) Each sidecar writer on a Source carrying `citationFields`

| Writer | Result | Label | Probe |
| --- | --- | --- | --- |
| `mutateSidecar`, callback spreads current and edits `name` | survived | OBSERVED | `sc.mutateSidecar(root, id, c => ({...c, name}))` |
| `mutateSidecar`, callback returns `SIDECAR_UNCHANGED` | survived | OBSERVED | same, returns the symbol |
| `updateSidecarCore`, `userMetadata` update | survived | OBSERVED | `updateSidecarCore(projectId, id, { userMetadata })` |
| `updateSidecarCore`, client sends its own `citationFields` | stored value kept, client value ignored | OBSERVED | `{ citationFields: { referenceType: "web-page" }, userMetadata }` |
| `updateSidecarCore`, stale whole resource without the key | survived | OBSERVED | stored sidecar minus the key sent as `updatedResource` |
| `updateSidecarCore` with `clearKeys: ["entityKind","aliases"]` | survived | OBSERVED | |
| `updateSidecarCore` with `clearKeys: ["citationFields"]` | refused (threw), survived | OBSERVED | |
| `renameResourceSidecarCore` | survived | OBSERVED | |
| `reorderResourcesCore` | survived | OBSERVED | |
| `addAnnotationCore`, `deleteAnnotationCore` | survived | OBSERVED | |
| Canonical save (`updateRevisionInPlace`) | survived | OBSERVED | revision id from `revision.ts` `listRevisions` |
| Revision restore (`setCanonicalRevision`, after `createRevision`) | survived | OBSERVED | it edits revision files only; no sidecar write in the function (READ) |
| Copy (`copyResourceCore`) | the copy carries it; original unchanged | OBSERVED | `{...sourceSidecar}` spread, then `writeSidecar` for the new id |
| Trash (`softDeleteResource`) | key in `.trash/meta/resource-<id>.meta.json`; live sidecar removed | OBSERVED | the sidecar file is moved by rename |
| Restore (`restoreResource`) | survived | OBSERVED | `{...trashedSidecar, name, folderId}` rewritten |
| Duplicate (`duplicateResource`, `resource-templates.ts` near line 527) | expected to carry it | READ, not run | `remapCopiedAnnotations(..., {...meta, id: newId})` then `writeSidecar`; same spread shape as copy |
| Importers (Scrivener, DOCX, plain text) | cannot carry it; create new resources only | READ, not run | each refuses a non-empty destination before any write and writes new sidecars through `writeResourceToFile`; `scrivener/apply-document-metadata.ts` merges through `mutateSidecar` from `existing` and edits `userMetadata` only |
| Other `mutateSidecar` writers read: `source-attachments-core.ts`, `claims-add-core.ts`, `claims-update-core.ts`, `inbox-capture-core.ts` | spread the stored sidecar | READ, not run | |
| `organizer-field-write-core.ts` | not read in full | not examined | its `mutateSidecar` callback was not opened |
| Source-attachment add, remove, replace, restore | not run | not run | needs attachment files; listed by READ above |

Note for copy and restore: they carry the key. Whether a copied Source should carry the citation fields is an owner question already settled by OQ-5 (carry it); this table records only what happens.

## (d) Metadata schema sweeps and the options migration

Setup: custom `select` field `mood` (options `calm, tense`), Source `userMetadata.mood = "calm"`, key present.

| Operation | Result | Label |
| --- | --- | --- |
| `updateFieldOptionsWithMigration` (calm normalised to peaceful) | `userMetadata.mood` became `peaceful`; `citationFields` survived | OBSERVED |
| `renameFieldKey` mood to feel | `userMetadata` became `{ feel: "peaceful" }`; key survived | OBSERVED |
| `changeFieldTypeWithMigration` feel to text | `userMetadata` unchanged; key survived | OBSERVED |
| `clearField` feel | `userMetadata` became `{}`; key survived | OBSERVED |
| `migrateProjectOnLoad` | key survived | OBSERVED |
| Custom field `title` (same name as a citation field), renamed to `heading` | `userMetadata` became `{ heading: "custom" }`; `citationFields.title` stayed `"T"` | OBSERVED |

`forEachUserMetadata` hands its callback `userMetadata` only and returns the whole sidecar to `mutateSidecar` (READ, `metadata-schema.ts` lines 315 to 341), consistent with the observations: the sweeps do not touch a top-level key. The INFERRED "not" in FR-3(d) is now an observation for the five operations above. The other sweep callers (`migrateFieldKeyInSidecars` and the remaining three `forEachUserMetadata` uses at the lines listed by grep: 590, 782, 922, 1024) were covered only through the operations named; none was run separately.

## Paired-device gate (FR-21)

- READ: `proxy.ts` calls `runGate` for every request; `gate.ts` treats any path under `/api/` as an API path and classifies it (`classify-request.ts`: `off`, `window`, `confirmed:<id>`, `not-confirmed:<reason>`). An unpaired caller gets 401 `not-paired` with header `x-getwrite-gate`. A paired or window caller reaches the route.
- READ: the five switches in `limits-store.ts` are `projectDeletion`, `unlocking`, `locking`, `encryptionChanges`, `permanentDeletion`, enforced by `checkLimit` in only these routes: `project/delete`, `project/[project-id]/trash/purge`, `resource/revision/[resource-id]` (DELETE), `annotations` (DELETE), `encryption` (POST). `app/api/resource/[resource-id]/sidecar/route.ts` imports no `checkLimit` and is `withStorageContext(handlePost)`.
- Reading, not a test run: a Source sidecar write is classified by the general `/api/` gate only, with no limit switch. FR-6's write route would be classified the same way unless it deletes something (a citation-field clear is not a permanent deletion in the five-switch sense). No gate test was run for this task.

## Not run, not claimed

- Duplicate, importers and attachment ops (READ only, above); `organizer-field-write-core.ts` writer not opened.
- A hosted tenant, an encrypted project and a running app were not used.
- `pnpm typecheck` and `pnpm lint` were not run: no production or test file remains changed.
