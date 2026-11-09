# Experiments: Inbox and Capture box (Feature 106)

Record for `specs/features/inbox-quick-capture.md` (FR-1, FR-18). Values below are observed values with the command that produced them; a statement marked READ is a reading of source, not a run. No cause is written as a cause. Task 1 created this file and filled FR-1 (a), (b), (c), (e); Task 2 appends (d); Task 26 appends FR-13; Task 28 appends Acceptance and Not verified.

## Environment

- Date: 2026-11-09.
- Commit (worktree HEAD at the time of the runs): `0a45e97cfcb90cd718e387de55309a64fbfd163d` (branch `worktree-agent-a329fea93b0125efc`); working tree clean before the runs, no product file changed by them.
- Node: v24.15.0 (`node -v`). Vitest: v4.1.6 (run output header). OS: Darwin 25.5.0, run inside the Bash command sandbox. CPU model not read (`sysctl` was refused by the sandbox), so the timings in (e) carry no CPU name.
- Probe: a throwaway vitest file kept in the session scratchpad (`f106-task1-probe.test.ts`), symlinked into `frontend/tests/unit/` for the runs and removed afterwards; it is not in the tree. Command, from `frontend/`:
  `pnpm exec vitest run tests/unit/zz-f106-probe.test.ts --project node --silent=false --reporter=verbose`
  Result: 1 test passed (the test only prints; the figures below are its stdout). The probe project is `createAndAssertProject` over `specs/002-define-data-models/project-types/novel_project_type.json` in an OS temp directory.
- Locks: `tests/setup.ts` installs the lock-order guard for every test file, so the `withMetaLock` -> `updateProjectJson` nesting in (b) ran under that guard and did not throw.

## FR-1 inventory (a), (b), (c), (d), (e)

### (a) A text resource with its body in one write

Reading: `CreateResourceOpts` (`frontend/src/lib/models/resource-factory.ts:239`) has `text?: { plainText?: string; tiptap?: TipTapDocument }` (line 246); `createResourceOfType` passes `opts.text?.plainText` and `opts.text?.tiptap` to `createTextResource` (case `"text"`). `writeResourceWithInitialRevision` (`resource-initial-revision.ts:61`) writes the resource and then `v-1` from `text.tiptap ?? plainTextToTipTapDocument(text.plainText ?? "")` (line 71). READ.

Run: `createResourceOfType("text", { name: "Captured", type: "text", text: { plainText: "plain body line", tiptap: <doc with "tiptap body line"> } })`, then `writeResourceWithInitialRevision(projectPath, resource)`. Observed:

- `resources/<id>/` contains `content.tiptap.json, content.txt`.
- `content.txt` = `"plain body line"`.
- `content.tiptap.json` = the supplied document (paragraph "tiptap body line").
- `revisions/<id>/` contains only `v-1`; `v-1/` holds `content.bin` and `metadata.json`.
- `v-1/content.bin` = `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"tiptap body line"}]}]}` (the tiptap document, serialized).
- `v-1/metadata.json` has `versionNumber: 1` (canonical flag and name not printed past the first 300 characters of the probe output).

Not run: the case with `plainText` only (no `tiptap`); read as converting through `plainTextToTipTapDocument` at `resource-initial-revision.ts:71` and `resource-persistence.ts`. `createResourceCore` (`resource-crud-core.ts:159`, `writeResourceWithInitialRevision` at line 173) was not run; the probe called the writer directly. `CreateResourceOpts` can carry the body, so FR-5's assumption holds and no stop is needed.

Observed with the same run: the plain text and the tiptap document are independent inputs; with both supplied, `content.txt` kept the plain text and `v-1` kept the tiptap document. Whether they agree is the caller's responsibility.

### (b) How a folder is created and persisted; how a `config` write is made

Reading: the HTTP create route `frontend/app/api/resource/route.ts` calls `createResourceCore` (line 31 of the route), which calls `createResourceOfType(resourceData.type, resourceData)` (`resource-crud-core.ts:172`) and `writeResourceWithInitialRevision`. For `type: "folder"`, `createResourceOfType` dispatches to `createFolderResource` (`resource-factory.ts:272`, `parentFolderId: opts.folderId`), and `writeResourceWithInitialRevision` calls `writeResourceToFile` (`resource-persistence.ts:135`, the folder branch: `resolveFolderDir`, `mkdir`, `atomicWriteFile(<dir>/folder.json)`). READ.

Run: `createResourceOfType("folder", { name: "Inbox", type: "folder", folderId: null })` then `writeResourceToFile(projectPath, folder)` against the temporary project. Observed:

- `folders/` after the write listed `back-matter, characters, front-matter, inbox, items, locations, workspace` (the listing before was not printed); the new directory is `folders/inbox/` (slug from `slugify("Inbox")`), flat under `folders/`, not nested by `parentId`.
- `folders/inbox/folder.json` = `{ id, name: "Inbox", slug: "inbox", type: "folder", parentId: null, createdAt, orderIndex: 0, special: false, metadataSource: { isMetadataSource: false } }`.
- Slug collision handling (`resolveFolderDir`, `resource-persistence.ts:72`): preferred `folders/<slug>`, then `<slug>-<first 8 of id>`, then `<slug>-<id>`; READ, not run.

Relevance for Task 7: folder creation lives in `createResourceOfType("folder", ...)` plus `writeResourceToFile`; the core `createResourceCore` is the existing entry. A folder write does not take `withMetaLock` itself (READ of `writeResourceToFile`).

`config` write: run once as `withMetaLock(projectPath, () => updateProjectJson(projectPath, (p) => { p.config = { ...p.config, inboxFolderId: <id> }; return { result: "ok" }; }))`. Observed: result `ok`; config keys before: `maxRevisions, statuses, customNoiseWords, excludedGlobalNoiseWords, autoPrune, editorConfig, metadataRevision`; after the call `project.json` read back had `config.inboxFolderId` equal to the folder id; the lock-order guard did not throw. The documented contract (`project-json-write.ts:11-13` and `:54-76`: the callback takes no lock; a caller may hold `withMetaLock`) is READ. Other existing writers using the same pattern are READ at `module-config-core.ts:100` (`withMetaLock` around `updateProjectJson`).

### (c) `NEXT_PUBLIC_GETWRITE_RUNTIME` inlining

READ: `frontend/src/store/transport/create-transport.ts:49` is `if (process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native")`, and the comment at line 25 names the raw comparison. No build was run in this worktree (builds only work in the main checkout). A `.next` directory exists in the main checkout, but its commit was not established and it was not searched, so this is not MEASURED from built output.

### (d) AppShell is not mounted when no project is open

Not yet run, recorded by Task 2.

### (e) Time cost of the folder-tree read and the client `parentId` walk

Synthetic project stated: 100 folders and 1,000 resources. Folders form 10 chains (folder `i >= 10` has folder `i - 10` as parent, depth up to 10), each written to its own `folder.json` under `folders/f<i>/` in an OS temp directory (flat layout, as `writeResourceToFile` produces). Resources are assigned to folders round-robin. The walk tests membership under the descendants of folder 0.

Machine: Darwin 25.5.0 under the command sandbox, Node v24.15.0, CPU model not read. One probe run; figures are a single sample of repeated calls, not a benchmark across runs.

- `readFolderTree(<synthetic folders dir>)` x20 calls: returned 100 descriptors; median 9.98 ms, min 8.40 ms, max 16.79 ms. (`folder-utils.ts:32`.)
- Client-style `parentId` walk (a `Map` of folder id to folder, a per-resource climb with a visited set) over 1,000 resources in 100 folders x50 repetitions: 100 resources matched; median 0.185 ms, min 0.178 ms, max 0.532 ms. In-memory only: no store, selector or React render was included.

Not measured: a larger or deeper tree, the read on an encrypted project, the object-store adapter (hosted), a cold file cache, or the cost through the real `getWritingLogAggregateCore` path.

## FR-13 shortcut checks

Not yet run, recorded by Task 26.

## Writing-log and goal figures

Not yet measured. Appended by the tasks that touch the writing log and goal figures (Tasks 11, 12, 13).

## Not verified

- A paired-device run of capture and of its refusal.
- Hosted web against a real tenant.
- The Android entry (Feature 107).
- A locked-project capture in the real unlock flow.
- Chrome, Safari, Firefox and Electron key delivery (until Task 26 records them).
- FR-1(d), until Task 2 records it.
- The `plainText`-only create path in (a), a built-output check of (c), and (e) at sizes other than the one stated.

## Acceptance

Not yet recorded, appended by Task 28.
