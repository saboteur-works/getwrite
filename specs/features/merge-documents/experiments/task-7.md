# Task 7: FR-1 (g): what Undo needs for documents in Trash, purged or edited

Measurement task. No production file, `package.json` or lockfile was edited and nothing was committed. One throwaway vitest file (`frontend/tests/unit/zz-task7-probe.test.ts`) was written, run twice and deleted; `git status --short` was empty afterwards. Commit at run time: `ce509a987fce`. Node v24.15.0. The file is described under "Method" and is not kept.

Labels: MEASURED = output of the probe run; READ = from reading source, no probe ran it. No cause is stated for any value below.

## Contradicts the spec

None found.

## Method

The probe ran from `frontend/` as `pnpm exec vitest run tests/unit/zz-task7-probe.test.ts --project node`, with `PROBE_OUT` set to a scratch file the test wrote its observations to.

- One real temporary-directory project, created with `createAndAssertProject` from the novel project type, `GETWRITE_PROJECTS_DIR` pointing at a temporary directory. Synthetic text only.
- Target `T`: a text document with a second revision `v-2` made by `createRevision` with `metadata: { name: "Before merge", preserve: true }`, standing for the pre-merge snapshot of FR-4. Absorbed `A1` to `A4`: text documents, each given by `mutateSidecar` a `mergedMark` key (`MERGED_MARK_SIDECAR_KEY`) holding `{ targetId: T, snapshotRevisionId: <v-2 id>, date }`. The mark's shape is the probe's own (a stand-in for FR-5); no merge was run, because no merge core exists yet.
- The F120 resolver `resolveSplitLineageState` (`split-lineage-resolver.ts`) was fed the same four observations `split-undo-core.ts` `gatherFacts` makes, with the TARGET as the named document: live sidecar (`readSidecar`), snapshot among `listRevisions`, `.trash/meta/resource-<id>.meta.json` exists, `.trash/revisions/<id>` exists. A thrown read becomes `{ read: "failed" }`. The record argument carried `operation: "split"`, because the type allows only that value (see "Resolver and the merged mark").
- Trash, restore and purge were the real `softDeleteResource`, `restoreResource` and `purgeResource`. Sidecar bytes were compared by SHA-256 prefix.
- First run read a trashed revision's text from `content.tiptap.json`, which is not what is stored there (see below); the probe was corrected to read `content.bin` and re-run. Values below are from the second run.

## Resolver and the merged mark

READ: `resolveSplitLineageState` reads none of the record's fields; it uses only the four probes. The same function can therefore be called for a merged mark by giving it the target's probes. `SplitLineageRecord.operation` is typed `"split"`, so a merged mark needs the type widened or a separate input type (task 21's decision, not made here).

## The five states of FR-5, for the target, MEASURED

| Situation of the target | Resolver result | Probe |
|---|---|---|
| Live, snapshot `v-2` present | `available` | live sidecar present, `listRevisions` holds id and number |
| Live, a revision id and number that do not exist | `revision-no-longer-kept` | same probes, wrong id |
| Live, snapshot unprotected (`setRevisionPreserve` false) then `deleteRevision` | `revision-no-longer-kept` (target revisions left: `[1]`) | same probes after the delete |
| In Trash (`softDeleteResource`) | `document-in-trash` | live sidecar null; `.trash/meta` sidecar present; `.trash/revisions/<T>` present holding `v-1`, `v-2` |
| Trashed, then purged (`purgeResource`) | `document-permanently-removed` | all four probes absent |
| A trash probe fails (`EIO` supplied to the resolver directly) | `could-not-be-checked`, cause `EIO` | synthetic probe value, not a disk fault |
| Restore of the trashed target | `available`; snapshot metadata still `{ name: "Before merge", preserve: true }` | after `restoreResource` |

Also MEASURED: `deleteRevision` on the snapshot while `preserve` is true threw `Error: Protected revisions cannot be deleted. Unprotect it first.` and the revision stayed.

The `could-not-be-checked` row is not a measured disk failure; no failing read was induced on a real file.

## Absorbed document in Trash, MEASURED

After `softDeleteResource(A1)`:

- Live `readSidecar` returned `null`; the live sidecar file was absent; `listRevisions` for it returned 0 revisions.
- The trashed sidecar `.trash/meta/resource-<A1>.meta.json` existed and held `mergedMark` equal, as JSON, to the value written. Its keys were `createdAt`, `folderId`, `id`, `mergedMark`, `name`, `orderIndex`, `slug`, `type`, `userMetadata`, `wordCount`.
- `.trash/revisions/<A1>/` existed holding `v-1`, which held `content.bin` and `metadata.json`. `.trash/resources/<A1>` did not exist (ENOENT).
- The resolver for the target, while the absorbed document was in Trash, returned `available`.

After `restoreResource(A1)`: result `{ restoredName: "A1", relocated: false, renamed: false, referencesRestored: [], referencesNotRestored: "no-record" }`; the live `mergedMark` equalled the original; the sidecar bytes (SHA-256 prefix `d6035b84fe8a`) were identical before the trash and after the restore; the trashed sidecar was gone; 1 revision was listed.

## Absorbed document purged, MEASURED

After `softDeleteResource(A2)` then `purgeResource(A2)`: live sidecar `null`; `.trash/meta` sidecar absent; `.trash/revisions/<A2>` absent; `revisions/<A2>` absent; `resources/<A2>` absent; 0 revisions listed. The sidecar bytes of `A1`, `A3` and `A4` (each marked) were identical before and after the purge. The target's snapshot revision was still listed. The resolver for the target returned `available`.

## Absorbed document edited since, MEASURED

`updateRevisionInPlace` on the canonical revision of `A3` (new text of 7 words, synthetic):

- The canonical revision id was the same; the stored content differed from before.
- `mergedMark` before and after were equal; the mark's keys were `targetId`, `snapshotRevisionId`, `date` and nothing else (it holds no hash or text of the absorbed document).
- Revisions after the edit: one, `v-1`, canonical (no snapshot revision was created by the in-place edit).
- Sidecar `wordCount` read 0 before the edit and 7 after, as read by `readSidecar` after `flushIndexer`.
- After `softDeleteResource(A3)`, `.trash/revisions/<A3>/` held only `v-1` and its `content.bin` contained the edited text. After `restoreResource(A3)` the document was live again.

So, as measured, nothing stored on the absorbed document or in its mark records what its text was at merge time; a later Undo cannot tell an edited absorbed document from an unedited one from the mark alone.

## Target in Trash, MEASURED

After `softDeleteResource(T)`: resolver `document-in-trash`; live sidecar `null`; trashed sidecar present; `.trash/revisions/<T>` held `v-1` and `v-2` (the preserved snapshot). The sidecar bytes of the marked `A1`, `A3`, `A4` were unchanged by the target's trash. After `restoreResource(T)` the snapshot revision was present and still preserved.

## Target purged, MEASURED

After `softDeleteResource(T)` then `purgeResource(T)`: resolver `document-permanently-removed`; the sidecar bytes of `A1`, `A3`, `A4` were unchanged; the `mergedMark` of `A4` still named `T`. The mark stays on the absorbed documents after the target is purged; nothing rewrote or removed it.

## Soft delete and restore of a marked document, MEASURED

Covered above for `A1` and `A3`: the key is in the trashed sidecar, byte-identical after restore. Purge of one marked document (`A2`) left the three other marks byte-identical.

## Not measured

- An encrypted project (sealing and the locked error of these reads).
- `duplicateResource` and `copyResourceCore` with a mark (Task 4's item).
- A folder soft delete carrying marked documents, and a restore that relocates or renames.
- A real merge or Undo of one (no merge core exists yet); the mark's real shape is not known until Task 15 and 22.
- A failing read on a real file (the `could-not-be-checked` case was exercised with a supplied probe value only).
- Pruning of a target's revisions by `pruneRevisions` (only the explicit `deleteRevision` path was run).

## For Task 21

- READ plus MEASURED: the resolver gives the five states of FR-5 for a target when fed the target's probes; its record type is split-only.
- MEASURED: the five states are distinct and reachable on a real directory for the target. The state of an absorbed document (in Trash, purged) does not change the resolver's answer for the target; Undo's own reads of the absorbed documents are separate from it.
