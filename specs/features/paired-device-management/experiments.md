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
