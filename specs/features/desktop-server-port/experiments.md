# Experiments: Feature 80 (desktop server port)

## Baselines

Task 1. Date 2026-10-10. Main checkout, branch `feat/desktop-server-port`, `git rev-parse --short HEAD` = `5c9b49f0`, tree clean at the start (`git status --short` printed nothing). `node --version` = v24.15.0 for every command (the CI Node 22 and Node 20 were not used; no Node 20 or CI result was seen). Unedited tree: no source change. Recorded by the implementor of Task 1.

### Pre-checks and process safety

Before any server: `lsof -iTCP:3000`, `6006` and `7340 -sTCP:LISTEN` printed nothing (all free). Re-checked 3000 and 7340 before the build and 3000 before the smoke run: free. The owner's `~/Library/Application Support/getwrite-electron/` was not read, listed or written.

### Sandbox use

Inside the command sandbox: `pnpm test:ci`, `pnpm typecheck`, `pnpm lint` (frontend/), `pnpm test` and `pnpm typecheck` (electron/), `pnpm knip` (repo root, `COLUMNS=400`), `pnpm --filter getwrite-cli test`, git reads. Outside the sandbox (`dangerouslyDisableSandbox: true`): `pnpm build`, the `.next/static` copy, `pnpm test:sharing-smoke`, `pnpm test:e2e`, and the port checks around them. The only stderr noise was the pnpm `~/.npmrc` EPERM warning. One CLI-run message: the sandbox printed `sysmon request failed with error: sysmond service not found` during the CLI suite.

### Results

| Command (directory) | Date | Sandbox | Exit | Result |
| --- | --- | --- | --- | --- |
| `pnpm test:ci` (frontend/) | 2026-10-10 | inside | 0 | 607 files passed; 6434 tests passed, 0 failed, 1 skipped (6435); duration 36.94s. The skipped test was not identified. |
| `pnpm typecheck` (frontend/) | 2026-10-10 | inside | 0 | `tsc --noEmit`, no errors |
| `pnpm lint` (frontend/) | 2026-10-10 | inside | 0 | 0 errors, 395 warnings (0 errors and 7 warnings potentially fixable) |
| `pnpm test` (electron/) | 2026-10-10 | inside | 0 | 25 files passed; 384 tests passed, 0 failed, 0 skipped |
| `pnpm typecheck` (electron/) | 2026-10-10 | inside | 0 | `tsc --noEmit && tsc --noEmit --project tsconfig.worker.json`, no errors |
| `pnpm --filter getwrite-cli test` (root) | 2026-10-10 | inside | 0 | 22 files passed; 144 tests passed, 0 failed; duration 12.08s (the output also printed `error: missing required argument 'scrivPath'` and `'source'`, which are the tests' own expected-error output; the suite passed) |
| `pnpm build` (frontend/) | 2026-10-10 | outside | 0 | built; `frontend/.next/static` copied to `frontend/.next/standalone/frontend/.next/static` (the old copy in that path was removed first) |
| `pnpm test:sharing-smoke` (frontend/) | 2026-10-10 | outside | 0 | `pairing page static URLs checked: 15`, `static files checked: 122`, `enumerated entries: 91; checks: 28; failures: 0`, "sharing refusal smoke: all checks passed". The smoke picks its own port; 3000 had no listener afterwards. |
| `pnpm test:e2e` (frontend/) | 2026-10-10 | outside | 0 | 214 passed, 0 failed, 1 skipped (47.3s). The skipped test was not identified. |
| `pnpm knip` (root) | 2026-10-10 | inside | 1 | see below (knip exits 1 when it reports any issue) |

A first attempt to run the build and smoke used a log path under the sandbox `$TMPDIR`, which does not exist outside the sandbox; the redirect failed, `pnpm build` was not run by that attempt, and `.next/static` was copied from whatever `.next` already held. The build, copy and smoke were then re-run from scratch with a log path outside `$TMPDIR` (the results above are from that second run only).

### e2e and the Storybook process

6006 had no listener before the run. `pnpm test:e2e` does not need a Storybook started by hand: the Playwright config's `webServer` runs `pnpm run build-storybook && node scripts/serve-storybook-static.mjs` on 6006 (`reuseExistingServer: true`). A background `lsof` poll every 3 s during the run saw exactly one listener pid on 6006: 929. That server was started by Playwright's `webServer`, not by a separate command of mine, so no pid was stopped by me. After the run `lsof -iTCP:6006 -sTCP:LISTEN` printed nothing (the server was gone), and no storybook or serve-storybook process was found with `ps`. The task did not start `pnpm storybook` (dev) at all.

### knip

Exit 1. Issue count per section: Unused files 57; Unused dependencies 1; Unused devDependencies 4; Unlisted dependencies 6; Unlisted binaries 4; Unused exports 166; Unused exported types 170; Duplicate exports 14; Configuration hints 6. The full output follows (ANSI colour removed, `COLUMNS=400` so most paths are not shortened; the Configuration hints block still shows `…` shortened paths) so later runs are compared by set.

```
> getwrite@2.2.0 knip /Users/jedaisaboteur/Repositories/getwrite
> knip

Unused files (57)
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
specs/features/paired-device-limits/scripts/browser-limits.mjs
specs/features/paired-device-limits/scripts/dev-reachability.mjs
specs/features/paired-device-limits/scripts/electron-limits.mjs
specs/features/paired-device-limits/scripts/header-experiment.mjs
specs/features/paired-device-limits/scripts/traversal-experiment.mjs
specs/features/paired-device-limits/scripts/two-clients.mjs
specs/features/paired-device-limits/scripts/verify-limits.mjs
Unused dependencies (1)
typedoc  frontend/package.json:89:6
Unused devDependencies (4)
@capacitor/filesystem  android/package.json:19:6
@better-auth/cli       frontend/package.json:93:6
@eslint/eslintrc       frontend/package.json:96:6
next-devtools-mcp      frontend/package.json:118:6
Unlisted dependencies (6)
@storybook/react      frontend/stories/Common/Listbox.stories.tsx:2:37
@storybook/react      frontend/stories/Common/Tabs.stories.tsx:2:37
@storybook/react      frontend/stories/Sidebar/controls/Controls.stories.tsx:2:32
@storybook/react      frontend/stories/WorkArea/DiffView.stories.tsx:3:32
@storybook/react      frontend/stories/WorkArea/ViewSwitcher.stories.tsx:3:37
offbeat-fm-theme.css  frontend/styles/saboteur-base.css:2:17
Unlisted binaries (4)
electron-builder  .github/workflows/build-electron.yml
typecheck         .github/workflows/frontend-checks.yml
lint              .github/workflows/frontend-checks.yml
build             .github/workflows/frontend-checks.yml
Unused exports (166)
registerDoctor                                        function  cli/src/commands/doctor.ts:114:17
registerPrune                                         function  cli/src/commands/prune.ts:69:17
stopServerByPid                                       function  cli/src/commands/qa.ts:468:23
registerQa                                            function  cli/src/commands/qa.ts:627:17
registerReindex                                       function  cli/src/commands/reindex.ts:42:17
runRepairRevisions                                    function  cli/src/commands/repair-revisions.ts:30:23
registerRepairRevisions                               function  cli/src/commands/repair-revisions.ts:68:17
registerScreenshots                                   function  cli/src/commands/screenshots.ts:84:17
registerTemplates                                     function  cli/src/commands/templates.ts:76:17
defaultRepoRoot                                       function  cli/src/qa/report.ts:73:17
QA_SERVER_LOG_FILENAME                                          cli/src/qa/server.ts:47:14
DEFAULT_READY_PROBE_PATHS                                       cli/src/qa/server.ts:184:14
WORKSPACE_FOLDER_NAME                                           electron/src/projects-dir.ts:30:14
WORKSPACE_CONFIG_FILENAME                                       electron/src/projects-dir.ts:184:14
cardVariants                                                    frontend/components/common/UI/Card/Card.tsx:39:10
EditContextMenu                                                 frontend/components/common/UI/ContextMenu/index.ts:9:21
DialogTrigger                                                   frontend/components/common/UI/Dialog/Dialog.tsx:126:3
DialogPortal                                                    frontend/components/common/UI/Dialog/Dialog.tsx:127:3
DialogOverlay                                                   frontend/components/common/UI/Dialog/Dialog.tsx:128:3
DialogClose                                                     frontend/components/common/UI/Dialog/Dialog.tsx:129:3
DialogTrigger                                                   frontend/components/common/UI/Dialog/index.ts:3:3
DialogPortal                                                    frontend/components/common/UI/Dialog/index.ts:4:3
DialogOverlay                                                   frontend/components/common/UI/Dialog/index.ts:5:3
DialogClose                                                     frontend/components/common/UI/Dialog/index.ts:6:3
DialogHeader                                                    frontend/components/common/UI/Dialog/index.ts:8:3
PopoverClose                                                    frontend/components/common/UI/Popover/index.ts:4:3
PopoverClose                                                    frontend/components/common/UI/Popover/Popover.tsx:45:35
default                                               variable  …ents/Editor/Extensions/StripExternalPasteColor.ts:30:16
toItemKey                                             function  …mponents/project-types/ProjectTypeDraftService.ts:77:17
normalizeDefinition                                   function  …mponents/project-types/ProjectTypeDraftService.ts:98:17
FileIcon                                              function  …end/components/ResourceTree/ResourceTreeIcons.tsx:87:17
TimelineTooltip                                                 frontend/components/Timeline/index.ts:2:21
getAdaptiveFormat                                     function  frontend/components/Timeline/utils.ts:250:17
resolveOffsetToPosition                                         frontend/components/TipTapEditor.tsx:40:10
TOOLTIP_POINTER_GAP                                             …tityRelationshipGraphView/edgeTooltipPlacement.ts:42:14
TimelineView                                                    …nd/components/WorkArea/Views/TimelineView/index.ts:2:21
default                                               function  …ents/WorkArea/Views/TimelineView/TimelineView.tsx:44:25
resolveCompileTransport                                         frontend/src/lib/api/compile.ts:155:14
resolveEditorConfigTransport                                    frontend/src/lib/api/editor-config.ts:112:14
resolveEntityAliasTableTransport                                frontend/src/lib/api/entity-alias-table.ts:105:14
resolveEntityCooccurrenceTransport                              frontend/src/lib/api/entity-cooccurrence.ts:114:14
httpEntityGraphPositionsTransport                               frontend/src/lib/api/entity-graph-positions.ts:55:14
resolveEntityMentionCountsTransport                             frontend/src/lib/api/entity-mention-counts.ts:104:14
resolveEntityRelationshipsTransport                             frontend/src/lib/api/entity-relationships.ts:281:14
resolveExportTransport                                          frontend/src/lib/api/export.ts:117:14
resolveMentionsTransport                                        frontend/src/lib/api/mentions.ts:142:14
resolvePreferencesTransport                                     frontend/src/lib/api/preferences.ts:93:14
resolveProjectTypesTransport                                    frontend/src/lib/api/project-types.ts:70:14
httpProjectsTransport                                           frontend/src/lib/api/projects.ts:90:14
resolveProjectsTransport                                        frontend/src/lib/api/projects.ts:160:14
resolveProseDiagnosticsTransport                                frontend/src/lib/api/prose-diagnostics.ts:220:14
resolveResourceExcerptsTransport                                frontend/src/lib/api/resource-excerpts.ts:85:14
resolveResourcesTransport                                       frontend/src/lib/api/resources.ts:419:14
ApiEditorConfigSchema                                           frontend/src/lib/api/schemas.ts:88:14
ProjectSchema                                                   frontend/src/lib/api/schemas.ts:196:14
FolderSchema                                                    frontend/src/lib/api/schemas.ts:213:14
LockedProjectListEntrySchema                                    frontend/src/lib/api/schemas.ts:265:14
resolveTagsTransport                                            frontend/src/lib/api/tags.ts:155:14
resolveTrashTransport                                           frontend/src/lib/api/trash.ts:231:14
renameFolderById                       creator                  frontend/src/lib/core.ts:28:26
writeTrashRefRecord                    creator                  frontend/src/lib/core.ts:41:3
readTrashRefRecord                     creator                  frontend/src/lib/core.ts:42:3
purgeResource                          creator                  frontend/src/lib/core.ts:48:3
purgeFolder                            creator                  frontend/src/lib/core.ts:49:3
PurgeSweepError                        creator                  frontend/src/lib/core.ts:50:3
loadMentionIndex                       creator                  frontend/src/lib/core.ts:80:3
isDesktopApp                           desktopBridge  function  frontend/src/lib/desktop-bridge.ts:299:17
HEADING_FIELD_DEFINITIONS                                       frontend/src/lib/editor-heading-settings.ts:38:14
sanitizeEditorHeading                                 function  frontend/src/lib/editor-heading-settings.ts:59:17
default                                               variable  frontend/src/lib/models/backlinks-watcher.ts:109:16
default                                               variable  frontend/src/lib/models/backlinks.ts:373:16
DESTRUCTIVE_SURVIVING_RATIO                                     frontend/src/lib/models/content-loss.ts:33:14
MIN_WORDS_LOST                                                  frontend/src/lib/models/content-loss.ts:42:14
default                                               variable  frontend/src/lib/models/diagnostics-index.ts:147:16
resolveEditorConfigProjectRootOrThrow                 function  frontend/src/lib/models/editor-config-core.ts:60:17
default                                               variable  frontend/src/lib/models/entity-alias-table.ts:115:16
EntityGraphPositionRecordSchema                                 frontend/src/lib/models/entity-graph-positions.ts:37:14
default                                               variable  frontend/src/lib/models/entity-graph-positions.ts:182:16
EntityRelationshipEdgeSchema                                    frontend/src/lib/models/entity-relationships.ts:34:14
default                                               variable  frontend/src/lib/models/entity-relationships.ts:254:16
default                                               variable  frontend/src/lib/models/entity-shared-metadata.ts:272:16
scanFieldValues                                       function  frontend/src/lib/models/field-values.ts:111:23
default                                               variable  frontend/src/lib/models/inverted-index.ts:263:16
default                                               variable  frontend/src/lib/models/locks.ts:35:16
default                                                         frontend/src/lib/models/memoryAdapter.ts:320:16
default                                               variable  frontend/src/lib/models/mention-index.ts:116:16
default                                               variable  frontend/src/lib/models/mentions-core.ts:624:16
default                                               variable  frontend/src/lib/models/meta-locks.ts:42:16
default                                               variable  frontend/src/lib/models/metadata-schema.ts:1096:16
rebuildIndexes                                        function  …lib/models/plaintext/import-plaintext-project.ts:483:23
previewPath                                           function  frontend/src/lib/models/previews.ts:29:17
savePreview                                           function  frontend/src/lib/models/previews.ts:37:23
default                                               variable  frontend/src/lib/models/previews.ts:109:16
default                                                         frontend/src/lib/models/project-config.ts:95:16
default                                               variable  frontend/src/lib/models/project-creator.ts:359:16
default                                                         frontend/src/lib/models/project-features.ts:143:16
default                                                         frontend/src/lib/models/project-view.ts:18:16
default                                creator                  frontend/src/lib/models/project.ts:78:16
listResourceIds                                       function  frontend/src/lib/models/pruneExecutor.ts:9:23
default                                               function  frontend/src/lib/models/pruneExecutor.ts:57:16
ComparisonOpSchema                                              frontend/src/lib/models/query-ast.ts:33:14
TextOpSchema                                                    frontend/src/lib/models/query-ast.ts:41:14
default                                               variable  frontend/src/lib/models/query-cache.ts:132:16
inspectTemplate                        creator                  frontend/src/lib/models/resource.ts:29:3
validateTemplate                       creator                  frontend/src/lib/models/resource.ts:30:3
default                                creator                  frontend/src/lib/models/resource.ts:38:16
default                                               variable  frontend/src/lib/models/revision-manager.ts:82:16
default                                               variable  frontend/src/lib/models/revision.ts:390:16
SavedQueryViewSchema                                            frontend/src/lib/models/saved-queries.ts:9:14
default                                               variable  frontend/src/lib/models/saved-queries.ts:136:16
QueryASTSchema                                                  frontend/src/lib/models/schemas.ts:35:3
ComparisonNodeSchema                                            frontend/src/lib/models/schemas.ts:36:3
InNodeSchema                                                    frontend/src/lib/models/schemas.ts:37:3
ExistsNodeSchema                                                frontend/src/lib/models/schemas.ts:38:3
TextNodeSchema                                                  frontend/src/lib/models/schemas.ts:39:3
LinksToNodeSchema                                               frontend/src/lib/models/schemas.ts:40:3
LinkedFromNodeSchema                                            frontend/src/lib/models/schemas.ts:41:3
RefNodeSchema                                                   frontend/src/lib/models/schemas.ts:42:3
ParamNodeSchema                                                 frontend/src/lib/models/schemas.ts:43:3
ComparisonOpSchema                                              frontend/src/lib/models/schemas.ts:44:3
TextOpSchema                                                    frontend/src/lib/models/schemas.ts:45:3
MetadataValue                                                   frontend/src/lib/models/schemas.ts:84:14
EditorConfigSchema                                              frontend/src/lib/models/schemas.ts:114:14
MetadataFieldTypeSchema                                         frontend/src/lib/models/schemas.ts:131:14
OrganizerCardBodySourceSchema                                   frontend/src/lib/models/schemas.ts:221:14
ResourceTypeSchema                                              frontend/src/lib/models/schemas.ts:368:14
TipTapMarkSchema                                                frontend/src/lib/models/schemas.ts:376:14
TipTapNodeSchema                                                frontend/src/lib/models/schemas.ts:392:14
RevisionSchema                                                  frontend/src/lib/models/schemas.ts:505:14
Schemas                                                         frontend/src/lib/models/schemas.ts:609:14
ProjectTypeResourceSchema                                       frontend/src/lib/models/schemas.ts:640:14
ProjectTypeFolderSchema                                         frontend/src/lib/models/schemas.ts:651:14
ProjectTypeDefaultFolderSchema                                  frontend/src/lib/models/schemas.ts:662:14
default                                                         …/lib/models/scrivener/apply-document-metadata.ts:173:16
default                                               variable  …lib/models/scrivener/import-scrivener-project.ts:822:16
default                                                         frontend/src/lib/models/sidecar.ts:202:16
default                                               variable  frontend/src/lib/models/tags.ts:264:16
default                                               variable  frontend/src/lib/models/uuid.ts:52:16
NODE_TYPE_LABELS                                                frontend/src/lib/node-display.ts:26:14
default                                                         frontend/src/lib/projectTypes.ts:182:16
default                                                         frontend/src/lib/tiptap-utils.ts:71:16
default                                               variable  frontend/src/lib/toast-service.ts:122:16
GLOBAL_COLOR_MODE_STORAGE_KEY                                   frontend/src/lib/user-preferences.ts:38:14
getStoredGlobalColorMode                              function  frontend/src/lib/user-preferences.ts:161:17
httpFeatureConfigTransport                                      …end/src/store/feature-config-transport-service.ts:70:14
httpMetadataSchemaTransport                                     …d/src/store/metadata-schema-transport-service.ts:226:14
resolveMetadataSchemaTransport                                  …d/src/store/metadata-schema-transport-service.ts:428:14
resolveProjectActionsTransport                                  frontend/src/store/project-actions-controller.ts:143:14
changeMetadataFieldType                                         frontend/src/store/projectsSlice.ts:399:14
selectActiveProjectRootPath                                     frontend/src/store/projectsSlice.ts:981:14
httpQueryTransport                                              frontend/src/store/query-transport-service.ts:131:14
resolveQueryTransport                                           frontend/src/store/query-transport-service.ts:173:14
selectQueryState                                                frontend/src/store/querySlice.ts:321:14
resolveRevisionDisplayName                            function  frontend/src/store/revision-normalization.ts:24:17
isRevision                                            function  frontend/src/store/revision-normalization.ts:52:17
sortRevisionsDescending                               function  frontend/src/store/revision-normalization.ts:68:17
resolveRevisionTransport                                        frontend/src/store/revision-transport-service.ts:300:14
selectRevisionsState                                            frontend/src/store/revisionsSlice.ts:589:14
selectSearchIsLoading                                           frontend/src/store/searchSlice.ts:123:14
selectSearchErrorMessage                                        frontend/src/store/searchSlice.ts:126:14
store                                                           frontend/src/store/store.ts:13:14
default                                               variable  frontend/src/store/store.ts:44:16
httpSearchTransport                                             frontend/src/store/transport/search-transport.ts:61:14
stubAppShellFetch                                     function  frontend/tests/helpers/appShellFetchStub.ts:66:17
default                                                         frontend/tests/unit/helpers/fs-utils.ts:34:16
default                                                         frontend/tests/unit/helpers/project-creator.ts:132:16
Unused exported types (170)
QaSessionRecord                                                interface  cli/src/commands/qa.ts:82:18
VerifyStatus                                                   type       cli/src/qa/verify.ts:34:13
VerifyArtifactKind                                             type       cli/src/qa/verify.ts:37:13
WorkspaceRejection                                             type       electron/src/projects-dir.ts:187:13
ImportSuccessOutcome                                           interface  …rivener-import/handle-import-request.ts:38:18
ImportRefusalUnsupportedOutcome                                interface  …rivener-import/handle-import-request.ts:43:18
ImportRefusalDestinationNotEmptyOutcome                        interface  …rivener-import/handle-import-request.ts:49:18
ImportFatalOutcome                                             interface  …rivener-import/handle-import-request.ts:55:18
SelectionHandleTarget                                          interface  …c/scrivener-import/selection-handles.ts:23:18
CompileFormat                                                  type       …mponents/common/CompilePreviewModal.tsx:36:13
ButtonProps                                                    interface  …/components/common/UI/Button/Button.tsx:39:18
ButtonProps                                                    type       …end/components/common/UI/Button/index.ts:2:15
CardProps                                                      interface  …tend/components/common/UI/Card/Card.tsx:15:18
CheckboxProps                                                  type       …mponents/common/UI/Checkbox/Checkbox.tsx:6:13
CheckboxProps                                                  type       …d/components/common/UI/Checkbox/index.ts:2:15
ChipProps                                                      type       …ntend/components/common/UI/Chip/index.ts:2:15
DialogContentProps                                             interface  …/components/common/UI/Dialog/Dialog.tsx:29:18
DialogContentProps                                             type       …nd/components/common/UI/Dialog/index.ts:13:15
InputProps                                                     type       …tend/components/common/UI/Input/index.ts:2:15
SelectProps                                                    type       …end/components/common/UI/Select/index.ts:2:15
SelectProps                                                    type       …d/components/common/UI/Select/Select.tsx:6:13
TextareaProps                                                  type       …mponents/common/UI/Textarea/Textarea.tsx:7:13
EntityMatchState                                               type       …Extensions/entityHighlightDecoration.ts:82:13
GetWriteImageOptions                                           interface  …ents/Editor/Extensions/GetWriteImage.ts:11:18
MediaDropOptions                                               interface  …/Editor/Extensions/MediaDropExtension.ts:9:18
EditorMenuColorIconName                                        type       …itor/MenuBar/EditorMenuColorSubmenu.tsx:10:15
EditorMenuIconName                                             type       …onents/Editor/MenuBar/EditorMenuIcon.tsx:8:15
EditorMenuInputIconName                                        type       …ents/Editor/MenuBar/EditorMenuInput.tsx:19:15
ToolbarInputCommand                                            interface  …ditor/MenuBar/toolbar-command-schema.ts:48:18
ToolbarColorCommand                                            interface  …ditor/MenuBar/toolbar-command-schema.ts:57:18
ToolbarCommandItem                                             type       …ditor/MenuBar/toolbar-command-schema.ts:71:13
ResolvedToolbarIconCommand                                     interface  …nts/Editor/MenuBar/useToolbarCommand.ts:26:18
ResolvedToolbarInputCommand                                    interface  …nts/Editor/MenuBar/useToolbarCommand.ts:35:18
ResolvedToolbarColorCommand                                    interface  …nts/Editor/MenuBar/useToolbarCommand.ts:45:18
HelpParagraphBlock                                             interface  frontend/components/help/help-content.ts:15:18
HelpHeadingBlock                                               interface  frontend/components/help/help-content.ts:20:18
HelpTipCardBlock                                               interface  frontend/components/help/help-content.ts:25:18
AppShellResourceActionOptions                                  interface  frontend/components/Layout/AppShell.tsx:154:18
ShellProjectTypeLoaderState                                    interface  …nents/Layout/ShellProjectTypeLoader.tsx:10:18
RelativeDateValue                                              interface  …/components/QueryBuilder/FilterChip.tsx:25:18
RangeValue                                                     interface  …/components/QueryBuilder/FilterChip.tsx:30:18
ResetOptions                                                   interface  …ts/QueryBuilder/useQueryBuilderState.ts:34:18
ValuePickerRange                                               type       …components/QueryBuilder/ValuePicker.tsx:17:13
ValuePickerRelativeDate                                        type       …components/QueryBuilder/ValuePicker.tsx:18:13
ResourceRef                                                    type       …components/QueryBuilder/ValuePicker.tsx:33:15
RemoveFieldChoice                                              type       …chemaManager/DeprecateOrClearDialog.tsx:13:13
ResourceOption                                                 type       …ebar/controls/MultiResourceRefInput.tsx:13:15
TimelineConfig                                                 type       frontend/components/Timeline/index.ts:6:3
TimelineProps                                                  type       frontend/components/Timeline/index.ts:7:3
TimelineTooltipProps                                           type       frontend/components/Timeline/index.ts:9:15
RevisionEntry                                                  type       frontend/components/WorkArea/DiffView.tsx:3:15
SaveStatus                                                     type       …onents/WorkArea/useCanonicalAutosave.ts:11:13
RevisionContentLoadState                                       type       …mponents/WorkArea/useRevisionContent.ts:51:13
ClientRect                                                     interface  …onshipGraphView/edgeTooltipPlacement.ts:14:18
PositionedNode                                                 interface  …tionshipGraphView/EntityGraphCanvas.tsx:96:18
PositionedEdge                                                 interface  …ionshipGraphView/EntityGraphCanvas.tsx:102:18
EntityGraphData                                                interface  …phView/EntityRelationshipGraphView.tsx:160:18
FlaggedNoiseTerm                                               interface  …s/EntityRosterView/EntityRosterView.tsx:58:18
OrganizerFilterKey                                             type       …Views/OrganizerView/organizerFilters.ts:43:13
TimelineViewProps                                              type       …nts/WorkArea/Views/TimelineView/index.ts:3:15
TimelineViewProps                                              interface  …rea/Views/TimelineView/TimelineView.tsx:11:18
ExportBody                                                     interface  frontend/src/lib/api/export.ts:10:18
LockedProjectApiEntry                                          interface  frontend/src/lib/api/projects.ts:25:18
FileDownloader                                                 type       …ontend/src/lib/compile/download-file.ts:24:32
CompileFormat                                                  type       …lib/compile/run-compile-and-download.ts:30:13
TrashRefRecord                               creator           type       frontend/src/lib/core.ts:43:8
PurgeStepName                                creator           type       frontend/src/lib/core.ts:51:8
ImportScrivenerProjectOptions                creator           type       frontend/src/lib/core.ts:91:8
ImportPlainTextProjectOptions                creator           type       frontend/src/lib/core.ts:108:8
ImportPlainTextProjectResult                 creator           type       frontend/src/lib/core.ts:109:8
ImportSuccessOutcome                         desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:35:18
ImportRefusalUnsupportedOutcome              desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:46:18
ImportRefusalDestinationNotEmptyOutcome      desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:52:18
ImportFatalOutcome                           desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:58:18
StartDocxImportOptions                       desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:81:18
GlobalNoiseWordsSetResult                    desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:93:18
DocxImportSuccessOutcome                     desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:99:18
DocxImportRefusalNoDocxFoundOutcome          desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:109:18
DocxImportRefusalDestinationNotEmptyOutcome  desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:115:18
DocxImportRefusalUnknownProjectTypeOutcome   desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:121:18
DocxImportFatalOutcome                       desktopBridge     interface  frontend/src/lib/desktop-bridge.ts:127:18
EditorHeadingFieldDefinition                                   interface  …ntend/src/lib/editor-heading-settings.ts:6:18
FileType                                                       type       …/src/lib/models/capacitor-filesystem.ts:34:13
MediaResourceType                            creator           type       …tend/src/lib/models/media-validation.ts:33:13
MediaValidationOk                            creator           interface  …tend/src/lib/models/media-validation.ts:46:18
MediaRejectionReason                         creator           type       …tend/src/lib/models/media-validation.ts:57:13
MediaValidationError                         creator           interface  …tend/src/lib/models/media-validation.ts:60:18
SearchCheckReport                                              interface  …rc/lib/models/native-device-harness.ts:174:18
ThroughputCheckReport                                          interface  …rc/lib/models/native-device-harness.ts:182:18
MediaSizeThroughputReport                                      interface  …rc/lib/models/native-device-harness.ts:197:18
ImageThroughputCheckReport                                     interface  …rc/lib/models/native-device-harness.ts:208:18
AudioThroughputCheckReport                                     interface  …rc/lib/models/native-device-harness.ts:213:18
RenameCollisionCheckReport                                     interface  …rc/lib/models/native-device-harness.ts:218:18
PlainTextTipTapHardBreakNode                                   interface  …c/lib/models/plaintext/txt-to-tiptap.ts:46:18
PlainTextTipTapParagraphContentNode                            type       …c/lib/models/plaintext/txt-to-tiptap.ts:52:13
PlainTextTipTapParagraphNode                                   interface  …c/lib/models/plaintext/txt-to-tiptap.ts:57:18
ProjectTypeSpecFolder                                          interface  …ntend/src/lib/models/project-creator.ts:68:18
ProjectTypeSpecResource                                        interface  …ntend/src/lib/models/project-creator.ts:91:18
ProjectTypeSpecDefaultFolder                                   interface  …tend/src/lib/models/project-creator.ts:111:18
LoadedResource                                                 interface  …ontend/src/lib/models/project-loader.ts:23:18
UIResource                                                     type       frontend/src/lib/models/project-view.ts:6:15
FolderWithResources                                            type       frontend/src/lib/models/project-view.ts:6:27
ComparisonOp                                                   type       frontend/src/lib/models/query-ast.ts:117:13
TextOp                                                         type       frontend/src/lib/models/query-ast.ts:118:13
ComparisonNode                                                 type       frontend/src/lib/models/query-ast.ts:120:13
InNode                                                         type       frontend/src/lib/models/query-ast.ts:125:13
ExistsNode                                                     type       frontend/src/lib/models/query-ast.ts:126:13
TextNode                                                       type       frontend/src/lib/models/query-ast.ts:127:13
LinksToNode                                                    type       frontend/src/lib/models/query-ast.ts:128:13
LinkedFromNode                                                 type       frontend/src/lib/models/query-ast.ts:129:13
ParamNode                                                      type       frontend/src/lib/models/query-ast.ts:136:13
CombinatorNode                                                 type       frontend/src/lib/models/query-ast.ts:146:13
SpliceNode                                                     type       frontend/src/lib/models/query-ast.ts:147:13
IntrinsicFieldSource                                           type       …tend/src/lib/models/query-intrinsics.ts:12:13
ReorderFolderEntry                           resourceCrudCore  interface  …d/src/lib/models/resource-crud-core.ts:734:18
ReorderResourceEntry                         resourceCrudCore  interface  …d/src/lib/models/resource-crud-core.ts:741:18
TemplateInspection                           creator           type       frontend/src/lib/models/resource.ts:31:8
TemplateValidationResult                     creator           type       frontend/src/lib/models/resource.ts:32:8
RevisionRepairEntry                                            interface  …ntend/src/lib/models/revision-repair.ts:19:18
RevisionRepairSkip                                             interface  …ntend/src/lib/models/revision-repair.ts:24:18
SavedQueryView                                                 type       frontend/src/lib/models/saved-queries.ts:13:13
QueryAST                                                       type       frontend/src/lib/models/schemas.ts:16:3
LeafNode                                                       type       frontend/src/lib/models/schemas.ts:17:3
CombinatorNode                                                 type       frontend/src/lib/models/schemas.ts:18:3
SpliceNode                                                     type       frontend/src/lib/models/schemas.ts:19:3
ComparisonNode                                                 type       frontend/src/lib/models/schemas.ts:20:3
ComparisonOp                                                   type       frontend/src/lib/models/schemas.ts:21:3
InNode                                                         type       frontend/src/lib/models/schemas.ts:22:3
ExistsNode                                                     type       frontend/src/lib/models/schemas.ts:23:3
TextNode                                                       type       frontend/src/lib/models/schemas.ts:24:3
TextOp                                                         type       frontend/src/lib/models/schemas.ts:25:3
LinksToNode                                                    type       frontend/src/lib/models/schemas.ts:26:3
LinkedFromNode                                                 type       frontend/src/lib/models/schemas.ts:27:3
AndNode                                                        type       frontend/src/lib/models/schemas.ts:28:3
OrNode                                                         type       frontend/src/lib/models/schemas.ts:29:3
NotNode                                                        type       frontend/src/lib/models/schemas.ts:30:3
RefNode                                                        type       frontend/src/lib/models/schemas.ts:31:3
ParamNode                                                      type       frontend/src/lib/models/schemas.ts:32:3
ProjectTypeDefaultFolder                                       type       frontend/src/lib/models/schemas.ts:669:13
ImportPlanFolder                                               interface  …c/lib/models/scrivener/binder-mapper.ts:66:18
ImportPlanExclusionReason                                      type       …/lib/models/scrivener/binder-mapper.ts:108:13
ImportPlanExcludedItem                                         interface  …/lib/models/scrivener/binder-mapper.ts:115:18
ImportPlanNonTextResearchItem                                  interface  …/lib/models/scrivener/binder-mapper.ts:132:18
ImportPlanNote                                                 interface  …/lib/models/scrivener/binder-mapper.ts:144:18
ImportPlanUntitledFallback                                     interface  …/lib/models/scrivener/binder-mapper.ts:156:18
ImportReportFieldKeyRename                                     interface  …c/lib/models/scrivener/import-report.ts:62:18
ImportReportKeywordMerge                                       interface  …c/lib/models/scrivener/import-report.ts:75:18
ImportReportResearchItem                                       interface  …c/lib/models/scrivener/import-report.ts:87:18
ImportReportExcludedOtherItem                                  interface  …c/lib/models/scrivener/import-report.ts:98:18
ImportReportTrashItem                                          interface  …/lib/models/scrivener/import-report.ts:108:18
ImportReportUntitledFallback                                   interface  …/lib/models/scrivener/import-report.ts:130:18
UnsupportedCustomMetaDataField                                 interface  …lib/models/scrivener/metadata-mapper.ts:40:18
MetadataValueSkip                                              interface  …lib/models/scrivener/metadata-mapper.ts:64:18
FieldKeyRename                                                 interface  …lib/models/scrivener/metadata-mapper.ts:82:18
PlannedKeywordTag                                              interface  …lib/models/scrivener/metadata-mapper.ts:95:18
KeywordMerge                                                   interface  …ib/models/scrivener/metadata-mapper.ts:108:18
KeywordTagPlan                                                 interface  …ib/models/scrivener/metadata-mapper.ts:118:18
RtfTipTapMark                                                  interface  …c/lib/models/scrivener/rtf-to-tiptap.ts:82:18
RtfTipTapHardBreakNode                                         interface  …c/lib/models/scrivener/rtf-to-tiptap.ts:99:18
RtfTipTapParagraphContentNode                                  type       …/lib/models/scrivener/rtf-to-tiptap.ts:104:13
RtfTipTapParagraphNode                                         interface  …/lib/models/scrivener/rtf-to-tiptap.ts:109:18
RtfTipTapDocument                                              interface  …/lib/models/scrivener/rtf-to-tiptap.ts:126:18
RtfDroppedFeature                                              interface  …/lib/models/scrivener/rtf-to-tiptap.ts:132:18
OrganizerCardBodySource                      creator           type       frontend/src/lib/models/types.ts:75:13
MetadataInputType                            creator           type       frontend/src/lib/models/types.ts:232:13
TipTapMark                                   creator           interface  frontend/src/lib/models/types.ts:334:18
FetchLike                                                      type       frontend/src/lib/models/update-check.ts:38:13
SearchFilters                                                  type       frontend/src/store/searchSlice.ts:10:15
SearchState                                                    interface  frontend/src/store/searchSlice.ts:12:18
ProjectTypeFolderMetadataSource                                interface  frontend/src/types/project-types.ts:44:18
Duplicate exports (14)
registerDoctor|default                                    cli/src/commands/doctor.ts
registerPrune|default                                     cli/src/commands/prune.ts
registerQa|default                                        cli/src/commands/qa.ts
registerReindex|default                                   cli/src/commands/reindex.ts
registerRepairRevisions|default                           cli/src/commands/repair-revisions.ts
registerScreenshots|default                               cli/src/commands/screenshots.ts
registerTemplates|default                                 cli/src/commands/templates.ts
flushIndexer|waitForDrain                                 frontend/src/lib/models/indexer-queue.ts
bootstrapNativeStorageContext|ensureNativeStorageContext  frontend/src/lib/models/native-bootstrap.ts
pruneAllResources|default                                 frontend/src/lib/models/pruneExecutor.ts
Schemas|default                                           frontend/src/lib/models/schemas.ts
toastService|default                                      frontend/src/lib/toast-service.ts
useAppSelector|default                                    frontend/src/store/hooks.ts
store|default                                             frontend/src/store/store.ts
Configuration hints (6)
frontend                                          knip.json     Add entry and/or refine project files in workspaces["fr…
. (root)                                          knip.json     Add entry and/or refine project files in workspaces["."…
android                                           knip.json     Add entry and/or refine project files in workspaces["an…
…transport/native-trash-backend.web-stub.ts       knip.json     Remove from ignore
src/getwrite-cli.ts                          cli  knip.json     Remove redundant entry pattern
index.js                                          package.json  Package entry file not found
```

### Reference figures (reported, not re-run unless reproduced)

Source: Feature 77 as recorded in the feature list and FR-9. Comparison with this run:

| Figure | Reported (Feature 77) | This run | Status |
| --- | --- | --- | --- |
| frontend `test:ci` | 6434 passed, 1 skipped | 6434 passed, 1 skipped | reproduced |
| desktop (electron) | 384 | 384 passed | reproduced |
| CLI | 144 | 144 passed | reproduced |
| sharing smoke | 28 checks | 28 checks, 0 failures | reproduced |
| e2e | 214 passed, 1 skipped | 214 passed, 1 skipped | reproduced |
| lint | 0 errors, 395 warnings | 0 errors, 395 warnings | reproduced |
| knip | 57 unused files, 166 exports, 170 types, 14 duplicates | 57, 166, 170, 14 | reproduced (counts only; the name list is not compared with Feature 77's, which is not in this file) |

### git status

`git status --short` after all runs printed nothing: the tree was clean before this file was written, and no tracked file or new untracked file (build output is ignored) appeared from the runs. Once this file was written the only change is `specs/features/desktop-server-port/experiments.md`.

### Not run

- `pnpm build:native` (excluded by the task).
- Any suite under Node 20 or Node 22; every run used Node v24.15.0. CI results for this branch were not seen.
- Identification of the one skipped frontend test and the one skipped e2e test.
- A name-by-name comparison of the knip list against Feature 77's (that list was not available to this task).
- `pnpm storybook` (dev) was not started; e2e used the static Storybook build served by the Playwright `webServer`.
