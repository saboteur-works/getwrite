# Task 3: FR-1 (d), (e), (m): sidecar writers, the two new `meta/` files, copied keys

Measurement task. No production file, `package.json` or lockfile was edited and nothing was committed. Two throwaway vitest files were written under `frontend/tests/unit/` (`zz-task3-probe.test.ts`, `zz-task3-probe-b.test.ts`), run, and deleted; `git status --short` was empty afterwards. They are described under "Method" and are not kept. Commit at run time: `55dad98771d3`. Node v24.15.0.

Labels: MEASURED = output of a probe run; READ = from reading source, no probe ran it.

## Contradicts the spec

None found. Items the spec's planned approach (new files `meta/lineage.json` and `meta/latest-operation.json`) is consistent with:

- MEASURED: the purge sweep, Trash, restore, `rebuildDerivedIndexes` and `reindexMissingResources` left both files byte-identical (below).
- MEASURED: both files are sealed on an encrypted project and fail closed.
- One spec "READ" row is only partly confirmed: it says a copy "spreads the whole source sidecar ... so `entityKind`, status, `wordCount` and `orderIndex` come across". Measured here: `orderIndex`, `wordCount`, `userMetadata` (status) came across unchanged. `entityKind` was not measured, because the probe cleared it from the source before copying (see Method). It is still READ.

## Behaviour that loses a stored value (for the owner, first)

1. MEASURED: `writeResourceToFile` called on the id of an existing text document replaces its sidecar whole and drops these keys: `aliases`, `annotations`, `capturedAt`, `capturedLink`, `dismissedNoiseTerms`, `splitProbe` (the probe's unknown top-level key), `updatedAt`, `wordCountGoal`. Kept: `createdAt`, `folderId`, `id`, `name`, `orderIndex`, `resourceSubtype`, `slug`, `type`, `userMetadata`, `wordCount`. (`entityKind` had been cleared earlier in the same run, so its fate is not measured.) READ: a search of `frontend/src` for callers found `writeResourceToFile` called only for new ids (project creation, `writeResourceWithInitialRevision` in create, importers) and for folder descriptors (`restoreFolder`, inbox folder). No caller on an existing text document was found. This is a grep result, not a proof; a split task must not call `writeResourceToFile` or `writeSidecar` for an existing id.
2. MEASURED, not a loss but a carry the spec may not expect: `copyResourceCore` and `duplicateResource` both copy an unknown top-level sidecar key to the new document unchanged. A lineage record kept as a sidecar key would therefore be copied onto every copy and duplicate of the new document, and no sidecar writer could prevent it. A record in a `meta/` file keyed by document id has no entry for a copy (READ: copy and duplicate write the new sidecar, the resource directory and the initial revision only).
3. MEASURED: after purge of a document, `meta/lineage.json` still holds the entry for its id. Nothing prunes it. This is a left-over entry, not a lost value; whether it matters is for the Task 15 design (what a reader does with an entry whose document is gone).

No other writer lost a stored top-level key (table below).

## Method

All probes ran from `frontend/` as `pnpm exec vitest run tests/unit/zz-task3-probe.test.ts --project node` and the same for `zz-task3-probe-b.test.ts`, each with `PROBE_OUT` set to a scratch file that the test wrote its observations to.

- Probe A used a real temporary directory project created with `createAndAssertProject` from the novel project type, with `GETWRITE_PROJECTS_DIR` pointing at a temporary directory. A text document was created with `createResourceCore`, given two annotations, and then given by `mutateSidecar` an unknown top-level key `splitProbe: {"operation":"split","n":1}` plus `entityKind`, `aliases`, `wordCountGoal`, `resourceSubtype`, `userMetadata`, `dismissedNoiseTerms`, `capturedAt`, `capturedLink`. After each writer the sidecar was re-read and `splitProbe` compared to the original value.
- Probe B used the in-memory adapter behind `workspaceEncryptionAdapter` (the fixture of `tests/unit/revision-locked-access.test.ts`), one encrypted project (marker written, key in an unlocked keyring) and one unencrypted project in the same workspace. The file was written the way other `meta/` files are written: `withMetaLock` around `atomicWriteFile` of `meta/<name>` (the shape of `saveBacklinks` in `backlinks.ts`). The existing `persistBacklinks` was written alongside as a control.
- Order matters in probe A: `updateSidecarCore(..., ["entityKind"])` ran before the copy, so the source had no `entityKind` when copied.

## (d) A new top-level sidecar key through each writer

MEASURED unless marked READ. "Survives" means the stored `splitProbe` equals the original after the call.

| Writer | Survives | How measured |
|---|---|---|
| `mutateSidecar` (callback spreads `current`) | yes | control, read back |
| `renameResourceSidecarCore` | yes | probe A |
| `updateSidecarCore`, client sends `splitProbe: "client-value"` and `userMetadata` | yes; stored value is the original, the client value is ignored | probe A |
| `updateSidecarCore`, `clearKeys: ["splitProbe"]` | refused: threw `InvalidClearKeysCoreError`; value still stored | probe A |
| `updateSidecarCore`, `clearKeys: ["entityKind"]` | yes | probe A |
| `reorderResourcesCore` | yes | probe A |
| `addAnnotationCore` | yes | probe A |
| `setNoiseTermDismissedCore` | yes | probe A |
| `updateRevisionInPlace` (canonical save, `logCanonicalSave` sidecar update) | yes | probe A |
| `setCanonicalRevision` (restore of v-2 as canonical) | yes | probe A; READ: it never writes the sidecar |
| `copyResourceCore` | carried to the copy | probe A, copy sidecar equals |
| `duplicateResource` | carried to the duplicate | probe A |
| `deleteResourceCore` (Trash) | yes; trashed sidecar holds it | probe A |
| `restoreOneCore` | yes; live sidecar holds it | probe A |
| `purgeOneCore` | the sidecar and the key are gone (trashed and live sidecar both absent) | probe A |
| `rebuildDerivedIndexes` + `reindexMissingResources` (what `reindex` runs) | yes; sidecar bytes (sha-256) unchanged | probe A |
| `writeResourceToFile` on an existing id | no, see "loses a stored value" | probe A |
| Importers (plain text run; docx and Scrivener by reading) | not applicable: `importPlainTextProject` into a non-empty directory threw `PlainTextDestinationNotEmptyError`; into a new directory it wrote sidecars with keys `createdAt, folderId, id, name, orderIndex, slug, type, userMetadata, wordCount` only. READ: the docx and Scrivener importers have the same non-empty-destination refusal (`DocxDestinationNotEmptyError`, `DestinationNotEmptyError`) and build sidecars through `writeResourceToFile`. An importer never writes an existing project's sidecar. | probe A, READ |

Writers READ only (their `mutateSidecar` callbacks return a spread or the mutated stored object, so an unknown key is kept): `nullifyResourceRefs` and `relinkResourceRefs` in `trash.ts`, `metadata-schema.ts` (field value rewrite), `organizer-field-write-core.ts` (`applyChanges` spreads `stored`), `claims-add-core.ts`, `claims-update-core.ts`, `citations-fields-core.ts`, `source-attachments-core.ts`, `inbox-capture-core.ts`, `inbox-image-capture-core.ts`, `scrivener/apply-document-metadata.ts`. Not run.

Not covered by this record: `project.json` writers (the spec places both records outside `project.json`, so no `project.json` key is planned); a full folder Trash cascade (READ: `softDeleteFolder` calls `softDeleteResource` per descendant document).

## (e) `meta/lineage.json` and `meta/latest-operation.json`

Probe B (adapter, encryption, tenancy), then probe A (purge and whole-directory readers). The same two files with the same body were used for both names.

| Question | Observed |
|---|---|
| Encrypted project: stored bytes contain the plaintext marker | false for `meta/lineage.json` (MEASURED); false for `meta/backlinks.json`, the existing meta writer (control) |
| Unencrypted project in the same workspace: stored bytes contain the marker | true (plain, as other `meta/` files) |
| Read back through the unlocked context | content equals what was written |
| Write and read with no keyring | `ProjectLockedError`, and `isLockedAccessError` true |
| Read with a keyring object that was locked | `ProjectLockedError`, `isLockedAccessError` true |
| Read with an unlocked keyring holding no key for the project | `MissingProjectKeyError`, `isLockedAccessError` true |
| Stored bytes after the failed locked write | unchanged |
| Per project | the file is under `<project root>/meta/`, path built from the project root; READ: `convert-project.ts` and `export-plaintext.ts` walk the whole project tree, so both files are converted and exported with the project |
| Per tenant | `resolveProjectRoot(id)` inside tenant A and tenant B returned two different roots (`<tenant root>/<id>`); a write in tenant A's context created the file under tenant A only and none under tenant B for the same project id. The tenant comes from `resolveProjectsDir()`, which reads the ambient storage context. |

Purge sweep, MEASURED (probe A). With both files written with entries for two document ids and sha-256 taken of each file:

- bytes identical after `deleteResourceCore` (Trash);
- bytes identical after `restoreOneCore`, a second `deleteResourceCore`, `purgeOneCore` of a document named in both files (result `ok: true`), `purgeBatchCore` with `{ all: true }`, `rebuildDerivedIndexes` and `reindexMissingResources`;
- `loadProjectFromDisk` counted the same resources with the two files present as before they were written (4 before purge, 3 after the purge of one document);
- the non-sidecar entries of `meta/` in that project were `backlinks.json`, `index`, `latest-operation.json`, `lineage.json`, `writing-log`.

READ, with the lines that matter: the purge steps in `purgeResourceSteps` (`frontend/src/lib/models/trash.ts`, `removeIndexEntries`, `removeRelationships`, `purgeRevisions`, `purgeSidecarAndRefRecord`, `purgeContentFiles`) delete per-id paths only: the inverted index, backlinks, mention index and `meta/relationships.json` entries for the id, `.trash/revisions/<id>`, `.trash/meta/resource-<id>.meta.json`, `.trash/meta/refs-<id>.json`, and `.trash/resources/<id>-*`. `purgeFolder` also removes only `meta/folder-<id>.meta.json` and the trashed manifest and descriptor. No step lists or deletes by directory prefix in the live `meta/`. Whole-directory readers of `meta/` (`loadProjectFromDisk`, `reindexMissingResources`, `scanAllFieldValues`, `nullifyResourceRefs`) filter by the `resource-` prefix and `.meta.json` suffix (READ, and the `loadProjectFromDisk` count above). So no exemption is needed in `trash.ts`; the lines that would need one if a future change added a directory sweep are the five `purgeResourceSteps` bodies and `purgeFolder`, which do not today.

Consequence for the Task 15 file list: `trash.ts` does not need to be edited (it is listed there "only if Task 3 shows" an exemption is needed).

## (m) Sidecar keys a copy carries today

MEASURED from probe A on a text document with every key below set, except `entityKind` (cleared earlier in the run). "Copy" is `copyResourceCore(..., "Doc copy")`; "Duplicate" is `duplicateResource`. Meaning is READ from the writers named.

| Key | Meaning for a writer (READ) | Copy (MEASURED) | Duplicate (MEASURED) |
|---|---|---|---|
| `id` | resource id | new id | new id |
| `name` | display name | the new name given | same as source |
| `type` | text, source, image, audio, folder | same | same |
| `createdAt` | creation time | new time | same as source |
| `orderIndex` | position among siblings | same as source (a tie with the source) | same |
| `folderId` | parent folder | same | same |
| `slug` | name slug | same | same |
| `userMetadata` | custom field values and status | same | same |
| `resourceSubtype` | subtype label | same | same |
| `wordCount` | count refreshed by canonical saves | same | same |
| `updatedAt` | last canonical save | same as source | same |
| `wordCountGoal` | per-document goal | same | same |
| `aliases` | entity aliases | same | same |
| `annotations` | the annotation array with bodies, quotes, targets, claims | same entries, new ids; 0 ids shared with the source | same; 0 ids shared |
| `dismissedNoiseTerms` | per-entity noise dismissals | same | same |
| `capturedAt`, `capturedLink` | set by Inbox capture | same | same |
| `splitProbe` (unknown key) | none | same, carried | same, carried |
| `entityKind` | declares an entity | not measured (cleared before the copy); READ: spread, so carried | not measured |

Not set in the probe, so not measured (READ in `buildResourceSidecarData` and the writers): `attachments` and `citationFields` (Source), `file`, `width`, `height`, `exif`, `durationSeconds`, `format` (media). Both functions spread the whole source sidecar.

Revisions (MEASURED): each copy has exactly one revision, v-1, canonical; the source's revisions were not copied.

## What is not established

- Whether `entityKind` is carried by `copyResourceCore` (not probed).
- Behaviour with a locked project for the sidecar writers (not probed here; the existing tests `resource-crud-core-locked-sidecar.test.ts` and `revision-locked-access.test.ts` cover the model layer).
- Several server instances sharing one project (per-process locks, as the spec already says).
- Android and the object-store adapter were not run; the encrypted-adapter result is for the in-memory adapter under `workspaceEncryptionAdapter`.
- A real-filesystem encrypted project was not run; the memory adapter was used for the bytes check.

## Tests and build

Only the two throwaway probes ran (both passed as harnesses, not as assertions of behaviour). `pnpm typecheck`, `pnpm lint`, `pnpm --filter getwrite-electron typecheck` and `pnpm --filter getwrite-cli typecheck`: not run, because no file under `frontend/src/lib/models/`, `cli/` or `electron/` was edited and the only repository file created is this record.
