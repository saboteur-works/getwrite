# Experiments: paired-device management (Feature 76)

## i: cross-package import

Date: 2026-10-09. Node v24.15.0 (local). Worktree `getwrite-wt-pdm`, no config edited.

Throwaway test `frontend/tests/unit/zz-cross-package-spike.test.ts` (deleted afterwards). It imported `readPairingState` from `../../../electron/src/sharing/pairing-code` and `addDevice`, `mintCredential`, `readCredentialStore` from `../../src/lib/sharing/credential-store`. It called `readPairingState` on an empty temp directory (got `{ kind: "absent" }`), minted a device, wrote it with `addDevice` into a temp directory, and read it back with `readCredentialStore` (kind `ok`, same device id).

1. Vitest, from `frontend/`: `pnpm exec vitest run tests/unit/zz-cross-package-spike.test.ts`
   - Output: `Test Files  1 passed (1)`, `Tests  1 passed (1)`.
2. With the throwaway file present:
   - `pnpm typecheck` (`tsc --noEmit`): exit 0, no diagnostics.
   - `pnpm lint`: exit 0, `395 problems (0 errors, 395 warnings)`; no line mentions the spike file.
3. Verdict: YES (vitest, typecheck and lint all accept it).
4. Consequence (spec FR-15): YES means the interleaving tests of Task 5 run against both real implementations.

Not tested: `electron/` typecheck (not part of the Done-when), and Node 20 (the machine ran Node 24).

`git status --short` from the repo root, after deleting the throwaway:

```
?? specs/features/paired-device-management/experiments.md
```

## Baselines at 05376fe3

Date: 2026-10-09. Every suite was run in the clean detached worktree `/Users/jedaisaboteur/Repositories/getwrite-wt-base` (`git rev-parse --short HEAD` = `05376fe3`, the commit named by the task; `node_modules` symlinked from the main checkout, no install). The main checkout and the write worktree are at a later, docs-only commit (the Feature 76 spec and task list, `42d5b8dd`, and the Task 1 record, `f4d993fe`), so the numbers are for `05376fe3` and not for them. No source was changed. Every command printed `WARN Issue while reading "~/.npmrc". EPERM` (sandbox); it did not change any result.

Node on this machine: `ls ~/.volta/tools/image/node` shows `22.23.2` and `24.15.0` only. **No Node 20 binary is available, so no Node 20 coverage is claimed** (CI's CLI job uses Node 20; the CLI suite below ran on Node 24.15.0 only). Default `node --version` is `v24.15.0`. Frontend and electron test suites were run under both 24.15.0 and 22.23.2 (PATH prefixed with `~/.volta/tools/image/node/22.23.2/bin`, `node --version` printed `v22.23.2`).

| # | Directory | Command | Node | Exit | Result |
|---|---|---|---|---|---|
| 1 | `frontend/` | `pnpm test:ci` | 24.15.0 | 0 | 591 test files passed (591); 5956 tests passed, 0 failed, 2 skipped (5958 total); 33.8 s |
| 2 | `frontend/` | `pnpm test:ci` | 22.23.2 | 0 | identical: 591 files passed; 5956 passed, 0 failed, 2 skipped; 33.4 s |
| 3 | `frontend/` | `pnpm typecheck` (`tsc --noEmit`) | 24.15.0 | 0 | no diagnostics |
| 4 | `frontend/` | `pnpm lint` | 24.15.0 | 0 | `395 problems (0 errors, 395 warnings)`; 7 warnings fixable with `--fix` |
| 5 | `electron/` | `pnpm test` (`vitest run`) | 24.15.0 | 0 | 20 test files passed (20); 250 tests passed, 0 failed, 0 skipped |
| 6 | `electron/` | `pnpm test` | 22.23.2 | 0 | identical: 20 files, 250 passed, 0 failed, 0 skipped |
| 7 | `electron/` | `pnpm typecheck` (`tsc --noEmit && tsc --noEmit --project tsconfig.worker.json`) | 24.15.0 | 0 | no diagnostics |
| 8 | repo root | `pnpm knip` | 24.15.0 | 1 | issues found, see below |
| 9 | repo root | `pnpm --filter getwrite-cli test` | 24.15.0 | 1 | 22 test files (20 passed, 2 failed); 144 tests (142 passed, 2 failed, 0 skipped); see below |

The two Node versions did not differ for the frontend or electron test suites. Typecheck and lint were run on Node 24.15.0 only. The frontend log prints `Not implemented: navigation to another Document` (jsdom message, no failure).

### knip (`pnpm knip`, exit 1)

Counts by section as knip printed them: Unused files 50; Unused dependencies 1; Unused devDependencies 6; Unlisted dependencies 6; Unlisted binaries 5; Unused exports 167; Unused exported types 170; Duplicate exports 14. That is **419 issues**, plus 6 Configuration hints (not counted as issues). These are the baseline that Feature 76 must not grow; the last feature fixed eleven.

Unused files (50), all of them:

```
android/harness/harness-entry.ts
android/harness/shims/async_hooks.mjs
android/harness/shims/buffer-inject.mjs
android/harness/shims/fs-promises.mjs
android/harness/shims/fs.mjs
android/harness/shims/path.mjs
demo/demo.spec.ts
demo/playwright.demo.config.ts
demo/screens.spec.ts
demo/seed.mjs
electron/src/preload.ts
frontend/.storybook/fs-shim.mjs
frontend/components/common/UI/Card/index.ts
frontend/components/common/UI/Textarea/index.ts
frontend/scripts/serve-storybook-static.mjs
frontend/src/hooks/use-toast.ts
frontend/src/lib/adapters/placeholderAdapter.ts
frontend/src/lib/api/index.ts
frontend/src/lib/models/native-bootstrap.web-stub.ts
frontend/src/native-shims/async-hooks.mjs
frontend/src/native-shims/fs-promises.mjs
frontend/src/native-shims/fs.mjs
frontend/src/native-shims/path.mjs
frontend/src/store/queries-guards.ts
frontend/src/store/transport/native-compile-backend.web-stub.ts
frontend/src/store/transport/native-editor-config-backend.web-stub.ts
frontend/src/store/transport/native-entity-alias-table-backend.web-stub.ts
frontend/src/store/transport/native-entity-graph-positions-backend.web-stub.ts
frontend/src/store/transport/native-entity-graph-settings-backend.web-stub.ts
frontend/src/store/transport/native-entity-mention-counts-backend.web-stub.ts
frontend/src/store/transport/native-export-backend.web-stub.ts
frontend/src/store/transport/native-feature-config-backend.web-stub.ts
frontend/src/store/transport/native-global-noise-words-backend.web-stub.ts
frontend/src/store/transport/native-mentions-backend.web-stub.ts
frontend/src/store/transport/native-metadata-schema-backend.web-stub.ts
frontend/src/store/transport/native-preferences-backend.web-stub.ts
frontend/src/store/transport/native-project-actions-backend.web-stub.ts
frontend/src/store/transport/native-project-backend.web-stub.ts
frontend/src/store/transport/native-project-types-backend.web-stub.ts
frontend/src/store/transport/native-prose-diagnostics-backend.web-stub.ts
frontend/src/store/transport/native-query-backend.web-stub.ts
frontend/src/store/transport/native-resource-backend.web-stub.ts
frontend/src/store/transport/native-resource-excerpts-backend.web-stub.ts
frontend/src/store/transport/native-revision-backend.web-stub.ts
frontend/src/store/transport/native-search-backend.web-stub.ts
frontend/src/store/transport/native-tags-backend.web-stub.ts
frontend/src/store/transport/native-word-count-goal-backend.web-stub.ts
frontend/tests/integration/refactorParity.ts
frontend/tests/unit/refactor-guardrails/fixtureBuilders.ts
specs/001-ui-getwrite-skeleton/scripts/capture-storybook-screenshots.js
```

Unused dependencies (1): `typedoc` (`frontend/package.json`). Unused devDependencies (6): `@capacitor/android`, `@capacitor/core`, `@capacitor/filesystem` (`android/package.json`); `@better-auth/cli`, `@eslint/eslintrc`, `next-devtools-mcp` (`frontend/package.json`). Unlisted dependencies (6): `@storybook/react` in `frontend/stories/Common/Listbox.stories.tsx`, `frontend/stories/Common/Tabs.stories.tsx`, `frontend/stories/Sidebar/controls/Controls.stories.tsx`, `frontend/stories/WorkArea/DiffView.stories.tsx`, `frontend/stories/WorkArea/ViewSwitcher.stories.tsx`; `offbeat-fm-theme.css` in `frontend/styles/saboteur-base.css`. Unlisted binaries (5): `electron-builder` (`.github/workflows/build-electron.yml`); `typecheck`, `lint`, `build` (`.github/workflows/frontend-checks.yml`); `cap` (`android/package.json`).

Unused exports (167 issues) are in these 103 files:

```
cli/src/commands/doctor.ts
cli/src/commands/prune.ts
cli/src/commands/qa.ts
cli/src/commands/reindex.ts
cli/src/commands/repair-revisions.ts
cli/src/commands/screenshots.ts
cli/src/commands/templates.ts
cli/src/qa/report.ts
cli/src/qa/server.ts
electron/src/projects-dir.ts
frontend/components/Timeline/index.ts
frontend/components/Timeline/utils.ts
frontend/components/TipTapEditor.tsx
frontend/components/common/UI/Card/Card.tsx
frontend/components/common/UI/ContextMenu/index.ts
frontend/components/common/UI/Dialog/Dialog.tsx
frontend/components/common/UI/Dialog/index.ts
frontend/components/common/UI/Popover/Popover.tsx
frontend/components/common/UI/Popover/index.ts
frontend/src/lib/api/compile.ts
frontend/src/lib/api/editor-config.ts
frontend/src/lib/api/entity-alias-table.ts
frontend/src/lib/api/entity-cooccurrence.ts
frontend/src/lib/api/entity-graph-positions.ts
frontend/src/lib/api/entity-mention-counts.ts
frontend/src/lib/api/entity-relationships.ts
frontend/src/lib/api/export.ts
frontend/src/lib/api/mentions.ts
frontend/src/lib/api/preferences.ts
frontend/src/lib/api/project-types.ts
frontend/src/lib/api/projects.ts
frontend/src/lib/api/prose-diagnostics.ts
frontend/src/lib/api/resource-excerpts.ts
frontend/src/lib/api/resources.ts
frontend/src/lib/api/schemas.ts
frontend/src/lib/api/tags.ts
frontend/src/lib/api/trash.ts
frontend/src/lib/core.ts
frontend/src/lib/desktop-bridge.ts
frontend/src/lib/editor-heading-settings.ts
frontend/src/lib/models/backlinks-watcher.ts
frontend/src/lib/models/backlinks.ts
frontend/src/lib/models/content-loss.ts
frontend/src/lib/models/diagnostics-index.ts
frontend/src/lib/models/editor-config-core.ts
frontend/src/lib/models/entity-alias-table.ts
frontend/src/lib/models/entity-graph-positions.ts
frontend/src/lib/models/entity-relationships.ts
frontend/src/lib/models/entity-shared-metadata.ts
frontend/src/lib/models/field-values.ts
frontend/src/lib/models/inverted-index.ts
frontend/src/lib/models/locks.ts
frontend/src/lib/models/memoryAdapter.ts
frontend/src/lib/models/mention-index.ts
frontend/src/lib/models/mentions-core.ts
frontend/src/lib/models/meta-locks.ts
frontend/src/lib/models/metadata-schema.ts
frontend/src/lib/models/previews.ts
frontend/src/lib/models/project-config.ts
frontend/src/lib/models/project-creator.ts
frontend/src/lib/models/project-features.ts
frontend/src/lib/models/project-view.ts
frontend/src/lib/models/project.ts
frontend/src/lib/models/pruneExecutor.ts
frontend/src/lib/models/query-ast.ts
frontend/src/lib/models/query-cache.ts
frontend/src/lib/models/resource.ts
frontend/src/lib/models/revision-manager.ts
frontend/src/lib/models/revision.ts
frontend/src/lib/models/saved-queries.ts
frontend/src/lib/models/schemas.ts
frontend/src/lib/models/sidecar.ts
frontend/src/lib/models/tags.ts
frontend/src/lib/models/uuid.ts
frontend/src/lib/node-display.ts
frontend/src/lib/projectTypes.ts
frontend/src/lib/tiptap-utils.ts
frontend/src/lib/toast-service.ts
frontend/src/lib/user-preferences.ts
frontend/src/store/project-actions-controller.ts
frontend/src/store/projectsSlice.ts
frontend/src/store/query-transport-service.ts
frontend/src/store/querySlice.ts
frontend/src/store/revision-normalization.ts
frontend/src/store/revision-transport-service.ts
frontend/src/store/revisionsSlice.ts
frontend/src/store/searchSlice.ts
frontend/src/store/store.ts
frontend/src/store/transport/search-transport.ts
frontend/tests/helpers/appShellFetchStub.ts
frontend/tests/unit/helpers/fs-utils.ts
frontend/tests/unit/helpers/project-creator.ts
…/lib/models/scrivener/apply-document-metadata.ts
…d/src/store/metadata-schema-transport-service.ts
…end/components/ResourceTree/ResourceTreeIcons.tsx
…end/src/store/feature-config-transport-service.ts
…ents/Editor/Extensions/StripExternalPasteColor.ts
…ents/WorkArea/Views/TimelineView/TimelineView.tsx
…lib/models/plaintext/import-plaintext-project.ts
…lib/models/scrivener/import-scrivener-project.ts
…mponents/project-types/ProjectTypeDraftService.ts
…nd/components/WorkArea/Views/TimelineView/index.ts
…tityRelationshipGraphView/edgeTooltipPlacement.ts
```

Unused exported types (170 issues) are in these 80 files:

```
cli/src/commands/qa.ts
cli/src/qa/verify.ts
electron/src/projects-dir.ts
frontend/components/Layout/AppShell.tsx
frontend/components/Timeline/index.ts
frontend/components/WorkArea/DiffView.tsx
frontend/components/help/help-content.ts
frontend/src/lib/api/export.ts
frontend/src/lib/api/projects.ts
frontend/src/lib/core.ts
frontend/src/lib/desktop-bridge.ts
frontend/src/lib/models/project-view.ts
frontend/src/lib/models/query-ast.ts
frontend/src/lib/models/resource.ts
frontend/src/lib/models/saved-queries.ts
frontend/src/lib/models/schemas.ts
frontend/src/lib/models/types.ts
frontend/src/lib/models/update-check.ts
frontend/src/store/searchSlice.ts
frontend/src/types/project-types.ts
…/Editor/Extensions/MediaDropExtension.ts
…/components/QueryBuilder/FilterChip.tsx
…/components/common/UI/Button/Button.tsx
…/components/common/UI/Dialog/Dialog.tsx
…/lib/models/scrivener/binder-mapper.ts
…/lib/models/scrivener/import-report.ts
…/lib/models/scrivener/rtf-to-tiptap.ts
…/src/lib/models/capacitor-filesystem.ts
…Extensions/entityHighlightDecoration.ts
…Views/OrganizerView/organizerFilters.ts
…c/lib/models/plaintext/txt-to-tiptap.ts
…c/lib/models/scrivener/binder-mapper.ts
…c/lib/models/scrivener/import-report.ts
…c/lib/models/scrivener/rtf-to-tiptap.ts
…c/scrivener-import/selection-handles.ts
…chemaManager/DeprecateOrClearDialog.tsx
…components/QueryBuilder/ValuePicker.tsx
…d/components/common/UI/Checkbox/index.ts
…d/components/common/UI/Select/Select.tsx
…d/src/lib/models/resource-crud-core.ts
…ditor/MenuBar/toolbar-command-schema.ts
…ebar/controls/MultiResourceRefInput.tsx
…end/components/common/UI/Button/index.ts
…end/components/common/UI/Select/index.ts
…ents/Editor/Extensions/GetWriteImage.ts
…ents/Editor/MenuBar/EditorMenuInput.tsx
…ib/models/scrivener/metadata-mapper.ts
…ionshipGraphView/EntityGraphCanvas.tsx
…itor/MenuBar/EditorMenuColorSubmenu.tsx
…lib/compile/run-compile-and-download.ts
…lib/models/scrivener/metadata-mapper.ts
…mponents/WorkArea/useRevisionContent.ts
…mponents/common/CompilePreviewModal.tsx
…mponents/common/UI/Checkbox/Checkbox.tsx
…mponents/common/UI/Textarea/Textarea.tsx
…nd/components/common/UI/Dialog/index.ts
…nents/Layout/ShellProjectTypeLoader.tsx
…ntend/components/common/UI/Chip/index.ts
…ntend/src/lib/editor-heading-settings.ts
…ntend/src/lib/models/project-creator.ts
…ntend/src/lib/models/revision-repair.ts
…nts/Editor/MenuBar/useToolbarCommand.ts
…nts/WorkArea/Views/TimelineView/index.ts
…onents/Editor/MenuBar/EditorMenuIcon.tsx
…onents/WorkArea/useCanonicalAutosave.ts
…onshipGraphView/edgeTooltipPlacement.ts
…ontend/src/lib/compile/download-file.ts
…ontend/src/lib/models/project-loader.ts
…phView/EntityRelationshipGraphView.tsx
…rc/lib/models/native-device-harness.ts
…rea/Views/TimelineView/TimelineView.tsx
…rivener-import/handle-import-request.ts
…s/EntityRosterView/EntityRosterView.tsx
…tend/components/common/UI/Card/Card.tsx
…tend/components/common/UI/Input/index.ts
…tend/src/lib/models/media-validation.ts
…tend/src/lib/models/project-creator.ts
…tend/src/lib/models/query-intrinsics.ts
…tionshipGraphView/EntityGraphCanvas.tsx
…ts/QueryBuilder/useQueryBuilderState.ts
```

Duplicate exports (14), each as `name|alias` in its file: `registerDoctor|default` (`cli/src/commands/doctor.ts`), `registerPrune|default` (`prune.ts`), `registerQa|default` (`qa.ts`), `registerReindex|default` (`reindex.ts`), `registerRepairRevisions|default` (`repair-revisions.ts`), `registerScreenshots|default` (`screenshots.ts`), `registerTemplates|default` (`templates.ts`), all under `cli/src/commands/`; `flushIndexer|waitForDrain` (`frontend/src/lib/models/indexer-queue.ts`); `bootstrapNativeStorageContext|ensureNativeStorageContext` (`frontend/src/lib/models/native-bootstrap.ts`); `pruneAllResources|default` (`frontend/src/lib/models/pruneExecutor.ts`); `Schemas|default` (`frontend/src/lib/models/schemas.ts`); `toastService|default` (`frontend/src/lib/toast-service.ts`); `useAppSelector|default` (`frontend/src/store/hooks.ts`); `store|default` (`frontend/src/store/store.ts`). (14 entries, matching knip's header.)

Configuration hints (6): `frontend`, `android` and `. (root)` workspaces in `knip.json` ("Add entry and/or refine project files"); `knip.json` ignore entry for `…transport/native-trash-backend.web-stub.ts` ("Remove from ignore"); `src/getwrite-cli.ts` in workspace `cli` ("Remove redundant entry pattern"); `index.js` in `package.json` ("Package entry file not found").

### CLI suite (`pnpm --filter getwrite-cli test`, exit 1)

Node 24.15.0 only (no Node 20 here). Run twice, since the task allowed one retry of `tests/qa/server.test.ts` outside the sandbox:

- Sandboxed run: 2 failed, 142 passed (144), 20 of 22 files passed.
- Run with `dangerouslyDisableSandbox`: identical, 2 failed, 142 passed (144), 20 of 22 files passed.

Failing tests (same two in both modes):

1. `tests/qa/server.test.ts > startQaServer > when port 3000 is occupied it starts on a different port, sets GETWRITE_PROJECTS_DIR before start, serves valid JSON, and stops cleanly with no orphaned process` (failed 3 attempts, `retry x2`). Error: `QA dev server exited before becoming ready (code=1, signal=null)`, thrown at `src/qa/server.ts:564`. The log does not contain `EMFILE`, so the sandbox was not shown to be the cause: the failure is the same outside the sandbox. This tree's `frontend/node_modules` is a symlink to the main checkout, and `tasks.md` records that Turbopack rejects a symlinked `frontend/node_modules`; the dev server's own output was not captured, so that link is a hypothesis. An experiment that would settle it: run this one test file in the main checkout (non-symlinked `node_modules`) and compare.
2. `tests/qa/workspace.test.ts > QA session record location > places the record inside the repo, outside the projects tree`. Assertion at `workspace.test.ts:124`: `expect(sessionPath.startsWith(path.resolve(repoRoot))).toBe(true)` received `false`. In this tree `.git` is a file (a worktree pointer), and the git dir resolves to `/Users/jedaisaboteur/Repositories/getwrite/.git/worktrees/getwrite-wt-base`, outside the worktree root. That is a measurement about the tree; whether the test passes in the main checkout was not run here.

Neither failure was fixed. Because both may depend on running in a worktree, the CLI row is a baseline for this worktree only; the main checkout's CLI result was not measured.

### git status

Baseline tree (`/Users/jedaisaboteur/Repositories/getwrite-wt-base`, `git status --short`):

```
```

Write tree (`/Users/jedaisaboteur/Repositories/getwrite-wt-pdm`, `git status --short`, taken before this section was appended and empty, because Task 1's `experiments.md` is already committed; the section itself is the only change, shown below):

```
```

After appending this section:

```
 M specs/features/paired-device-management/experiments.md
```

## Built-server verification A

Task 10. Date 2026-10-09, main checkout `/Users/jedaisaboteur/Repositories/getwrite`, branch `feat/paired-device-management`, Node 24.15.0, all commands inside the sandbox (no sandbox error, no retry outside it). `git status --short` was empty before starting. Nothing was listening on `127.0.0.1:3000` (`lsof -iTCP:3000 -sTCP:LISTEN` printed nothing, exit 1). No pairing code, cookie, window secret or credentialHash was printed or is recorded here.

### Builds

1. `cd frontend && pnpm build` (20:50 MDT): exit=0.
2. `.next/static` copied into `frontend/.next/standalone/frontend/.next/static`: done.
3. `cd electron && pnpm build` (`tsc`): exit=0. `electron/dist/sharing/device-management.js` exists and exports `listDevices`, `renameDevice`, `revokeDevice`.

### Driver run

Throwaway driver (outside the tree, copy at `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/device-revoke-verify.mjs`, not kept in the repo). Command: `node device-revoke-verify.mjs`, run 20:51 MDT, exit=0. It started `.next/standalone/frontend/server.js` as a detached child on loopback port 53375 with `PORT`, `HOSTNAME=127.0.0.1`, `GETWRITE_BIND=127.0.0.1`, `GETWRITE_SHARING=1`, `GETWRITE_SHARING_DIR` (temp), `GETWRITE_WINDOW_SECRET`, `GETWRITE_PROJECTS_DIR` (temp), `GETWRITE_TEMPLATES_DIR`, and stopped it by process-group kill in a `finally` (plus exit/SIGINT/SIGTERM handlers). Afterwards `lsof -i :53375` printed nothing (exit 1); the temp directories were removed.

Enumeration (same walk as `sharing-refusal-smoke.mjs`): 90 entries = 7 pages + 83 API route/method pairs. Excluded from the "refused" requests as the smoke script does: `GET /pair` and `POST /api/sharing/pair` (88 gated entries: 6 pages, 82 API).

Driver result: 33 checks, 0 failures. Observed:

- Done-when 3: A and B each paired through the real `POST /api/sharing/pair` (status 200 each, pairing state written by `generatePairingCode`/`writePairingState` from `electron/dist`); the two cookies differ.
- Done-when 4: before revoke, `GET /` and `GET /api/auth-status` answered 200 for both A and B.
- Done-when 5: `revokeDevice(dir, A.id)` returned `ok`; the server process was still running (not restarted).
- Done-when 6: the first request with A's cookie after the revoke was refused (requests until refusal: 1). Across all 88 gated entries A's old cookie was refused: 6 of 6 pages redirected to `/pair`, 82 of 82 API entries answered 401 with `x-getwrite-gate: not-paired`. `GET /pair` itself is not gated and answered 200. No refused response for A carried `Set-Cookie`.
- Done-when 7: with B's cookie, 88 of 88 gated entries were not refused by the gate (no `x-getwrite-gate` header, no redirect to `/pair`).
- Done-when 8 (FR-12): A's cookie presented 5 times on `/api/auth-status`, then after `renameDevice(dir, B.id, ...)` (returned `ok`) on the API and on `/`: confirmed 0 times, `Set-Cookie` seen 0 times; after the rename the API answer was 401 not-paired and the page a redirect to `/pair`. B still answered 200 after its rename; `listDevices` showed one device named as renamed.
- Done-when 9 (FR-11): with A's old cookie sent, `POST /api/sharing/pair` with a fresh code answered 200 with a new cookie different from A's old one; the new cookie answered 200 on API and page; A's old cookie was still refused (401 not-paired, redirect to `/pair`). `listDevices` then listed 2 devices.
- Done-when 10 (FR-5(d)): with B's cookie, `GET /api/sharing/devices`, `POST /api/sharing/devices/rename`, `POST /api/sharing/devices/revoke`, `DELETE /api/sharing/devices`, `PATCH /api/sharing/devices` each answered 404 (no such route exists under `app/api/sharing`, only `pair`); the response bodies did not contain B's id, and the store file was byte-identical before and after.
- `listDevices` output: keys per device `id`, `name`, `createdAt` only; the serialized result contained neither `credentialHash` nor any 64-hex string.
- Done-when 13: `device-credentials.json` mode 0600; directory listing at the end: `device-credentials.json`, `pairing-state.json` (no `.lock`, no `.tmp`).

Not exercised: the IPC layer (preload to main to handler) and the real Electron window; this task calls the same functions the handlers call. Covered by Task 6's tests and, for the window, by Task 14's manual steps.

### Existing suites

- `cd frontend && pnpm test:sharing-smoke; echo "exit=$?"` (20:51 MDT): exit=0. `pairing page static URLs checked: 15`, `static files checked: 122`, `enumerated entries: 90; checks: 28; failures: 0`, `sharing refusal smoke: all checks passed`. Compared with the last recorded run (90 entries, 24 checks, 0 failures): entries and failures match; the check count is 28, not 24. The cause of the 4-check difference was not investigated (the reference may predate checks added to the script; not established).
- `cd frontend && pnpm exec vitest run tests/unit/sharing-gate-enumeration.test.ts` (20:51 MDT): exit=0, 1 file passed, 32 tests passed, 0 failed.

`git status --short` afterwards: only `specs/features/paired-device-management/experiments.md` and `tasks.md` (this section and the Task 10 tick).

## Built-server verification B

Task 11. Date 2026-10-09 (final run 21:00 MDT), main checkout `/Users/jedaisaboteur/Repositories/getwrite`, branch `feat/paired-device-management`, HEAD `2651291e`, Node 24.15.0, Chromium 148.0.7778.96 (Playwright `chromium_headless_shell-1223`, headless) driven by the repo's `@playwright/test`. The built app is the build from `124419b1` already in `frontend/.next` and `electron/dist` (no source changed since; not rebuilt). No pairing code, cookie value, window secret or credentialHash was printed or is recorded here; cookies are named only by first-seen order (`cookie#N`, from a hash the driver kept in memory). Driver (throwaway, outside the tree): `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/verify-b.mjs` with `harness.mjs`; it starts `.next/standalone/frontend/server.js` as its own detached child on an ephemeral loopback port with sharing on and temp `GETWRITE_SHARING_DIR`/`GETWRITE_PROJECTS_DIR`, and stops it by process-group kill in `finally`. `lsof -iTCP:3000 -sTCP:LISTEN` printed nothing before starting.

### Chromium and the sandbox

Inside the command sandbox, `chromium.launch` failed: `browserType.launch: Target page, context or browser has been closed` with the launch log for `chrome-headless-shell` (a sandbox-shaped failure: browser process gone at launch). That one command was retried outside the sandbox (`dangerouslyDisableSandbox`) and Chromium then launched; every browser run below, including the final run, was outside the sandbox. The server and file work in the driver ran in the same outside-sandbox process.

### Observed (final run; an earlier complete run gave the same results within 0.1 s)

1. Hydration. Unpaired context U: `GET /pair` 200, heading "Pair this device". With a pairing code written to the store, typing a wrong 6-digit value was accepted by the field (value length 6) and Pair was clicked: the page stayed on `/pair` with no query string (no native form submission), and an inline alert showed "That code is not right. Check the code on your computer and try again." (`POST /api/sharing/pair` 400). Playwright reported two main-frame navigation events, both `/pair`, no other URL. Four contexts A, B, C, D were then paired through the real page with real codes (generated by the built `electron/dist/sharing/pairing-code.js`); each landed on `/` and showed the app (start page, "LIBRARY"); one `getwrite_device` cookie entry in A's and in B's jar. A (via its paired context) created project "Verify project" and two text resources, "Scene one" and "Scene two", in the Workspace folder; A opened Scene one and B opened Scene two in the editor (one `.ProseMirror` each). Observation about the setup, not explained: the `project.id` returned by `POST /api/projects` differs from the project's directory name (`rootPath` basename), and `POST /api/resource` needs the directory name as `projectId`.

2. FR-9(c). A typed T1 = "Alpha before revoke."; footer went "Autosave queued…" then "Saved"; disk then held T1 in `content.tiptap.json` and in `v-1` (the only revision). Then `revokeDevice(dir, A.id)` returned `ok` (server process `exitCode` null, not restarted); `revokeDevice(dir, C.id)` for an idle observer C was done in the same instant. Immediately A typed T2 = "Bravo after revoke." (from 0.01 s to 0.72 s after the revoke returned).
   - A's URL became `/pair?reason=unpaired` at 3.23 s after the revoke returned (two main-frame navigation events, 3.20 s and 3.22 s, both that URL). The page showed "Pair this device | This device is not paired. On your computer, open GetWrite, turn on sharing, and enter the code shown there. | Pairing code | PAIR".
   - Mechanism as observed only: A made no request at all between the revoke and 3.19 s. At 3.19 s its first request was `PATCH /api/resource/revision/<id>` (resource type `fetch`), answered 401 with `x-getwrite-gate: not-paired`; the next request, 0.00 s later, was `GET /pair?reason=unpaired` (resource type `document`), followed by that page's static assets (200). No 3xx response to A's own requests was seen before it. The URL form `/pair?reason=unpaired` is the string `DeviceNotPairedGuard.tsx` assigns; the run did not otherwise discriminate guard from other mechanisms (e.g. by disabling the guard).
   - Polling: none observed from A. Between the revoke and the PATCH A sent no request in 3.19 s.
   - C (idle, not typing, revoked at the same instant): after 45 s it had made 0 requests and was still on the start page; it never reached `/pair` in the window. So the page left the app only when it made a request.
   - B (not revoked): see item 5; B's editor and a B save worked after A's revoke.

3. Experiment (ii), OQ-15. Typed before the revoke took effect: T1 "Alpha before revoke." (saved, on disk). Typed after: T2 "Bravo after revoke.". After A had left the editor, `content.tiptap.json` for Scene one read exactly "Alpha before revoke." and the latest revision (`v-1`, still the only revision) read exactly "Alpha before revoke."; T2 was not in either file. A's footer states, sampled every ~100 ms, from the revoke until it left: "Saved" (t=0.01 s, the T1 state), then "Autosave queued…" (t=0.11 s) and nothing else; "Saved" and "All changes saved" were not shown for T2. "Autosave failed" was not seen by the sampler (the navigation followed the 401 by about 0.02 s, so the run does not show whether it was ever painted). The pairing screen text A arrived on (quoted above) says nothing about unsaved text. The browser console logged "Failed to persist canonical revision content Error: Failed to persist revision (401)". Verdict as observed: with a real revoke, text typed in the revoked editor after the revoke was not written to disk and was not shown as saved, and the screen A ended on did not mention it.

4. Experiment (iii), OQ-16. Cookie ids the server received from A: before the revoke `cookie#1`; after the revoke (before re-pair) `cookie#1`; the re-pair `POST /api/sharing/pair` itself carried `cookie#1` (the old one, sent with the request, as the browser had it); after the re-pair, across 48 requests from A (page loads, assets, API), only `cookie#5` (a new value). Jar entries named `getwrite_device`: before re-pair `[cookie#1]`, after `[cookie#5]` (one entry each time). Requests from A after the re-pair carrying the old value: 0. Requests from A carrying more than one `getwrite_device` value in one Cookie header, over the whole run: 0. After re-pair A was on `/` and showed the app. Verdict as observed: the browser replaced the old cookie with the new one in the same context; the old value was sent once (with the re-pair request) and never after; both values were never sent together. `listDevices` then showed 3 devices (B, D, and A's new device; the old A and C were revoked).

5. Revoke while on the pairing screen, and rename mid-edit.
   - D (paired, then navigated to `/pair`) was revoked with `revokeDevice` -> `ok`: after 6 s D was still on `/pair`, its page text was byte-identical, and it made 0 new requests. D then loaded `/` and ended on `/pair`. B stayed at `/`.
   - B (not revoked) typed "Charlie B part one. ", `renameDevice(B, "Renamed B")` -> `ok` while the text was unsaved, B kept typing "Delta B part two."; B stayed on `/`, footer "Autosave queued…" then "Saving…" then "Saved"; B's editor held "Charlie B part one. Delta B part two."; disk (`content.tiptap.json` and `v-1`) held exactly that text; B's 3 recorded requests since A's revoke: 1 answered 200 and none carried an `x-getwrite-gate` header (2 had no response matched by the driver); after a reload B was on `/` and showed the app.

6. Console and network errors seen (not explained beyond what is stated; none was investigated):
   - U: `POST /api/sharing/pair` 400 (the wrong code, expected by the test) and the matching console "Failed to load resource ... 400".
   - A x4, B x3, C x2, D x1: `GET /api/auth/get-session` 404 and the matching console "Failed to load resource ... 404". These occurred in contexts that were never revoked at the time (B) and in every context; the run did not look into why this request is made or why it is 404.
   - A, B: console warning "[react-tooltip] Do not set `style.border`. Use `border` prop instead." x2 each.
   - A x1 each: `PATCH /api/resource/revision/<id>` 401 and its console "Failed to load resource ... 401", console error "Failed to persist canonical revision content Error: Failed to persist revision (401)", and `requestfailed` `net::ERR_ABORTED` for the same PATCH (the page was navigating away).
   - No page errors (`pageerror`) in any context.

7. Cleanup. The driver stopped the server's process group in `finally`; afterwards `lsof -iTCP -sTCP:LISTEN` showed no node listener, and the temp directory (`gw-t11-*` under `$TMPDIR`) was removed (`ls` of the temp root showed none). `git status --short` showed only this file.

Not run: nothing from the task list was skipped. Not tested here: the Electron window and IPC (Task 6 tests and Task 14), a physical phone (Task 14), a revoke while the sharing flag is off.

warning sentence needed: YES, because with a real revoke performed while A's editor was open, the text typed after the revoke ("Bravo after revoke.") was not on disk afterwards (content and latest revision both held only the pre-revoke text), A never showed it as saved, and the pairing screen A ended on did not mention it.

Task 12 decision taken = YES: the sentence "Unsaved edits on that device will be lost." was added to the revoke dialog description (`sharing-copy.ts`). Failing first: `PairedDevices > revoke (Task 8) > opens a dialog with the spec copy naming the device, and cancel is the default focus` (and `builds the copy safely for a name containing braces`) failed with "TestingLibraryElementError: Unable to find an element with the text: Safari on iPad will be refused from now on. ... Unsaved edits on that device will be lost.."; both pass after the change.
