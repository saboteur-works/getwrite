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

Run by the lead (Task 2), 2026-11-09. Commit `84a2e145554204bb4e3bb979010c333e07ca9382` (`feat/inbox-quick-capture`, main checkout, clean tree), `pnpm exec next dev -p 3123` from `frontend/` (Next.js 16.2.6, Turbopack, dev build, outside the command sandbox), Chromium driven by the Playwright MCP, local workspace with 13 projects and no project open.

**Result: the statement does not hold. `AppShell` IS mounted on the Start screen.**

- `document.querySelectorAll('.appshell-shell').length` = 1 and `.appshell-body` = 1 on `/` with the Start page showing ("LOCAL-FIRST WRITING STUDIO", "13 ACTIVE PROJECTS"). `.appshell-shell` is the root element of `AppShell` (`components/Layout/AppShell.tsx:1196`).
- Pressing Meta+K on the Start screen opened the `AppShell` resource palette (dialog "Open Resource", "No resources match your search."), so `AppShell`'s document keydown handler (`AppShell.tsx:916-926`) is live with no project open. An "Unlock your encrypted projects" dialog was also open (one encrypted project in the workspace).
- Source agreeing with the run (READ): `app/(app)/page.tsx` returns `<AppShell showSidebars={Boolean(selectedProject)} ...>` unconditionally (around line 1111) and passes `<StartPage ...>` as its child when `!selectedProject` (around line 1132). The doc comment at `page.tsx:131` ("Renders StartPage when no project is open, and AppShell once the user has opened a project") does not match that code.
- Console during the run: 404 for `/favicon.ico` and `/api/auth/get-session` (hosted auth not configured), Radix "Missing Description" warnings for the dialogs; no error from the shell.

Consequence for the spec (not a cause claim): the Gate 3 reading "AppShell is not mounted on the Start screen" in the spec's triage note, OQ-6 and FR-1(d) is contradicted by this run. Returned to the owner before Task 20.

### (e) Time cost of the folder-tree read and the client `parentId` walk

Synthetic project stated: 100 folders and 1,000 resources. Folders form 10 chains (folder `i >= 10` has folder `i - 10` as parent, depth up to 10), each written to its own `folder.json` under `folders/f<i>/` in an OS temp directory (flat layout, as `writeResourceToFile` produces). Resources are assigned to folders round-robin. The walk tests membership under the descendants of folder 0.

Machine: Darwin 25.5.0 under the command sandbox, Node v24.15.0, CPU model not read. One probe run; figures are a single sample of repeated calls, not a benchmark across runs.

- `readFolderTree(<synthetic folders dir>)` x20 calls: returned 100 descriptors; median 9.98 ms, min 8.40 ms, max 16.79 ms. (`folder-utils.ts:32`.)
- Client-style `parentId` walk (a `Map` of folder id to folder, a per-resource climb with a visited set) over 1,000 resources in 100 folders x50 repetitions: 100 resources matched; median 0.185 ms, min 0.178 ms, max 0.532 ms. In-memory only: no store, selector or React render was included.

Not measured: a larger or deeper tree, the read on an encrypted project, the object-store adapter (hosted), a cold file cache, or the cost through the real `getWritingLogAggregateCore` path.

## FR-13 shortcut checks

### Run 1: Playwright engine builds, synthetic key input (lead, 2026-11-09)

Commit `55becfec` (`feat/inbox-quick-capture`, main checkout), `pnpm exec next dev -p 3123` from `frontend/` (Next.js 16.2.6, Turbopack, dev build, outside the command sandbox), macOS Darwin 25.5.0, Start screen with no project open. Probe: a throwaway Node script (deleted after the run) using `@playwright/test`'s `chromium`, `firefox` and `webkit` launchers, headless. Per engine it waited for `.appshell-shell`, pressed Escape to close the startup unlock dialog, and added a document `keydown` listener registered after the app's, which recorded `metaKey`, `shiftKey` and `defaultPrevented`. It then pressed `Meta+Shift+K`, Escape, then `Meta+K`, listing the open `[role=dialog]` elements after each.

| Engine (Playwright build) | Version | Meta+Shift+K: dialog opened | `defaultPrevented` | Meta+K: dialog opened | `defaultPrevented` |
|---|---|---|---|---|---|
| Chromium | 148.0.7778.96 | Capture ("Enter saves the text to the Inbox of the project...") | true | Open Resource, first row "Capture" ("ENTER TO OPEN CAPTURE BOX") | true |
| Firefox | 150.0.2 | Capture | true | Open Resource with the Capture row | true |
| WebKit | 26.4 | Capture | true | Open Resource with the Capture row | true |

Each keypress produced exactly one `keydown` with key `k` at the listener. No dialog was open before the first keypress.

Limit of this run (a statement about the method, not a result): Playwright delivers key input to the page through the engine's automation protocol. These are Playwright's engine builds, not the installed Google Chrome, Safari or Firefox apps. So this run shows that the page handler receives the keys and calls `preventDefault`. It does not show whether a real browser's own menu shortcut or the OS takes Cmd+Shift+K before the page. That needs a physical keypress in each real browser.

### Electron menu accelerator (READ)

`grep -rn "Menu\.\|setApplicationMenu\|accelerator\|globalShortcut" electron/src` (tests excluded) returned no match, so the shell defines no custom menu, accelerator or global shortcut. READ. Whether Electron's default macOS application menu binds Cmd+Shift+K was not read from Electron's source and not run.

### Run 2: physical keypress by the owner (2026-11-09)

Same dev server and commit as Run 1 (`55becfec`, `http://localhost:3123`), macOS, Start screen with no project open. Browser versions were not recorded. As reported by the owner:

- **Google Chrome (macOS):** Cmd+K opened the palette with the Capture row. Cmd+Shift+K opened the Capture box directly. The result was the same with the unlock dialog open and with it closed.
- **The VS Code built-in browser (macOS):** same result as Chrome, including with the unlock dialog open and closed.

Whether `defaultPrevented` was true was not read in this run, because no listener was attached. The browser did nothing of its own that the owner reported.

### Not run

- Real Safari and Firefox with a physical keypress (macOS).
- The Electron desktop shell (`pnpm electron:dev` or packaged).
- Firefox on Windows or Linux (known candidate clash: Ctrl+Shift+K, the Web Console). Not run; not stated as fact.

## Writing-log and goal figures

Not yet measured. Appended by the tasks that touch the writing log and goal figures (Tasks 11, 12, 13).

## Not verified

- A paired-device run of capture and of its refusal.
- Hosted web against a real tenant.
- The Android entry (Feature 107).
- A locked-project capture in the real unlock flow.
- Cmd/Ctrl+Shift+K with a physical keypress in Safari, Firefox (macOS) and the Electron shell; Firefox on Windows or Linux (FR-13 checks above record Chrome and the VS Code browser only, plus synthetic input in three engines).
- The `plainText`-only create path in (a), a built-output check of (c), and (e) at sizes other than the one stated.

## Acceptance

Not yet recorded, appended by Task 28.
