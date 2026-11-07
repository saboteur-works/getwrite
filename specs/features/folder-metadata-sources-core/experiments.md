# Feature 102 experiments

Measurements are recorded as observed values with the command or test that produced them. A cause is written only where an experiment separated it from the alternatives; anything else is labelled "not confirmed". Each task appends to its own section.

## Environment

Date: 2026-11-07. Tree: branch `worktree-agent-a8f2f0c4db41bf166` (isolated worktree), base commit `4f6b4992` plus the Task 1 files. Node v24.15.0, pnpm 10.28.0, Vitest v4.1.6. Everything ran inside the command sandbox; `pnpm` printed a `~/.npmrc` EPERM warning on each call (a sandbox denial, not a result). `next build`, `pnpm build:native`, Storybook and Playwright were not run.

## Part 1 FR-2 (a): concurrent `folder.json` writers

Test: `frontend/tests/unit/folder-json-concurrency.test.ts` (node project). Command, from the repository root: `pnpm --filter getwrite-frontend exec vitest run tests/unit/folder-json-concurrency.test.ts` (add `--disableConsoleIntercept` to see the logged lines). 13 tests passed on every run (three runs; two with logs shown below). The assertions pin the first-run observations; the race counts are logged, not asserted.

Writers found by grep and read (all write `folders/<slug>/folder.json`):

| Id | Writer | Site |
| --- | --- | --- |
| R | `renameFolderCore` to `renameFolderById` (read, spread, write) | `folder-utils.ts:51-76`; `resource-crud-core.ts` `renameFolderCore` |
| O | `reorderResourcesCore` folder loop (read, set `orderIndex` and `parentId`, write) | `resource-crud-core.ts:941-995`, inside `withMetaLock(projectRoot)` |
| W | `writeResourceToFile` for a folder (whole-object overwrite) | `resource-persistence.ts:125-135`; callers include Trash restore (`trash.ts:1135`, `:1152`) and the importers |
| C | `createProjectFromType` (folder and subfolder descriptors) | `project-creator.ts:272`, `:310`; runs at creation only, so no overlap partner exists on an existing folder |

### Which locks each writer requested (writer run alone, recording guard)

| Writer | Lock requests observed |
| --- | --- |
| R | none |
| O | `withMetaLock` on the project root (one request); no file lock |
| W | none |
| C | no lock whose key ends in `folder.json` (the recorder saw none) |

No writer requested `withFileLock` for a `folder.json` path.

### Held-lock gates (lock held by the test, writer started, file compared after 50 ms)

| Writer | File lock on `folder.json` held: file changed during hold | Project meta lock held: file changed during hold |
| --- | --- | --- |
| R | yes | yes |
| O | yes | no |
| W | yes | yes |

So, as observed: none of the three waits on a file lock for `folder.json`; only O waits on the project meta lock.

### Two writers started at once (50 repetitions each, fresh project per repetition)

Counts from two runs; the second run is the right-hand figure where they differ. "lost" counts a repetition in which the final file lacks that writer's change. "unparseable" counts a final `folder.json` that `JSON.parse` rejected (the file was read without error). W writes the whole folder object it was given at fixture time with `metadataSource.isMetadataSource: true`, so it carries the pre-race name and order.

| Pair | Run 1 | Run 2 |
| --- | --- | --- |
| R + O | rejected 0, unparseable 1, lost `R:name` 48, `O:orderIndex` 1 | same |
| R + W | rejected 0, unparseable 23, lost `W:flag` 27 | rejected 0, unparseable 24, lost `W:flag` 25, `R:name` 1 |
| O + W | rejected 0, unparseable 0, lost `W:flag` 48, `O:orderIndex` 2 | rejected 0, unparseable 0, lost `O:orderIndex` 4, `W:flag` 46 |

An earlier run of R + O and R + W (before the test was changed to separate read errors from parse errors) gave unparseable 5 and 25, so the counts vary run to run. Unreadable files (read error) were 0 in every counted run.

### Readings

- Reading (from the code): rename, reorder and Trash-restore writers take no per-file lock on `folder.json`. Confirmed by the lock-request records and by the held-lock gate for the file lock. Confirmed.
- Reading: two concurrent `folder.json` writers can lose a change. Observed: at least one change was missing from the final file in most repetitions of every pair. Confirmed as an observation.
- Observed: a final `folder.json` that does not parse occurred in R + O (1 of 50) and R + W (23 to 25 of 50) and not in O + W. Why those files did not parse is not confirmed: the test did not capture the bytes, so interleaved writes to one file is a hypothesis, not a finding.
- Why R + O lost the rename in 48 of 50 repetitions (and not the order) is not confirmed. The test shows only the outcome. Which writer read the old file before the other wrote was not traced.
- The R + W and O + W counts for W are partly by construction: W overwrites the whole object from a stale snapshot, so a write by R or O that lands first is overwritten whenever W finishes last. They show W's overwrite semantics, not a defect separate from that.
- Not measured: Trash restore calling W while a rename or reorder runs; importers calling W; two renames at once; two reorders at once (O serialises with itself on the meta lock by construction of `withMetaLock`, not run here); behaviour on the native transport; whether a real client can issue these overlaps. FR-5 (OQ-3, resolved) keeps rename, reorder and move unlocked; this record does not change that, and whether to keep or change the requirement is the owner's decision.

### Task 12: rename, reorder and move against the folder sidecar (observed)

Tests: the `Feature 102 Task 12` describes appended to `frontend/tests/unit/folder-json-concurrency.test.ts` (15 new tests; 28 in the file). Run against unchanged product code on the first run: all passed, so they pin behaviour and no product source was edited. Observed: after rename, reorder and move, the folder's notes, field values and subtype read back equal and `folder.json` held none of those keys; a recording storage adapter saw no call on the folder sidecar path, and no lock was requested for it (a control test shows the recorder does see a save and a read); a folder with no sidecar got none; each operation run at once with a metadata save, 10 repetitions each, left both changes with both calls fulfilled; reorder with metadata saves, run twice each at once, finished inside 5 s with the lock-order guard installed; reorder requested one lock (`withMetaLock`) and none for the sidecar; document sidecars stayed byte-equal and `search` hits for a body word and for a folder-notes word were unchanged after two folder metadata saves. Not measured: Trash restore or import writers overlapping a metadata save; native transport; "move" is a reorder entry with `folderId` set (no separate move writer was found).

## Part 1 FR-2 (b): Trash round trip with an undeclared `folder.json` key

Test: `describe("models/trash — undeclared folder.json key round trip (Feature 102 FR-2 (b))")` appended to `frontend/tests/unit/trash-folder-cascade.test.ts`. Command, from `frontend/`: `pnpm exec vitest run tests/unit/trash-folder-cascade.test.ts --disableConsoleIntercept`. Result: 12 tests passed in the file (the new one included); no product source file changed. The assertions pin the first-run observations below. Output also carries `[indexer-queue]` ENOENT lines from other tests in that file (background indexing after temp-dir removal); they were not examined and are not part of this record.

Setup: three folders (`Top Folder` > `Mid Folder` > `Leaf Folder`, nested by `parentId`) each written through `writeResourceToFile`, then each `folder.json` rewritten with an added key `futureMetadata` (an object). `softDeleteFolder(top)`, `listTrashedItems`, `restoreFolder(top)`. No resources and no `meta/folder-<id>.meta.json` sidecar (none exists in the product today) were involved.

Observed:

| Stage | `futureMetadata` present in the folder's `folder.json` (top / mid / leaf) |
| --- | --- |
| Before trash (live) | present / present / present |
| After `softDeleteFolder` (file under `.trash/folders/<slug>/folder.json`) | present / present / present |
| `.trash/meta/folder-<top id>.json` `folder` object | absent (top folder only; the manifest holds no descendant folder objects) |
| After `restoreFolder` (live `folders/<slug>/folder.json`) | absent / absent / absent |

So, as observed: the key does not survive a Trash and restore round trip, for the target folder and for both nested subfolders. It was present in the trashed files and absent from every restored file.

Not confirmed: where each key was lost was not traced step by step in the test. Reading from the code (not separated by an experiment): `collectFolderDescriptors` parses every `folder.json` with `FolderSchema.parse`, and `FolderSchema` (`schemas.ts:408`) is a `z.object` without `.passthrough()`, so the parsed `Folder` handed to restore lacks the key; restore then writes that parsed object with `writeResourceToFile` and removes the trashed directory that still held the original bytes. The test did not run a variant with a passthrough schema, so this is a reading.

### Trash descriptor record (every path in `trash.ts` and `trash-core.ts` that handles the folder descriptor)

Readings from the code at this commit; line numbers are as read. All in `frontend/src/lib/models/trash.ts` unless stated.

| Path | Function (line) | What it does with the descriptor |
| --- | --- | --- |
| Read live or trashed `folder.json` | `collectFolderDescriptors` (`:412`; parse at `:437`) | Reads each `folder.json` with `FolderSchema.parse`; a missing or invalid one is skipped (not thrown), a locked-access error is rethrown. Used by every path below marked "via collect". |
| Trash entry: manifest | `softDeleteFolder` (`:522`; manifest built at `:588-589`) | Walks `folders/` via collect (`:530`), writes `.trash/meta/folder-<id>.json` with `folder: target.folder` (the parsed object) through `TrashFolderManifestSchema.parse`. `TrashFolderManifestSchema` at `schemas.ts:660` declares `folder: FolderSchema`. |
| Trash entry: move | `softDeleteFolder` (`:640`, `:644`) calling `moveFolderDirToTrash` (`:485`; `rename` at `:495`) | Renames each descendant folder directory and then the target's into `.trash/folders/` (name clash gets `-<folderId>`); the original `folder.json` bytes move unchanged. |
| Trash retry | `readPriorFolderManifestDescendants` (`:455`; parse at `:464`) | Reads an earlier manifest through `TrashFolderManifestSchema`; uses only `descendants`. |
| Restore: read manifest | `restoreFolder` (`:1081`; parse at `:1094`) | Reads the manifest through the schema; ENOENT becomes "No trash manifest found for folder". |
| Restore: read trashed descriptors | `restoreFolder` (`:1102`, via collect) | Builds `trashedByFolderId` from parsed descriptors. |
| Restore: conflict (parent) | `restoreFolder` (`:1114`) calling `folderExists` (`:804`; collect at `:809`) | If the original parent is no longer under `folders/`, the folder is relocated to the project root. |
| Restore: conflict (name) | `restoreFolder` (`:1124-1128`) calling `resolveRestoreFolderName` (`:1010`; collect at `:1016`) | Sibling names from parsed descriptors; a clash gets `" (restored)"`, `" (restored 2)"`. |
| Restore: write top folder | `restoreFolder` (`:1131-1135`) | `{ ...manifest.folder, parentId, name }` written by `writeResourceToFile` (`resource-persistence.ts:125-135`, a whole-object `writeFile`, no lock), then `rm` of the trashed directory (`:1139`). |
| Restore: write descendant folders | `restoreFolder` (`:1148-1154`) | `writeResourceToFile(projectRoot, descriptor.folder)` from the parsed trashed descriptor, then `rm` of its trashed directory (`:1153`). The "restore conflict" rules above are not applied to descendants. |
| Restore: manifest removal | `restoreFolder` (`:1161`) | `rm` of the manifest. |
| Purge | `purgeFolder` (`:1407`; manifest parse at `:1418`, collect at `:1423`, `rm` at `:1443`, `:1449`, `:1456`) | Removes descendant folder directories, the manifest and the target directory; failures of the last two raise `PurgeSweepError("folder-manifest-and-descriptor", ...)`. |
| List | `listTrashedItems` (`:1554`; manifest parse at `:1584`, collect at `:1663`) | Folder names and parent ids come from parsed descriptors. |
| Kind dispatch | `resolveTrashedItemKind` (`:1722`; collect at `:1735`) | A trashed folder id is found by manifest file existence or by a parsed descriptor. |

`trash-core.ts` (`listTrashCore` `:83`, `restoreOneCore` `:98`, `purgeOneCore` `:142`, `purgeBatchCore` `:174`) reads or writes no descriptor itself; it calls `listTrashedItems`, `resolveTrashedItemKind`, `restoreFolder` and `purgeFolder` above and reports their result or error message. No function in either file reads or moves `meta/folder-<id>.meta.json` (a read of the two files; the test above has no such file).

Task 2 does not decide how Tasks 10 and 11 should keep the key or the sidecar.

## Part 1 FR-2 (c): `type = folder` query

Test: `describe("executeEvaluate — type = folder today (Feature 102 FR-2 (c))")` added to `frontend/tests/unit/query-routes.test.ts`, calling `executeEvaluate` (`query-evaluate-core.ts`) against a real temporary project. Command, from `frontend/`: `pnpm exec vitest run tests/unit/query-routes.test.ts --disableConsoleIntercept`. Result: 27 tests passed in the file (the new one included); no product source file changed. The assertions pin the first-run observations below. The output also carries an `[indexer-queue]` ENOENT line from other tests (background indexing after temp-dir removal); it was not examined and is not part of this record.

Setup: two folders on disk (`Folder A`, and `Folder B` created with `parentFolderId` = A) written with `writeResourceToFile`, and two text resources (one loose, one with `folderId` = A) written as sidecars.

Observed (ids returned; "folders" = the two folder ids, "text" = the two text ids):

| Query | Returned |
| --- | --- |
| `type = folder` | 0 ids (no folder id) |
| `type = text` | the 2 text ids |
| `type = folder OR type = text` | the 2 text ids, no folder id |
| `type = folder AND type = text` | 0 ids |

So, as observed: `type = folder` returns nothing today, for a project that has folders, and no query in the table returned a folder id. The reading ("matches nothing, from `listResourceIds` at `backlinks.ts:89-99`") agrees with the outcome. Not separated by an experiment: that `listResourceIds` (it lists only directories under `resources/`) is the reason. The test did not run a variant with a different id source, so the cause stays a reading. Not measured: a query naming `type = folder` through the HTTP route or native transport; `type != folder` and `not (type = folder)` (not run).

### Defined result of a mixed-type query (proposal for Task 14, not yet implemented)

A proposal consistent with FR-13, which Task 14 pins by test. It is not an observation and no test shows it yet.
- Folders enter the evaluator through a second id source, used only when the query names `type = folder` (FR-13, OQ-4). A folder is evaluated as a record whose `type` is `folder`, so the boolean combinators apply per record, as they do for resources.
- `type = folder`: the folders of the project.
- `type = folder OR type = text`: the folders plus the text resources (a union of the two sets).
- `type = folder AND type = text`: empty, because no record has two types.
- A query that does not name the folder type: unchanged by construction, and identical to the "Observed" column above.
- Not decided here: how `not (type = text)` and `type != text` treat folders when the query does not name `type = folder` (the second id source would then not be loaded, so folders would not appear); whether a query naming `type = folder` only inside a `not` loads the second source. These are open for Task 14 to settle and pin; the owner's decision where the answer changes a saved query's results.

## Part 2 FR-18 survey

Run by Task 4, 2026-11-07, in the isolated worktree on top of commit `7e47c7de`, inside the command sandbox. Nothing here was run against a running app.

### Change made

`ResourceTypeSchema` (`frontend/src/lib/models/schemas.ts:424`) is now `z.enum(["text", "image", "audio", "source"])`. The separate `ResourceType` union in `frontend/src/lib/models/types.ts:238` (which also holds `"folder"`, absent from the schema enum) gained `"source"`: `"text" | "image" | "audio" | "source" | "folder"`. No other source file was edited.

### Typecheck errors recorded

Observed after the two edits above and no other edit:

| Package | Command | Result |
| --- | --- | --- |
| `frontend/` | `pnpm typecheck` from `frontend/` (`tsc --noEmit`) | exit 0, 0 errors |
| `cli/` | `../frontend/node_modules/.bin/tsc --noEmit` from `cli/` (`cli/node_modules` has no `typescript`; `npx tsc` tried the network registry and was denied, so the frontend's binary was used) | exit 0, 0 errors |
| `electron/` | `../frontend/node_modules/.bin/tsc --noEmit` from `electron/` | exit 0, 0 errors |

Observed, not explained: adding `"source"` produced no typecheck error in any package. Not confirmed why (what was seen: the places that narrow on type compare one literal, fall to a `default`, or use the discriminated `TextResource` / `ImageResource` / `AudioResource` types whose `type` literals were not widened). No pre-edit baseline typecheck was run, so "0 errors" is the post-edit figure only. Because the compiler flagged nothing, the dispositions below come from reading each site, not from the compiler. On this evidence `cli/` and `electron/` need no fix for the type itself in Task 5; Task 5 should re-run both after Task 6 declares more types.

### Method

Commands from the repository root; test files, stories and `tests/` excluded:
- `grep -rnE '"(text|image|audio)"'` over `frontend/{src,app,components,lib,store}`, `cli/src`, `electron/src` (`.ts` and `.tsx`): 242 raw lines in 90 files (`frontend/lib` and `frontend/store` do not exist; grep skipped them silently). `electron/src`: 0 lines. `cli/src`: 4 lines in 3 files (`templates.ts`, `commands/templates.ts`, `commands/reindex.ts`).
- `grep -rnE 'ResourceType\b'` over the same scope: 33 lines, all read.
- Switches on a resource type: `resource-factory.ts` `createResourceOfType` (a `default` that throws), `ResourceTree.tsx` `renderResourceIcon`, `OrganizerCard.tsx`, `EntityCompileResourceList.tsx`, `CompileResourceTree.tsx`. None is `never`-checked. (`MetadataSidebar.tsx:389` switches on a field type, not a resource type.)
- `cli` `repair-revisions` and the electron import workers: rows 53 and 54.

Most of the 242 raw lines are not resource-type sites (disposition N, not counted in the table): TipTap node types (`type: "text"` inside a document: `rtf-to-tiptap.ts`, `txt-to-tiptap.ts`, `mammoth-to-tiptap.ts`, `tiptap-doc.ts`, `tiptap-text.ts`, `docx/*`, `DiffViewController.tsx`, `markdown-serializer.ts`, `TipTapEditor.tsx`, `MediaDropExtension.ts:139`), metadata field input types (`schemas.ts:162,402`, `lib/api/schemas.ts:120,238`, `types.ts:161,255`, `default-metadata-schema.ts`, `SchemaManager.tsx`, `AddFieldForm.tsx`, `ValuePicker.tsx`, `FilterChip.tsx`, `FieldPicker.tsx`, `goal-filter-draft.ts`, `resource-factory.ts:179`), HTML `type="text"` inputs and `Input.tsx`, and the compile and export request format `"text"` (`api/compile.ts:125`, `api/export.ts:87`). The N lines were not counted one by one; the exact number of resource-type lines is not recorded.

### Dispositions (resource-type sites)

Legend: T = treats a Source like text; C = needs a `source` case or branch; U = deliberately unchanged, with the reason. The task named in a C row is the one expected to make the edit; none was edited here. "Read, not run" means the behaviour is from reading the code.

| # | Site | Disposition |
| --- | --- | --- |
| 1 | `schemas.ts:424` `ResourceTypeSchema` | Done in this task. |
| 2 | `types.ts:238` `ResourceType` | Done in this task. |
| 3 | `schemas.ts:501,594,715` (`type: ResourceTypeSchema` in resource, sidecar and list schemas) | T: accepts `source` now. |
| 4 | `schemas.ts:534,548,559`, `types.ts:385,402,415` (`TextResource`, `ImageResource`, `AudioResource` literal `type`) | C (Task 6/20): a Source needs its own shape or a `TextResource` that admits `"source"`. Left as is. |
| 5 | `resource-factory.ts:241-259` `createResourceOfType` switch | C (Task 20): no `source` case; `source` reaches `default` and throws "Unsupported resource type" (read, not run). |
| 6 | `resource-factory.ts:80` `createTextResource` | T: a Source body can be created like a text body. |
| 7 | `resource-factory.ts:113,146` image and audio factories | U: media only. |
| 8 | `resource-persistence.ts:94` `isTextResource` | C (Task 20): false for a Source, so its body would not be written as text. |
| 9 | `resource-persistence.ts:103` `isMediaResource` | U: a Source is not media; attachments are in the sidecar. |
| 10 | `resource-persistence.ts:231` image branch | U: media only. |
| 11 | `resource-persistence.ts:272` `r.type !== "text"` (word count backfill) | C (Task 30): a Source must count words (FR-38). |
| 12 | `resource-initial-revision.ts:61` | C (Task 20): `v-1` written only for `type === "text"`; FR-22 needs it for a Source. |
| 13 | `revision-repair.ts:77` `resource.type !== "text"` skip (`repair-revisions` and `loadProjectCore`) | C (Task 20/21): a Source with no `v-1` would be skipped by the repair. |
| 14 | `project-loader.ts:137,152` plain-text read and `wordCount` | C (Tasks 20, 30): a Source would load with no plain text and `wordCount` undefined. |
| 15 | `project-creator.ts:326-330` project-type seed resources | U: project types seed text only (row 31). |
| 16 | `resource-crud-core.ts:253-262` media create | U: media only. |
| 17 | `resource-crud-core.ts:303` `isText` in copy | C (Task 20/21): copy and duplicate give a text copy its own `v-1`; a Source copy needs the same. `resource-crud-core.ts` is a hot file owned by Tasks 12, 20, 21, 23, 29, so not edited here. |
| 18 | `resource-crud-core.ts:860` comment | U: comment only. |
| 19 | `resource-templates.ts:298,330,332,485,1012,1050` | U: FR-38 exception, templates stay text-only; line 330-332 reject non-text (read, not run). |
| 20 | `template-service.ts:8`, `resource-templates.ts:84,180,182,223` (`ResourceType`-typed fields) | U: wider type, template logic unchanged. |
| 21 | `previews.ts:78-98` | T: image and audio tested first; every other type, so a Source, takes the text excerpt branch (read, not run). |
| 22 | `query-evaluate-core.ts:67,76,168` | C (Task 14/30): `wordCount` and text fields read for `type === "text"` only. |
| 23 | `query-intrinsics.ts:68` `options: ["text","image","audio","folder"]` | C (Task 14/20): the type filter would not offer Source. |
| 24 | `query-intrinsics.ts:88,98` | C (Task 30): intrinsic values computed for `type === "text"` only. |
| 25 | `goal-filter-membership-core.ts:21,160` | C (Task 30): goal membership is text only; FR-38 says a Source counts. |
| 26 | `status-rollup.ts:58` | C (Task 30): `r.type !== "text"` skips a Source. |
| 27 | `annotations-core.ts:107,145` | C (Task 32): `AnnotationResourceTypeError` for non-text; FR-38 allows annotations on a Source body. |
| 28 | `annotation-copy.ts:39` | C (Task 32): returns a non-text sidecar untouched, so a copied Source would keep its annotation ids. |
| 29 | `indexer-queue.ts:271` | T: builds a minimal resource with `type: "text"` hard-coded for every task regardless of the sidecar type, so a Source is indexed as text (read, not run). |
| 30 | `trash.ts:1478,1649` (type recorded at trash time; fallback `"text"`) | U: records the stored type string. Trash edits belong to Tasks 10, 11, 24, 25. |
| 31 | `types/project-types.ts:12`, `ProjectTypeEditorForm.tsx:468`, `ProjectTypeDraftService.ts:680` | U: project types do not seed Sources. |
| 32 | `lib/adapters/placeholderAdapter.ts:23-29,54-57` | U: legacy type names only; unknown maps to text. |
| 33 | `lib/export/section-loader.ts:23` | C (Task 18/32): keeps only `type === "text"`. |
| 34 | `app/(app)/page.tsx:794,798,989` | C (Task 20): create path treats `type` other than `text`/`folder` as media or defaults to text. |
| 35 | `components/Layout/AppShell.tsx:440,451,1374-1389,1439,1541,1639-1646,1728` | C (Task 20): open-resource routing tests `text`, then `image`/`audio`; a Source would not open in the editor. |
| 36 | `components/Start/StartPage.tsx:148` `r.type ?? "text"` | U: default for a missing type. |
| 37 | `components/Sidebar/MetadataSidebar.tsx:487-489,507-513,556` | C (Task 15/21/33): editable-resource gate and the text-only sections. `MetadataSidebar.tsx` is a hot file. |
| 38 | `components/Sidebar/SubtypeSection.tsx:55-57` | C (Task 21): hides the control for any type not text, image or audio. |
| 39 | `components/Sidebar/WordCountGoalSection.tsx:91` | C (Task 30): per-resource goal is text only. |
| 40 | `components/Sidebar/EntityCompileSection.tsx:87` | U: `?? "text"` default for a missing type. |
| 41 | `components/WorkArea/EditView.tsx:470` | C (Task 20): editor enabled for `type === "text"` only. |
| 42 | `OrganizerView.tsx:321`, `organizerFilters.ts:128`, `OrganizerCard.tsx:115-119,246` | C (Task 17/20): organizer lists and cards text only; card switch has no Source case. |
| 43 | `components/WorkArea/Media/MediaView.tsx:57` | U: media only. |
| 44 | `components/common/EntityCompileResourceList.tsx:28,33-35,46` | C (Task 32): non-text rows are not compilable; `source` is not `"text"`. |
| 45 | `components/common/CompileResourceTree.tsx:44-46` | C (Task 29/32): icon switch has no Source case. |
| 46 | `ResourceTree.tsx:122-126,301`, `buildResourceTree.ts:23` | C (Task 20): icon switch falls to the text icon by `default` (T for the icon); the `resourceType` union omits `source` (C). |
| 47 | `CreateResourceModal.tsx:20-21,135-137,192-194` | C (Task 20): menu offers Document, Image, Audio only; creating a Source is a separate action (FR-24). |
| 48 | `components/common/ResourceCommandPalette.tsx:27-41` | T: image and audio tested; everything else uses the text icon (read, not run). |
| 49 | `ImagePickerSubmenu.tsx:29`, `MediaDropExtension.ts:56` | U: media only. |
| 50 | `components/QueryBuilder/*` | U: the literals are field input types (N), not resource type. |
| 51 | `cli/src/templates.ts:101`, `cli/src/commands/templates.ts:87,115` | U: templates stay text-only (FR-38 exception). |
| 52 | `cli/src/commands/reindex.ts:100` | T: builds a minimal resource with `type: "text"` for every resource id regardless of the sidecar type; a Source is indexed as text (read, not run). |
| 53 | `cli/src/commands/repair-revisions.ts` | T: delegates to `repairMissingInitialRevisions`; behaviour for a Source is row 13. |
| 54 | `electron/src` import workers (`scrivener-import/`, `docx-import/`) | U: 0 resource-type lines in `electron/src`; workers call the `import*Project` orchestrators, which write `type: "text"` (`import-scrivener-project.ts:773`, `import-docx-project.ts:752,823`, `import-plaintext-project.ts:513`) and never create a Source. |

Count as observed: 242 raw grep lines in 90 files (4 in `cli/src`, 0 in `electron/src`); 54 numbered resource-type site rows (a row can group several lines of one file). By primary disposition: Done in this task 2, T 7, C 27, U 18. A record, not an acceptance figure.

Hot-file need: no row requires an edit to `trash.ts`, `trash-core.ts` or `sidecar.ts`. Rows 17 (`resource-crud-core.ts`) and 37 (`MetadataSidebar.tsx`) are hot files left to the owning tasks; the per-type shapes of row 4 are left to Task 6.

### Attachment list (FR-22 record)

- Sidecar key: `attachments`, a top-level key of `meta/resource-<sourceId>.meta.json`, an array; array order is display order. Absent or `[]` means none; a new Source starts with `[]`.
- Entry shape: `{ id: string (UUID), fileName: string (bare stored file name, checked with `isPlainFileName`), originalName: string (display only), mime: string (set from the magic-byte check, not the client), size: number (bytes), addedAt: string (ISO 8601) }`.
- Status: a name and shape chosen here for Tasks 6, 22 and 23 to declare; nothing reads or writes the key yet (`grep -ri attachment frontend/src/lib/models/*.ts` printed no lines). Where the stored file lives is not decided here (Task 23).

### Task 32 dispositions (FR-38 text-rule sites)

Run by Task 32, 2026-11-07, worktree on top of `b2021d7f`, inside the command sandbox. "Red first" means the new test was run before the product change and failed; "pinning" means the test passed against the code as it was (no change made), so it records current behaviour and could not fail first.

| Survey row | Site | Test | Observed |
| --- | --- | --- | --- |
| 27 | `annotations-core.ts` (`mutateAnnotations`, `listAnnotationsCore`) | `annotations-core.test.ts`, "annotation core on a Source" (3 tests: add/list/update/delete, body/revisions/word count untouched, annotation body found by search) | Red first: 3 failures, `AnnotationResourceTypeError` at the `current.type !== "text"` check. After the change (a `text` or `source` sidecar accepted): 27/27 pass. The error message still reads "Annotations can only be added to text resources." (not changed). |
| 28 | `annotation-copy.ts` | `resource-copy-revision.test.ts`, "of a Source - annotations get new ids" (copy and duplicate) | Red first: 2 failures, a copied Source kept the original annotation ids. After the change: 32/32 pass. |
| 27 (editor gate) | `EditView.tsx:470` `annotationResourceId` | `editView.test.tsx`, "EditView annotation gate" (text, Source on the current revision; Source on an older revision) | Red first: 1 failure, the editor received `""` for a Source. After the change: 10/10 pass. The toolbar button and panel read the id from this prop; `grep '"text"'` over `components/Editor/Annotations`, `AnnotationsToolbarButton.tsx`, `useAnnotations.ts`, `annotation-flows.ts` and `app/api/annotations` printed no line. |
| 33 | `section-loader.ts` (Task 29 had already admitted `source`) | `compile-annotation-marks.test.ts`, "compile and export of a Source with annotation marks" (annotated equals plain in TXT, Markdown, PDF text, DOCX body; Source output equals its text twin) | Pinning: 68/68 pass with no change by this task. Annotation bodies live in the sidecar, so compiled and exported output has no note text. |
| 44 | `EntityCompileResourceList.tsx` `isCompilableTextResource` | `EntityCompileResourceList.test.tsx` | Red first: 1 failure, a Source entry showed `data-excluded="true"` and "excluded - not a text resource" although `loadTextSections` includes a Source. After the change: 5/5 pass. |
| 45 | `CompileResourceTree.tsx` icon switch | `CompileResourceTree.test.tsx` (new file, no existing test rendered the component) | Pinning: lists the Source by name; its checkbox toggles. The icon is the text icon by `default` (not asserted). |
| 46 | `buildResourceTree.ts` (compile outline) | `compileSelection.test.ts`, "a Source in the compile outline" (4 tests) | Pinning: a Source is a leaf with `resourceType: "source"`, in tree order, in the all-checked set, toggles and orders as text. |
| 19, 51 | `resource-templates.ts` (`createResourceFromTemplate`, `saveResourceTemplateFromResource`), `cli/src/templates.ts` | `resource-templates.test.ts`: a `source` row in the unsupported-type table; "a Source is rejected naming the type and the resource id" | Pinning: both rejected with nothing written. `ResourceTemplateSchema` accepts `type: "source"` (shares `ResourceTypeSchema`), so a hand-written Source template can be stored; creating from it is refused. CLI `templates save` hard-codes `type: "text"`; no CLI test run. |
| 21 | `previews.ts` `generatePreview` | `source-resource-crud.test.ts`, "a Source in search, backlinks and previews" | Pinning: a Source gives `{ type: "text", excerpt, wordCount }` and loads back. `generatePreview` is typed for text, image and audio, so the test passes the Source with a cast. No production caller of `generatePreview` was found by `grep` over `src`, `app` and `components` (the `--include` form of the grep printed a shell error, so this was not confirmed). |
| 29 | `indexer-queue.ts:271` (type hard-coded `"text"`) | same file: full-text search and snippet; backlinks | Pinning: after `createResourceCore` and `flushIndexer`, `executeSearch` returns the Source with the same snippet and `snippetKind` as a text twin with the same body; `loadBacklinks` holds the edge from a Source body to a text resource and from a text body to the Source. |
| (backlinks) | `backlinks.ts` `computeBacklinks` | `backlinks-wiki.test.ts`, "backlinks from and to a Source" | Pinning: UUID and `[[wiki]]` links from a Source body, and a wiki link by name and a UUID link to a Source, are found. `computeBacklinks` has no type branch. |
| 52 | `cli/src/commands/reindex.ts:100` (type hard-coded `"text"`) | none | Not tested: the only CLI reindex test (`cli/tests/reindex-encryption-guard.test.ts`) covers the encryption guard, and the CLI tests were not run for this task. Read: the loop calls `indexResource` with `type: "text"` for every id and reads the sidecar for the name only. |
| 14 | `project-loader.ts:137,152` | none by this task | Not edited. Neither search, backlinks, the compile outline, previews nor annotations read the loader's `plaintext` or `wordCount` for a Source in the tests above. Left to Task 30 (word counts, roll-up). |

Not measured: a running app (the annotation toolbar and panel on a Source in the browser), the CLI reindex of a Source, the Trash tab for a Source with annotations.

## Part 2 FR-28 observation

Task 30, run 2026-11-07 on branch `feat/folder-metadata-sources-core` from base b2021d7f. Tests added to existing files under `frontend/tests/`: `unit/goal-filter-membership-core.test.ts`, `unit/goal-filtered-total-core.test.ts`, `unit/status-rollup.test.ts`, `unit/writing-log-core.test.ts`, `unit/query-intrinsics.test.ts`, `unit/project-loader.test.ts`, `unit/project-creator.test.ts`, `unit/resource-persistence.test.ts`, `dataViewGoalFilter.test.tsx`.

**First run, before any product change** (narrow `pnpm exec vitest run` over the eight unit files): 10 failed, 185 passed. Observed failures: goal membership returned `{ status: 'members', ids: ['t1'] }` where a Source with the same status was expected (and `no-match` for a filter matching only a Source); `evaluateGoalFilteredTotal` returned 4 where text 4 + Source 6 was expected; `computeStatusRollup` gave a Source no row count; the filtered daily aggregate returned added 10 where text 10 + Source 7 was expected; the `wordCount` and `charCount` intrinsics returned null for a Source; `loadProjectFromDisk` returned `plaintext` `''` and no `wordCount` for a Source with a 4-word `content.txt`; `getLocalResources` returned no `wordCount` for a Source whose sidecar had none. Passed before any change (pinning only): new-project config has no `goalFilter` (stored and returned), the unfiltered daily aggregate adds a Source-document entry, the Data view overview total includes a Source's words.

**Product edits made to turn them green** (survey rows 11, 14, 22, 24, 25, 26; each row's disposition was Task 30): `goal-filter-membership-core.ts` membership filter accepts `type` `text` or `source`; `status-rollup.ts` skips only types other than `text` and `source`; `query-intrinsics.ts` `wordCount`/`charCount` read for `text` or `source`; `query-evaluate-core.ts` `sidecarToResourceBase` and the content-derived count step apply to `source`; `project-loader.ts` reads plain text and counts words for `source`; `resource-persistence.ts` word-count backfill applies to `source`. After these, the same eight files pass.

**Observed, no goal filter set** (the owner's reading is not recorded here):
- Project total: the Data view overview total (`DataView.tsx`) sums `userMetadata.wordCount ?? wordCount ?? 0` over every resource with no type check; with one text resource of 10 words and one Source of 7 words the rendered figure was "17 / 1,000 words" (`dataViewGoalFilter.test.tsx`). That test passed on the pre-change code and was unaffected by the product edits.
- Daily total: with no `goalFilter`, `getWritingLogAggregateCore` added a writing-log entry whose `documentId` names a Source (7 added, 1 deleted) into `totals` (added 7, deleted 1, net 6). The test seeds the log entry directly; whether a Source's canonical save writes such an entry in a running app was not measured here (`revision-core.ts` has no type check by grep of `.type` lines, not by a save of a Source).
- With a goal filter set, a Source is a member under the same rules as text for status and `wordCount` conditions (tests above). A filter that names the `type` intrinsic is the writer's own choice and was not varied.

**Owner decision, 2026-11-07 (Task 35), and the observed values before and after.** The owner decided that with no goal filter the project total word goal and the daily word goal exclude Sources (the daily aggregate ignores writing-log entries whose `documentId` is a Source), that a goal filter which selects Sources includes them, and that the per-resource goal is unchanged. Changes: `DataView.tsx` (the Writing Goal bar's unfiltered `current` skips `type === "source"`; the "Total words" overview figure was left as built) and `writing-log-core.ts` (`aggregateForRoot`, with no filter set, reads the sidecar of each document id the window names and skips the entries and skipped-save markers of those typed `source`; a document with no sidecar still counts as before; a failed sidecar read rejects).
- Project total, `dataViewGoalFilter.test.tsx` (10 text words and 7 Source words, goal 1,000, no filter): before, "17 / 1,000 words"; after, "10 / 1,000 words" (and "17 / 1,000 words" is absent). With `filteredGoalTotal` supplied as `{ status: "total", total: 17 }` the bar shows "17 / 1,000 words".
- Daily total, `writing-log-core.test.ts` (entries text 10 added / 2 deleted and Source 7 / 1, no filter): before, `totals` `{ added: 17, deleted: 3, net: 14 }` (the failing assertion of the pre-change run); after, `{ added: 10, deleted: 2, net: 8 }`. A Source-only entry changed from `{ added: 7, deleted: 1, net: 6 }` (Task 30) to excluded. A skipped-save marker naming a Source: `incomplete` was `true` before, `false` after. An entry whose document has no sidecar: `{ added: 7, deleted: 1, net: 6 }` before and after.
- With a goal filter `{ op: "eq", field: "type", value: "source" }` the daily total counted the Source's entry (`{ added: 7, deleted: 1, net: 6 }`), and passed before and after the change. The filtered-total core test (Task 30) is unchanged.
- Per-resource goal: `WordCountGoalSection` renders no control for a Source (it renders for `type === "text"` only); this was true before and after, pinned in `wordCountGoalSection.test.tsx`. No code of the per-resource goal was changed.
- Not measured: the daily aggregate's cost with many documents in a window (one sidecar read per distinct document id); a running app.

**Not measured:** a running app; the filtered project total for a Source with no sidecar `wordCount` (that figure reads the sidecar only, `goal-filtered-total-core.ts`, as for text); `charCount` through the goal path; whether a Source save updates the sidecar `wordCount` (not tested here).

## Part 2 FR-31 (d)

Task 35, run 2026-11-07 on branch `worktree-agent-a9527e91b4615fdf4` from base d6889b98. This is a measurement of a test in a Node process. It is NOT a device measurement and says nothing about the Phase 3 baseline (about 10 MB/s, 100 MB cap).

Test: `tests/integration/source-attachments-native-largest.test.ts`, run with `pnpm exec vitest run tests/integration/source-attachments-native-largest.test.ts --reporter=verbose --silent=false` from `frontend/`. It creates a Source through `createNativeResourcesTransport` and adds a PNG-signed attachment of exactly `MAX_MEDIA_FILE_BYTES` = 104,857,600 bytes (100 MiB) through `createNativeAttachmentsTransport` (`addAttachment`), lists it, then reads the stored file back through the storage adapter (`readFileBuffer`) and compares it to the input with `Buffer.compare`. The storage underneath is `createFakeCapacitorFilesystem()` (in memory, base64 at the plugin boundary) behind `capacitorFsAdapter`, bound by `createNativeRunner`'s injected-fs scope.

Observed: the test passed, the stored size equalled 104,857,600 and the bytes compared equal. Logged durations of the first full run: add 69 ms, read 39 ms; whole test 243 ms (a second run of the same test: whole test 287 ms). Environment: Node v24.15.0, Vitest v4.1.6, no `next build` or `pnpm build:native` (the transport is imported from source, so there is no app build to name). The test lives in the normal suite because it runs far under 10 s. The vitest worker did not run out of memory.

What the figure is: the fake keeps files as in-memory buffers, so it measures the JS code path (validation including the magic-byte check, `Buffer` copies, base64 encode and decode), not Capacitor's bridge or device storage. It is not a throughput measurement for a device and is not comparable with the Phase 3 figure.

Red-first: this test adds no product behaviour (no product code changed for it). Its first run failed on a test-side mistake (it read the file with the string-returning `readFile`, so `byteLength` was `undefined`); after switching to `readFileBuffer` it passed. It was not red against product code.

**Not verified:** the same add and read on an Android device or emulator through the real `@capacitor/filesystem` bridge; throughput on a device; whether the Phase 3 baseline (about 10 MB/s, 100 MB cap) holds for an attachment. This run states nothing about either.

## Acceptance

Not run (Task 39).

### Task 26: FR-31 (a), (a2), (b), (c) and FR-34 (OQ-6), observed

Command: `pnpm exec vitest run tests/unit/source-attachments-core.test.ts tests/unit/trash-attachments.test.ts tests/unit/folder-metadata-core.test.ts` (from `frontend/`, base commit bab24724). Memory adapter under `workspaceEncryptionAdapter` for the encrypted cases; real directory for the Trash round trips. Every new test passed on the first run against unchanged product code (they pin behaviour; none was red first).

**Held (observed):**
- (a) An attachment file is an envelope at rest (the plaintext bytes are absent from the stored file), as an image resource's file written through the same adapter is; reading it back through the adapter when unlocked returns the identical bytes; after `keyring.lock()` the read, `addAttachmentCore`, `listAttachmentsCore`, `reorderAttachmentsCore`, `removeAttachmentCore`, `replaceAttachmentCore` and `restoreTrashedAttachment` each reject with a locked-access error, and the stored file stays an envelope.
- (a2) `getFolderMetadataCore` and `updateFolderMetadataCore` reject with a locked-access error on a locked project (a read is not an empty value); the folder sidecar `meta/folder-<id>.meta.json` is an envelope at rest, with the note text absent from the stored bytes, and reads back when unlocked. `source-attachments-core.ts` and `folder-metadata-core.ts` contain no `node:fs` import and import `./io` (source text match, a test, not a lint rule).
- (b) Trash then restore of a Source with two images and one audio attachment (real directory): the directory file names, every file's bytes and the sidecar `attachments` list are identical after restore, and `.trash/` is empty. The same on an encrypted project: trashed attachment files are envelopes, restored files are envelopes and read back to the original bytes.
- (c) Trash then `purgeOneCore`, and Trash then `purgeBatchCore({ all: true })`: no attachment file, no `resources/<id>` content and no `meta/resource-<id>.meta.json` remain, and `.trash/` is empty; the same holds with a single trashed attachment entry beside a trashed Source. On an encrypted project, purge leaves no file containing the Source id or an attachment file name.

**Where behaviour did not hold or differed (observed at Task 26). Gaps 1 and 2 were changed by the owner decisions of 2026-11-07 in Task 35, see "Task 35: Trash locked-access and folder 404" below; the values here are the Task 26 observations:**
- Gap 1 (known from Task 24): `restoreOneCore` catches every error, including a locked-access error, and returns `{ ok: false, error }` with the locked message (observed for an attachment entry and for a Source). It does not rethrow, so a caller that only reads `ok` sees a failed restore with the message; the route layer was not exercised here, so whether HTTP shows 401 or 200 with `ok:false` was not measured by this task. `purgeOneCore` behaves the same for a trashed Source.
- Gap 2: `purgeOneCore` on an attachment entry of a locked, encrypted project returned `{ ok: true }` and the trashed file and record were removed (`.trash/` empty), whereas the same call for a trashed Source returned `{ ok: false }` ("Purge sweep failed at step index-backlinks-mentions ...locked") and kept the files. Observed difference only; a deletion without the key is not a disclosure, and whether it is wanted is the owner's decision. `listTrashCore` on the locked project rejects with a locked-access error (it does not return empty).
- A trash-time purge/restore ordering crash window (Task 24's note) was not measured: no test interrupts a restore or purge midway.

**Not measured:** route-level responses (Task 27), native backend lock behaviour (reasoned, Task 28), the folder sidecar through Trash (Task 11's tests), a running app.

### Task 35: Trash locked-access and folder 404 (owner decisions of 2026-11-07), observed

Tests were written first and run against the pre-change code, then the code was changed.

**Gaps 1 and 2 of Task 26 were changed by the owner decision of 2026-11-07.** Observed before (pre-change run of the new tests): `restoreOneCore` for a locked attachment entry resolved (`ok: false`, locked message) where a rejection was expected; `purgeOneCore` for a locked attachment entry resolved `{ id, ok: true }`; `restoreOneCore` for a locked trashed Source resolved with `ok: false`; the native Trash transport's `restore` resolved with a one-entry array when the core rejected with `ProjectLockedError`. Observed after: `restoreOneCore` and `purgeOneCore` reject with the locked-access error (`ProjectLockedError`; a `PurgeSweepError` whose `cause` is a locked error is rethrown as that cause) for an attachment entry and for a Source; `purgeBatchCore` rejects likewise; the locked attachment purge leaves `.trash/` byte-for-byte listed as before; the native transport's `restore` and `purge` reject with the locked error. HTTP: the Trash restore and purge routes' tests (cores mocked to reject) answer 401 for `ProjectLockedError` and 409 for `MissingProjectKeyError`, the existing `withStorageContext` mapping; these two route tests passed before the change too (the mapping already existed; they pin the response, they were not red). `discardTrashAttachment` now reads the record unparsed first, which is what makes the locked purge refuse. Not measured: a real encrypted project through the HTTP routes end to end, and the Trash view in a running app (it shows its generic "Could not restore/permanently delete the selected items" message on the rejected request; no unlock prompt was added or tested here).

**Folder metadata write for an unknown folder id (FR-3).** Observed before: the route test returned 200 and created `meta/folder-<id>.meta.json`; the core test, the native transport and the three-way parity test each resolved instead of rejecting. Observed after: `updateFolderMetadataCore` throws `FolderNotFoundError` ("Folder not found") for a payload with keys and for an empty payload; the PUT route answers 404 `{ error: "Folder not found" }`; the native transport rejects with the same message; no `meta/folder-<id>.meta.json` exists on any of the three (`folder-metadata-parity.test.ts`). `GET` for an unknown id still returns the empty value. The check reads `project.json` first (a locked project then raises its locked-access error, where an absent `folders/` would otherwise read as no folders), then `listFolderDescriptors`; a folder whose `folder.json` does not satisfy `FolderSchema` raises `FolderDescriptorUnreadableError` instead of a write (found by `compile-export-folder-notes-excluded.test.ts`, whose fixture had no `project.json` and a descriptor with only `id` and `name`; the fixture was corrected).

