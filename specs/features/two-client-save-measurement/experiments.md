# Experiments: Feature 78 (two-client save behaviour, measurement)

Spec: `specs/features/two-client-save-measurement.md`. Tasks: `tasks.md`. This feature changes no product code. A measurement is a fact; a cause is a hypothesis. Code facts are labelled "read, not run".

## Definition of the claim

Written before any suite or scenario was run (Task 1, 2026-10-11). Owner decision, Gate 3, 2026-10-11 (OQ-1, option b). Spec FR-1.

**"Last" means last PROCESSED by the server.** Not the last typed, and not the last sent.

**"Wins" means** that after the server is quiet, all four stores hold exactly the whole document of the last-processed client, parseable, and never a mix or interleaving of two clients' documents:

1. the canonical revision's `content.bin`;
2. `resources/<id>/content.tiptap.json`;
3. `resources/<id>/content.txt`;
4. the sidecar's `wordCount` and `updatedAt`, consistent with that document;

and both clients show that document after a reload.

**A scenario repetition PASSES only if all of that holds.** A store holding another document, a mix, an unparseable file, or a sidecar inconsistent with the content is a FAIL.

**Stability.** Results are reported per scenario as pass, fail or unstable, with the repetition count. Stable means every repetition agrees. Where the evidence does not order two saves, the repetition's verdict is "order not determined", reported with the stores' contents. That counts as UNSTABLE, never as a pass.

**How "last processed" is determined.** From recorded evidence, used in this order:

1. the server-assigned timestamps: the `updatedAt` in each save's response, and the writing-log entry timestamps;
2. the order in which the responses were received by the clients;
3. the clients' send times.

**Limits of that determination.**

- Timestamps have finite resolution; two saves can carry the same value.
- Two overlapping requests can be assigned timestamps in a different order from the order their writes land on disk.
- Response order at a client is not processing order.
- All scripted clients run on one host and share one clock; every scripted request is host to itself, not a second-device result. The phone's clock is not assumed to match the host's, so the phone step is ordered by the owner's report and the server timestamps only.
- Playwright event times are not wire times.

**Findings, not verdicts** (spec FR-33): a stale editor replacing the other device's text on a keystroke; a save sent with no typing; whether the overwritten device was told; whether overwritten text is recoverable and under what condition; an editor showing text the server no longer holds; the writing-log effect; a failed save on the device the writer believes is last. Each is recorded as a raw observation with what was and was not varied, and no pass or fail.

## Baselines

Task 1. Date 2026-10-11. Main checkout `/Users/jedaisaboteur/Repositories/getwrite`, branch `feat/two-client-save-measurement`, `git rev-parse --short HEAD` = `812f2859`. Tree clean at the start (the session's git status snapshot was clean; `git status --short` after the builds printed nothing).

`node --version` = `v24.15.0`. CI runs Node 22 (frontend, Electron, build) and Node 20 (CLI). Every figure below is a Node 24 run. No Node 22 or Node 20 run was made and none is claimed.

### Listeners found before starting

`lsof -nP -iTCP:<port> -sTCP:LISTEN`, run at the start, printed nothing for each of 7340, 3000 and 6006. Nothing was listening on any of them, so nothing of the owner's was touched. Re-checked after the work finished: 7340 and 3000 still empty; 6006 empty after Storybook was stopped (below).

### Sandbox use

| Command | Where it ran |
|---|---|
| `pnpm test:ci`, `pnpm typecheck`, `pnpm lint` (frontend) | inside the command sandbox |
| `pnpm test`, `pnpm typecheck` (electron) | inside the sandbox |
| `pnpm --filter getwrite-cli test`, `pnpm knip` (repo root) | inside the sandbox |
| `pnpm build` and the `.next/static` copy | OUTSIDE the sandbox (dangerouslyDisableSandbox) |
| `pnpm test:sharing-smoke` | OUTSIDE the sandbox |
| `pnpm storybook` and `pnpm test:e2e` | OUTSIDE the sandbox |

Logs of the outside-sandbox commands were written to `/tmp/getwrite-two-client/logs/` (created outside the sandbox, because `mkdir` inside it returned "Operation not permitted"). Inside-sandbox runs logged under the sandbox temp directory. The npm line ` WARN  Issue while reading "/Users/jedaisaboteur/.npmrc". EPERM` appears in sandboxed pnpm runs (the sandbox denies reading that file); it did not change an exit status.

### Results

| Command (cwd) | Date/time (MDT) | Exit | Counts |
|---|---|---|---|
| `pnpm test:ci` (frontend) | 2026-10-11 12:24 | 0 | 608 test files passed; 6468 passed, 0 failed, 1 skipped (6469) |
| `pnpm typecheck` (frontend) | 12:25 | 0 | `tsc --noEmit`, no output |
| `pnpm lint` (frontend) | 12:25 | 0 | 395 problems: 0 errors, 395 warnings (7 warnings potentially fixable with `--fix`) |
| `pnpm test` (electron) | 12:25 | 0 | 30 files passed; 488 passed, 0 failed |
| `pnpm typecheck` (electron) | 12:25 | 0 | no output |
| `pnpm --filter getwrite-cli test` (root) | 12:26 | 0 | 22 files passed; 144 passed, 0 failed (the two lines `error: missing required argument 'scrivPath'` / `'source'` are printed by tests of argument handling and did not fail them) |
| `pnpm knip` (root) | 12:26 | 1 | see "knip" below |
| `pnpm build` (frontend) | 12:26 | 0 | Next production build completed; the route table ends with `ƒ Proxy (Middleware)` |
| `pnpm test:sharing-smoke` (frontend) | 12:31 | 0 | pairing page static URLs checked: 15; static files checked: 122; enumerated entries: 92; exceptions: 4 (3 enumerated + `/_next/static/`; 1 store-independent); checks: 34; failures: 0; last line "sharing refusal smoke: all checks passed" |
| `pnpm test:e2e` (frontend) | 12:32 | 0 | 213 passed, 1 flaky, 1 skipped (1.1 m); 0 failed |

Exit 0 for the e2e run includes the flaky test, which failed its first attempt and passed on retry. Test name, verbatim from the Playwright summary: `[chromium] › e2e/start-page.e2e.spec.ts:86:5 › start page empty-state button opens create project modal`. First-attempt errors in the log: `expect(locator).toBeVisible() failed` and `element(s) not found`. The failure artefacts went to `frontend/playwright-report/` (gitignored: `git status --short` stayed empty). The cause was not investigated; no experiment was run to discriminate one. The reference figure for e2e is 214 passed and 1 skipped, and this run counted 213 passed plus the 1 flaky one that passed on retry (214 passing tests in all) plus 1 skipped. Whether that flaky first attempt reproduces was not tried (one run only).

No baseline suite failed. Nothing was fixed.

### Build and standalone server (reused by Tasks 2 to 7)

- Built with `pnpm build` in `frontend/` at commit `812f2859`, tree clean, Node v24.15.0, outside the sandbox, exit 0, about 5 minutes.
- After the build, `frontend/.next/standalone/frontend/.next/static` was removed and replaced with a copy of `frontend/.next/static` (`cp -R`). The copy exists (`chunks`, `media` and one build-id directory present).
- Standalone server entry (read, not run as a server in this task): `/Users/jedaisaboteur/Repositories/getwrite/frontend/.next/standalone/frontend/server.js`, built at `812f2859`. Later tasks reuse this build and rebuild only if the tree changes. The sharing smoke ran against this same build.
- `.next` is not tracked: the build left `git status --short` empty.
- `pnpm build:native` was not run.

### Storybook and the e2e run

Port 6006 was confirmed free before starting. Started by `nohup pnpm storybook` (script `storybook dev -p 6006`) from `frontend/` outside the sandbox. Pid recorded at start: 81420 (the `pnpm` process). The descendant walk (`ps -axo pid=,ppid=`) found 81420, 81422, 81426, 81445, 81451, 81593, 81595. The 6006 listener was 81445 (`node`, IPv6 `*:6006`). Storybook printed an upgrade-changelog notice and `75 ms for manager and 365 ms for preview`. After the e2e run, those seven pids were sent SIGTERM by pid, in reverse order. Afterwards `kill -0` found none of them alive and `lsof -nP -iTCP:6006 -sTCP:LISTEN` printed nothing. No process was stopped by name or by port.

### knip

`pnpm knip` at the repo root, exit 1 (knip reports issues; it was exit 1 as a baseline, and nothing was fixed). Issue count per section:

| Section | Count |
|---|---|
| Unused files | 66 |
| Unused dependencies | 1 |
| Unused devDependencies | 4 |
| Unlisted dependencies | 6 |
| Unlisted binaries | 4 |
| Unused exports | 166 |
| Unused exported types | 170 |
| Duplicate exports | 14 |
| Configuration hints | 6 |

Observation relevant to later tasks: of the 66 unused files, 17 are scripts under `specs/` already (1 under `specs/001-ui-getwrite-skeleton/scripts/`, 9 under `specs/features/desktop-server-port/scripts/`, 7 under `specs/features/paired-device-limits/scripts/`). So knip DOES see scripts under `specs/`. The Task 2 to 7 assumption that scripts under `specs/features/two-client-save-measurement/scripts/` are invisible to knip does not hold on this tree; they will most likely appear as new "Unused files" entries, compared by set to the list below (that is the outcome the spec's FR-30 already expects: "the only expected new knip entries are the scripts under `specs/`").

The complete list of names follows, section by section, as knip printed them (whitespace squeezed; each line is `name [kind] location`, or `path` for files), so later runs can be compared by set.

```
Unused files (66)
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
specs/features/desktop-server-port/scripts/built-server-check.mjs
specs/features/desktop-server-port/scripts/cookie-scope.mjs
specs/features/desktop-server-port/scripts/dev-ports.mjs
specs/features/desktop-server-port/scripts/electron-dev-7340.mjs
specs/features/desktop-server-port/scripts/electron-unpacked-7340.mjs
specs/features/desktop-server-port/scripts/old-port-and-7340.mjs
specs/features/desktop-server-port/scripts/pair-on-7340-unpacked.mjs
specs/features/desktop-server-port/scripts/pair-on-7340.mjs
specs/features/desktop-server-port/scripts/port-in-use-today.mjs
specs/features/paired-device-limits/scripts/browser-limits.mjs
specs/features/paired-device-limits/scripts/dev-reachability.mjs
specs/features/paired-device-limits/scripts/electron-limits.mjs
specs/features/paired-device-limits/scripts/header-experiment.mjs
specs/features/paired-device-limits/scripts/traversal-experiment.mjs
specs/features/paired-device-limits/scripts/two-clients.mjs
specs/features/paired-device-limits/scripts/verify-limits.mjs
Unused dependencies (1)
typedoc frontend/package.json:89:6
Unused devDependencies (4)
@capacitor/filesystem android/package.json:19:6
@better-auth/cli frontend/package.json:93:6
@eslint/eslintrc frontend/package.json:96:6
next-devtools-mcp frontend/package.json:118:6
Unlisted dependencies (6)
@storybook/react frontend/stories/Common/Listbox.stories.tsx:2:37
@storybook/react frontend/stories/Common/Tabs.stories.tsx:2:37
@storybook/react frontend/stories/Sidebar/controls/Controls.stories.tsx:2:32
@storybook/react frontend/stories/WorkArea/DiffView.stories.tsx:3:32
@storybook/react frontend/stories/WorkArea/ViewSwitcher.stories.tsx:3:37
offbeat-fm-theme.css frontend/styles/saboteur-base.css:2:17
Unlisted binaries (4)
electron-builder .github/workflows/build-electron.yml
typecheck .github/workflows/frontend-checks.yml
lint .github/workflows/frontend-checks.yml
build .github/workflows/frontend-checks.yml
Unused exports (166)
registerDoctor function cli/src/commands/doctor.ts:114:17
registerPrune function cli/src/commands/prune.ts:69:17
stopServerByPid function cli/src/commands/qa.ts:468:23
registerQa function cli/src/commands/qa.ts:627:17
registerReindex function cli/src/commands/reindex.ts:42:17
runRepairRevisions function cli/src/commands/repair-revisions.ts:30:23
registerRepairRevisions function cli/src/commands/repair-revisions.ts:68:17
registerScreenshots function cli/src/commands/screenshots.ts:84:17
registerTemplates function cli/src/commands/templates.ts:76:17
defaultRepoRoot function cli/src/qa/report.ts:73:17
QA_SERVER_LOG_FILENAME cli/src/qa/server.ts:47:14
DEFAULT_READY_PROBE_PATHS cli/src/qa/server.ts:184:14
WORKSPACE_FOLDER_NAME electron/src/projects-dir.ts:30:14
WORKSPACE_CONFIG_FILENAME electron/src/projects-dir.ts:184:14
cardVariants frontend/components/common/UI/Card/Card.tsx:39:10
EditContextMenu frontend/components/common/UI/ContextMenu/index.ts:9:21
DialogTrigger frontend/components/common/UI/Dialog/Dialog.tsx:126:3
DialogPortal frontend/components/common/UI/Dialog/Dialog.tsx:127:3
DialogOverlay frontend/components/common/UI/Dialog/Dialog.tsx:128:3
DialogClose frontend/components/common/UI/Dialog/Dialog.tsx:129:3
DialogTrigger frontend/components/common/UI/Dialog/index.ts:3:3
DialogPortal frontend/components/common/UI/Dialog/index.ts:4:3
DialogOverlay frontend/components/common/UI/Dialog/index.ts:5:3
DialogClose frontend/components/common/UI/Dialog/index.ts:6:3
DialogHeader frontend/components/common/UI/Dialog/index.ts:8:3
PopoverClose frontend/components/common/UI/Popover/index.ts:4:3
PopoverClose frontend/components/common/UI/Popover/Popover.tsx:45:35
default variable …ents/Editor/Extensions/StripExternalPasteColor.ts:30:16
toItemKey function …mponents/project-types/ProjectTypeDraftService.ts:77:17
normalizeDefinition function …mponents/project-types/ProjectTypeDraftService.ts:98:17
FileIcon function …end/components/ResourceTree/ResourceTreeIcons.tsx:87:17
TimelineTooltip frontend/components/Timeline/index.ts:2:21
getAdaptiveFormat function frontend/components/Timeline/utils.ts:250:17
resolveOffsetToPosition frontend/components/TipTapEditor.tsx:40:10
TOOLTIP_POINTER_GAP …tityRelationshipGraphView/edgeTooltipPlacement.ts:42:14
TimelineView …nd/components/WorkArea/Views/TimelineView/index.ts:2:21
default function …ents/WorkArea/Views/TimelineView/TimelineView.tsx:44:25
resolveCompileTransport frontend/src/lib/api/compile.ts:155:14
resolveEditorConfigTransport frontend/src/lib/api/editor-config.ts:112:14
resolveEntityAliasTableTransport frontend/src/lib/api/entity-alias-table.ts:105:14
resolveEntityCooccurrenceTransport frontend/src/lib/api/entity-cooccurrence.ts:114:14
httpEntityGraphPositionsTransport frontend/src/lib/api/entity-graph-positions.ts:55:14
resolveEntityMentionCountsTransport frontend/src/lib/api/entity-mention-counts.ts:104:14
resolveEntityRelationshipsTransport frontend/src/lib/api/entity-relationships.ts:281:14
resolveExportTransport frontend/src/lib/api/export.ts:117:14
resolveMentionsTransport frontend/src/lib/api/mentions.ts:142:14
resolvePreferencesTransport frontend/src/lib/api/preferences.ts:93:14
resolveProjectTypesTransport frontend/src/lib/api/project-types.ts:70:14
httpProjectsTransport frontend/src/lib/api/projects.ts:90:14
resolveProjectsTransport frontend/src/lib/api/projects.ts:160:14
resolveProseDiagnosticsTransport frontend/src/lib/api/prose-diagnostics.ts:220:14
resolveResourceExcerptsTransport frontend/src/lib/api/resource-excerpts.ts:85:14
resolveResourcesTransport frontend/src/lib/api/resources.ts:419:14
ApiEditorConfigSchema frontend/src/lib/api/schemas.ts:88:14
ProjectSchema frontend/src/lib/api/schemas.ts:196:14
FolderSchema frontend/src/lib/api/schemas.ts:213:14
LockedProjectListEntrySchema frontend/src/lib/api/schemas.ts:265:14
resolveTagsTransport frontend/src/lib/api/tags.ts:155:14
resolveTrashTransport frontend/src/lib/api/trash.ts:231:14
renameFolderById creator frontend/src/lib/core.ts:28:26
writeTrashRefRecord creator frontend/src/lib/core.ts:41:3
readTrashRefRecord creator frontend/src/lib/core.ts:42:3
purgeResource creator frontend/src/lib/core.ts:48:3
purgeFolder creator frontend/src/lib/core.ts:49:3
PurgeSweepError creator frontend/src/lib/core.ts:50:3
loadMentionIndex creator frontend/src/lib/core.ts:80:3
isDesktopApp desktopBridge function frontend/src/lib/desktop-bridge.ts:299:17
HEADING_FIELD_DEFINITIONS frontend/src/lib/editor-heading-settings.ts:38:14
sanitizeEditorHeading function frontend/src/lib/editor-heading-settings.ts:59:17
default variable frontend/src/lib/models/backlinks-watcher.ts:109:16
default variable frontend/src/lib/models/backlinks.ts:373:16
DESTRUCTIVE_SURVIVING_RATIO frontend/src/lib/models/content-loss.ts:33:14
MIN_WORDS_LOST frontend/src/lib/models/content-loss.ts:42:14
default variable frontend/src/lib/models/diagnostics-index.ts:147:16
resolveEditorConfigProjectRootOrThrow function frontend/src/lib/models/editor-config-core.ts:60:17
default variable frontend/src/lib/models/entity-alias-table.ts:115:16
EntityGraphPositionRecordSchema frontend/src/lib/models/entity-graph-positions.ts:37:14
default variable frontend/src/lib/models/entity-graph-positions.ts:182:16
EntityRelationshipEdgeSchema frontend/src/lib/models/entity-relationships.ts:34:14
default variable frontend/src/lib/models/entity-relationships.ts:254:16
default variable frontend/src/lib/models/entity-shared-metadata.ts:272:16
scanFieldValues function frontend/src/lib/models/field-values.ts:111:23
default variable frontend/src/lib/models/inverted-index.ts:263:16
default variable frontend/src/lib/models/locks.ts:35:16
default frontend/src/lib/models/memoryAdapter.ts:320:16
default variable frontend/src/lib/models/mention-index.ts:116:16
default variable frontend/src/lib/models/mentions-core.ts:624:16
default variable frontend/src/lib/models/meta-locks.ts:42:16
default variable frontend/src/lib/models/metadata-schema.ts:1096:16
rebuildIndexes function …lib/models/plaintext/import-plaintext-project.ts:483:23
previewPath function frontend/src/lib/models/previews.ts:29:17
savePreview function frontend/src/lib/models/previews.ts:37:23
default variable frontend/src/lib/models/previews.ts:109:16
default frontend/src/lib/models/project-config.ts:95:16
default variable frontend/src/lib/models/project-creator.ts:359:16
default frontend/src/lib/models/project-features.ts:143:16
default frontend/src/lib/models/project-view.ts:18:16
default creator frontend/src/lib/models/project.ts:78:16
listResourceIds function frontend/src/lib/models/pruneExecutor.ts:9:23
default function frontend/src/lib/models/pruneExecutor.ts:57:16
ComparisonOpSchema frontend/src/lib/models/query-ast.ts:33:14
TextOpSchema frontend/src/lib/models/query-ast.ts:41:14
default variable frontend/src/lib/models/query-cache.ts:132:16
inspectTemplate creator frontend/src/lib/models/resource.ts:29:3
validateTemplate creator frontend/src/lib/models/resource.ts:30:3
default creator frontend/src/lib/models/resource.ts:38:16
default variable frontend/src/lib/models/revision-manager.ts:82:16
default variable frontend/src/lib/models/revision.ts:390:16
SavedQueryViewSchema frontend/src/lib/models/saved-queries.ts:9:14
default variable frontend/src/lib/models/saved-queries.ts:136:16
QueryASTSchema frontend/src/lib/models/schemas.ts:35:3
ComparisonNodeSchema frontend/src/lib/models/schemas.ts:36:3
InNodeSchema frontend/src/lib/models/schemas.ts:37:3
ExistsNodeSchema frontend/src/lib/models/schemas.ts:38:3
TextNodeSchema frontend/src/lib/models/schemas.ts:39:3
LinksToNodeSchema frontend/src/lib/models/schemas.ts:40:3
LinkedFromNodeSchema frontend/src/lib/models/schemas.ts:41:3
RefNodeSchema frontend/src/lib/models/schemas.ts:42:3
ParamNodeSchema frontend/src/lib/models/schemas.ts:43:3
ComparisonOpSchema frontend/src/lib/models/schemas.ts:44:3
TextOpSchema frontend/src/lib/models/schemas.ts:45:3
MetadataValue frontend/src/lib/models/schemas.ts:84:14
EditorConfigSchema frontend/src/lib/models/schemas.ts:114:14
MetadataFieldTypeSchema frontend/src/lib/models/schemas.ts:131:14
OrganizerCardBodySourceSchema frontend/src/lib/models/schemas.ts:221:14
ResourceTypeSchema frontend/src/lib/models/schemas.ts:368:14
TipTapMarkSchema frontend/src/lib/models/schemas.ts:376:14
TipTapNodeSchema frontend/src/lib/models/schemas.ts:392:14
RevisionSchema frontend/src/lib/models/schemas.ts:505:14
Schemas frontend/src/lib/models/schemas.ts:609:14
ProjectTypeResourceSchema frontend/src/lib/models/schemas.ts:640:14
ProjectTypeFolderSchema frontend/src/lib/models/schemas.ts:651:14
ProjectTypeDefaultFolderSchema frontend/src/lib/models/schemas.ts:662:14
default …/lib/models/scrivener/apply-document-metadata.ts:173:16
default variable …lib/models/scrivener/import-scrivener-project.ts:822:16
default frontend/src/lib/models/sidecar.ts:202:16
default variable frontend/src/lib/models/tags.ts:264:16
default variable frontend/src/lib/models/uuid.ts:52:16
NODE_TYPE_LABELS frontend/src/lib/node-display.ts:26:14
default frontend/src/lib/projectTypes.ts:182:16
default frontend/src/lib/tiptap-utils.ts:71:16
default variable frontend/src/lib/toast-service.ts:122:16
GLOBAL_COLOR_MODE_STORAGE_KEY frontend/src/lib/user-preferences.ts:38:14
getStoredGlobalColorMode function frontend/src/lib/user-preferences.ts:161:17
httpFeatureConfigTransport …end/src/store/feature-config-transport-service.ts:70:14
httpMetadataSchemaTransport …d/src/store/metadata-schema-transport-service.ts:226:14
resolveMetadataSchemaTransport …d/src/store/metadata-schema-transport-service.ts:428:14
resolveProjectActionsTransport frontend/src/store/project-actions-controller.ts:143:14
changeMetadataFieldType frontend/src/store/projectsSlice.ts:399:14
selectActiveProjectRootPath frontend/src/store/projectsSlice.ts:981:14
httpQueryTransport frontend/src/store/query-transport-service.ts:131:14
resolveQueryTransport frontend/src/store/query-transport-service.ts:173:14
selectQueryState frontend/src/store/querySlice.ts:321:14
resolveRevisionDisplayName function frontend/src/store/revision-normalization.ts:24:17
isRevision function frontend/src/store/revision-normalization.ts:52:17
sortRevisionsDescending function frontend/src/store/revision-normalization.ts:68:17
resolveRevisionTransport frontend/src/store/revision-transport-service.ts:300:14
selectRevisionsState frontend/src/store/revisionsSlice.ts:589:14
selectSearchIsLoading frontend/src/store/searchSlice.ts:123:14
selectSearchErrorMessage frontend/src/store/searchSlice.ts:126:14
store frontend/src/store/store.ts:13:14
default variable frontend/src/store/store.ts:44:16
httpSearchTransport frontend/src/store/transport/search-transport.ts:61:14
stubAppShellFetch function frontend/tests/helpers/appShellFetchStub.ts:66:17
default frontend/tests/unit/helpers/fs-utils.ts:34:16
default frontend/tests/unit/helpers/project-creator.ts:132:16
Unused exported types (170)
QaSessionRecord interface cli/src/commands/qa.ts:82:18
VerifyStatus type cli/src/qa/verify.ts:34:13
VerifyArtifactKind type cli/src/qa/verify.ts:37:13
WorkspaceRejection type electron/src/projects-dir.ts:187:13
ImportSuccessOutcome interface …rivener-import/handle-import-request.ts:38:18
ImportRefusalUnsupportedOutcome interface …rivener-import/handle-import-request.ts:43:18
ImportRefusalDestinationNotEmptyOutcome interface …rivener-import/handle-import-request.ts:49:18
ImportFatalOutcome interface …rivener-import/handle-import-request.ts:55:18
SelectionHandleTarget interface …c/scrivener-import/selection-handles.ts:23:18
CompileFormat type …mponents/common/CompilePreviewModal.tsx:36:13
ButtonProps interface …/components/common/UI/Button/Button.tsx:39:18
ButtonProps type …end/components/common/UI/Button/index.ts:2:15
CardProps interface …tend/components/common/UI/Card/Card.tsx:15:18
CheckboxProps type …mponents/common/UI/Checkbox/Checkbox.tsx:6:13
CheckboxProps type …d/components/common/UI/Checkbox/index.ts:2:15
ChipProps type …ntend/components/common/UI/Chip/index.ts:2:15
DialogContentProps interface …/components/common/UI/Dialog/Dialog.tsx:29:18
DialogContentProps type …nd/components/common/UI/Dialog/index.ts:13:15
InputProps type …tend/components/common/UI/Input/index.ts:2:15
SelectProps type …end/components/common/UI/Select/index.ts:2:15
SelectProps type …d/components/common/UI/Select/Select.tsx:6:13
TextareaProps type …mponents/common/UI/Textarea/Textarea.tsx:7:13
EntityMatchState type …Extensions/entityHighlightDecoration.ts:82:13
GetWriteImageOptions interface …ents/Editor/Extensions/GetWriteImage.ts:11:18
MediaDropOptions interface …/Editor/Extensions/MediaDropExtension.ts:9:18
EditorMenuColorIconName type …itor/MenuBar/EditorMenuColorSubmenu.tsx:10:15
EditorMenuIconName type …onents/Editor/MenuBar/EditorMenuIcon.tsx:8:15
EditorMenuInputIconName type …ents/Editor/MenuBar/EditorMenuInput.tsx:19:15
ToolbarInputCommand interface …ditor/MenuBar/toolbar-command-schema.ts:48:18
ToolbarColorCommand interface …ditor/MenuBar/toolbar-command-schema.ts:57:18
ToolbarCommandItem type …ditor/MenuBar/toolbar-command-schema.ts:71:13
ResolvedToolbarIconCommand interface …nts/Editor/MenuBar/useToolbarCommand.ts:26:18
ResolvedToolbarInputCommand interface …nts/Editor/MenuBar/useToolbarCommand.ts:35:18
ResolvedToolbarColorCommand interface …nts/Editor/MenuBar/useToolbarCommand.ts:45:18
HelpParagraphBlock interface frontend/components/help/help-content.ts:15:18
HelpHeadingBlock interface frontend/components/help/help-content.ts:20:18
HelpTipCardBlock interface frontend/components/help/help-content.ts:25:18
AppShellResourceActionOptions interface frontend/components/Layout/AppShell.tsx:154:18
ShellProjectTypeLoaderState interface …nents/Layout/ShellProjectTypeLoader.tsx:10:18
RelativeDateValue interface …/components/QueryBuilder/FilterChip.tsx:25:18
RangeValue interface …/components/QueryBuilder/FilterChip.tsx:30:18
ResetOptions interface …ts/QueryBuilder/useQueryBuilderState.ts:34:18
ValuePickerRange type …components/QueryBuilder/ValuePicker.tsx:17:13
ValuePickerRelativeDate type …components/QueryBuilder/ValuePicker.tsx:18:13
ResourceRef type …components/QueryBuilder/ValuePicker.tsx:33:15
RemoveFieldChoice type …chemaManager/DeprecateOrClearDialog.tsx:13:13
ResourceOption type …ebar/controls/MultiResourceRefInput.tsx:13:15
TimelineConfig type frontend/components/Timeline/index.ts:6:3
TimelineProps type frontend/components/Timeline/index.ts:7:3
TimelineTooltipProps type frontend/components/Timeline/index.ts:9:15
RevisionEntry type frontend/components/WorkArea/DiffView.tsx:3:15
SaveStatus type …onents/WorkArea/useCanonicalAutosave.ts:11:13
RevisionContentLoadState type …mponents/WorkArea/useRevisionContent.ts:51:13
ClientRect interface …onshipGraphView/edgeTooltipPlacement.ts:14:18
PositionedNode interface …tionshipGraphView/EntityGraphCanvas.tsx:96:18
PositionedEdge interface …ionshipGraphView/EntityGraphCanvas.tsx:102:18
EntityGraphData interface …phView/EntityRelationshipGraphView.tsx:160:18
FlaggedNoiseTerm interface …s/EntityRosterView/EntityRosterView.tsx:58:18
OrganizerFilterKey type …Views/OrganizerView/organizerFilters.ts:43:13
TimelineViewProps type …nts/WorkArea/Views/TimelineView/index.ts:3:15
TimelineViewProps interface …rea/Views/TimelineView/TimelineView.tsx:11:18
ExportBody interface frontend/src/lib/api/export.ts:10:18
LockedProjectApiEntry interface frontend/src/lib/api/projects.ts:25:18
FileDownloader type …ontend/src/lib/compile/download-file.ts:24:32
CompileFormat type …lib/compile/run-compile-and-download.ts:30:13
TrashRefRecord creator type frontend/src/lib/core.ts:43:8
PurgeStepName creator type frontend/src/lib/core.ts:51:8
ImportScrivenerProjectOptions creator type frontend/src/lib/core.ts:91:8
ImportPlainTextProjectOptions creator type frontend/src/lib/core.ts:108:8
ImportPlainTextProjectResult creator type frontend/src/lib/core.ts:109:8
ImportSuccessOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:35:18
ImportRefusalUnsupportedOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:46:18
ImportRefusalDestinationNotEmptyOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:52:18
ImportFatalOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:58:18
StartDocxImportOptions desktopBridge interface frontend/src/lib/desktop-bridge.ts:81:18
GlobalNoiseWordsSetResult desktopBridge interface frontend/src/lib/desktop-bridge.ts:93:18
DocxImportSuccessOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:99:18
DocxImportRefusalNoDocxFoundOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:109:18
DocxImportRefusalDestinationNotEmptyOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:115:18
DocxImportRefusalUnknownProjectTypeOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:121:18
DocxImportFatalOutcome desktopBridge interface frontend/src/lib/desktop-bridge.ts:127:18
EditorHeadingFieldDefinition interface …ntend/src/lib/editor-heading-settings.ts:6:18
FileType type …/src/lib/models/capacitor-filesystem.ts:34:13
MediaResourceType creator type …tend/src/lib/models/media-validation.ts:33:13
MediaValidationOk creator interface …tend/src/lib/models/media-validation.ts:46:18
MediaRejectionReason creator type …tend/src/lib/models/media-validation.ts:57:13
MediaValidationError creator interface …tend/src/lib/models/media-validation.ts:60:18
SearchCheckReport interface …rc/lib/models/native-device-harness.ts:174:18
ThroughputCheckReport interface …rc/lib/models/native-device-harness.ts:182:18
MediaSizeThroughputReport interface …rc/lib/models/native-device-harness.ts:197:18
ImageThroughputCheckReport interface …rc/lib/models/native-device-harness.ts:208:18
AudioThroughputCheckReport interface …rc/lib/models/native-device-harness.ts:213:18
RenameCollisionCheckReport interface …rc/lib/models/native-device-harness.ts:218:18
PlainTextTipTapHardBreakNode interface …c/lib/models/plaintext/txt-to-tiptap.ts:46:18
PlainTextTipTapParagraphContentNode type …c/lib/models/plaintext/txt-to-tiptap.ts:52:13
PlainTextTipTapParagraphNode interface …c/lib/models/plaintext/txt-to-tiptap.ts:57:18
ProjectTypeSpecFolder interface …ntend/src/lib/models/project-creator.ts:68:18
ProjectTypeSpecResource interface …ntend/src/lib/models/project-creator.ts:91:18
ProjectTypeSpecDefaultFolder interface …tend/src/lib/models/project-creator.ts:111:18
LoadedResource interface …ontend/src/lib/models/project-loader.ts:23:18
UIResource type frontend/src/lib/models/project-view.ts:6:15
FolderWithResources type frontend/src/lib/models/project-view.ts:6:27
ComparisonOp type frontend/src/lib/models/query-ast.ts:117:13
TextOp type frontend/src/lib/models/query-ast.ts:118:13
ComparisonNode type frontend/src/lib/models/query-ast.ts:120:13
InNode type frontend/src/lib/models/query-ast.ts:125:13
ExistsNode type frontend/src/lib/models/query-ast.ts:126:13
TextNode type frontend/src/lib/models/query-ast.ts:127:13
LinksToNode type frontend/src/lib/models/query-ast.ts:128:13
LinkedFromNode type frontend/src/lib/models/query-ast.ts:129:13
ParamNode type frontend/src/lib/models/query-ast.ts:136:13
CombinatorNode type frontend/src/lib/models/query-ast.ts:146:13
SpliceNode type frontend/src/lib/models/query-ast.ts:147:13
IntrinsicFieldSource type …tend/src/lib/models/query-intrinsics.ts:12:13
ReorderFolderEntry resourceCrudCore interface …d/src/lib/models/resource-crud-core.ts:734:18
ReorderResourceEntry resourceCrudCore interface …d/src/lib/models/resource-crud-core.ts:741:18
TemplateInspection creator type frontend/src/lib/models/resource.ts:31:8
TemplateValidationResult creator type frontend/src/lib/models/resource.ts:32:8
RevisionRepairEntry interface …ntend/src/lib/models/revision-repair.ts:19:18
RevisionRepairSkip interface …ntend/src/lib/models/revision-repair.ts:24:18
SavedQueryView type frontend/src/lib/models/saved-queries.ts:13:13
QueryAST type frontend/src/lib/models/schemas.ts:16:3
LeafNode type frontend/src/lib/models/schemas.ts:17:3
CombinatorNode type frontend/src/lib/models/schemas.ts:18:3
SpliceNode type frontend/src/lib/models/schemas.ts:19:3
ComparisonNode type frontend/src/lib/models/schemas.ts:20:3
ComparisonOp type frontend/src/lib/models/schemas.ts:21:3
InNode type frontend/src/lib/models/schemas.ts:22:3
ExistsNode type frontend/src/lib/models/schemas.ts:23:3
TextNode type frontend/src/lib/models/schemas.ts:24:3
TextOp type frontend/src/lib/models/schemas.ts:25:3
LinksToNode type frontend/src/lib/models/schemas.ts:26:3
LinkedFromNode type frontend/src/lib/models/schemas.ts:27:3
AndNode type frontend/src/lib/models/schemas.ts:28:3
OrNode type frontend/src/lib/models/schemas.ts:29:3
NotNode type frontend/src/lib/models/schemas.ts:30:3
RefNode type frontend/src/lib/models/schemas.ts:31:3
ParamNode type frontend/src/lib/models/schemas.ts:32:3
ProjectTypeDefaultFolder type frontend/src/lib/models/schemas.ts:669:13
ImportPlanFolder interface …c/lib/models/scrivener/binder-mapper.ts:66:18
ImportPlanExclusionReason type …/lib/models/scrivener/binder-mapper.ts:108:13
ImportPlanExcludedItem interface …/lib/models/scrivener/binder-mapper.ts:115:18
ImportPlanNonTextResearchItem interface …/lib/models/scrivener/binder-mapper.ts:132:18
ImportPlanNote interface …/lib/models/scrivener/binder-mapper.ts:144:18
ImportPlanUntitledFallback interface …/lib/models/scrivener/binder-mapper.ts:156:18
ImportReportFieldKeyRename interface …c/lib/models/scrivener/import-report.ts:62:18
ImportReportKeywordMerge interface …c/lib/models/scrivener/import-report.ts:75:18
ImportReportResearchItem interface …c/lib/models/scrivener/import-report.ts:87:18
ImportReportExcludedOtherItem interface …c/lib/models/scrivener/import-report.ts:98:18
ImportReportTrashItem interface …/lib/models/scrivener/import-report.ts:108:18
ImportReportUntitledFallback interface …/lib/models/scrivener/import-report.ts:130:18
UnsupportedCustomMetaDataField interface …lib/models/scrivener/metadata-mapper.ts:40:18
MetadataValueSkip interface …lib/models/scrivener/metadata-mapper.ts:64:18
FieldKeyRename interface …lib/models/scrivener/metadata-mapper.ts:82:18
PlannedKeywordTag interface …lib/models/scrivener/metadata-mapper.ts:95:18
KeywordMerge interface …ib/models/scrivener/metadata-mapper.ts:108:18
KeywordTagPlan interface …ib/models/scrivener/metadata-mapper.ts:118:18
RtfTipTapMark interface …c/lib/models/scrivener/rtf-to-tiptap.ts:82:18
RtfTipTapHardBreakNode interface …c/lib/models/scrivener/rtf-to-tiptap.ts:99:18
RtfTipTapParagraphContentNode type …/lib/models/scrivener/rtf-to-tiptap.ts:104:13
RtfTipTapParagraphNode interface …/lib/models/scrivener/rtf-to-tiptap.ts:109:18
RtfTipTapDocument interface …/lib/models/scrivener/rtf-to-tiptap.ts:126:18
RtfDroppedFeature interface …/lib/models/scrivener/rtf-to-tiptap.ts:132:18
OrganizerCardBodySource creator type frontend/src/lib/models/types.ts:75:13
MetadataInputType creator type frontend/src/lib/models/types.ts:232:13
TipTapMark creator interface frontend/src/lib/models/types.ts:334:18
FetchLike type frontend/src/lib/models/update-check.ts:38:13
SearchFilters type frontend/src/store/searchSlice.ts:10:15
SearchState interface frontend/src/store/searchSlice.ts:12:18
ProjectTypeFolderMetadataSource interface frontend/src/types/project-types.ts:44:18
Duplicate exports (14)
registerDoctor|default cli/src/commands/doctor.ts
registerPrune|default cli/src/commands/prune.ts
registerQa|default cli/src/commands/qa.ts
registerReindex|default cli/src/commands/reindex.ts
registerRepairRevisions|default cli/src/commands/repair-revisions.ts
registerScreenshots|default cli/src/commands/screenshots.ts
registerTemplates|default cli/src/commands/templates.ts
flushIndexer|waitForDrain frontend/src/lib/models/indexer-queue.ts
bootstrapNativeStorageContext|ensureNativeStorageContext frontend/src/lib/models/native-bootstrap.ts
pruneAllResources|default frontend/src/lib/models/pruneExecutor.ts
Schemas|default frontend/src/lib/models/schemas.ts
toastService|default frontend/src/lib/toast-service.ts
useAppSelector|default frontend/src/store/hooks.ts
store|default frontend/src/store/store.ts
Configuration hints (6)
frontend knip.json Add entry and/or refine project files in workspaces["fr…
. (root) knip.json Add entry and/or refine project files in workspaces["."…
android knip.json Add entry and/or refine project files in workspaces["an…
…transport/native-trash-backend.web-stub.ts knip.json Remove from ignore
src/getwrite-cli.ts cli knip.json Remove redundant entry pattern
index.js package.json Package entry file not found
ELIFECYCLE Command failed with exit code 1.
```

### Reference figures (reported, not re-run unless reproduced)

The figures given for this task as orientation (frontend 6468 passed and 1 skipped, electron 488, CLI 144, lint 0 errors and 395 warnings, e2e 214 passed and 1 skipped, smoke 92 entries, 34 checks, 0 failures, at `afa62096`) were all re-measured here at `812f2859` and reproduced, except that the e2e run showed 213 passed plus 1 flaky-then-passed (see above). The older figures in `tasks.md` (frontend 6434 passed and 1 skipped, desktop 384, CLI 144, smoke 28 checks) are superseded by this run; earlier-feature figures not reproduced here are "reported, not re-run".

### git status

`git status --short` after all runs printed nothing (empty), apart from the new `specs/features/two-client-save-measurement/experiments.md` once written; see the final line below.

### Not run

- Node 22 and Node 20 runs (CI versions); every figure is Node v24.15.0.
- `pnpm build:native`.
- A second e2e run to see whether the flaky `start-page` test reproduces.
- Any scenario, script or harness (Tasks 2 to 10).
- The real desktop app; Storybook was the only server started, plus the build and the sharing smoke's own server (started and stopped by the smoke script; its pid handling was not inspected).

Final `git status --short` (after the file was written):

```
?? specs/features/two-client-save-measurement/experiments.md
```

Nothing outside `specs/` changed. At the end, no pid started by this task was alive (Storybook pids listed above exited; the sharing smoke left no `sharing-refusal-smoke` process), and 7340, 3000 and 6006 had no listener.

## Harness

Task 2. Date 2026-10-11. Main checkout `/Users/jedaisaboteur/Repositories/getwrite`, branch `feat/two-client-save-measurement`, `git rev-parse --short HEAD` = `9718807e` at the time of the runs below (the scripts and `results/` are new, uncommitted files under `specs/`). `node --version` = `v24.15.0` (CI runs Node 22 and Node 20 for the CLI; no Node 22 or Node 20 run was made and none is claimed). Standalone server reused from Task 1, built at `812f2859` (`frontend/.next/standalone/frontend/server.js`, BUILD_ID present, static copied); nothing under `frontend/` changed, so it was not rebuilt.

**This section builds and checks the measuring instrument. It measures nothing about the product and reports no finding.** Everything printed by the dry run below is the harness showing what it can see; it is one repetition with one marker on one client. Every request is host to itself (the private LAN address of this machine, `http://<lan-ip>:<port>`), not a second-device result.

### Where each thing ran

| What | Where |
|---|---|
| `node --check` of every script, `node scripts/self-check.mjs`, `pnpm knip` | inside the command sandbox |
| the dry run (`dry-run.mjs`), the hold/release check (`hold-check.mjs`), the throwaway server, Chromium, `mkdir /tmp/getwrite-two-client/logs` | OUTSIDE the sandbox (`dangerouslyDisableSandbox`) |

Logs of the outside-sandbox runs are under `/tmp/getwrite-two-client/logs/` (`dry-run-1.out`, `dry-run-2.out`, `hold-check-1.out`, and one `<run-id>-server.log` per server). The server logs were not read or pasted.

### Files read first (as Task 2 required)

Read: `specs/features/desktop-server-port/scripts/cookie-scope.mjs` (whole) and `pair-on-7340.mjs` (whole; it pairs through the Electron app, so only its process-record and path-assertion pattern was reused; the pairing mechanism is `cookie-scope.mjs`'s `writePairingState` plus typing the code into `/pair`); `frontend/scripts/sharing-refusal-smoke.mjs` (head, the `writePairingState` use and its constants); `frontend/components/WorkArea/useCanonicalAutosave.ts` (whole); `EditView.tsx` (the autosave label block, the footer and the loading/error blocks, not the whole file); `useRevisionContent.ts` (first 120 lines); `frontend/src/lib/api/resources.ts` (`patchRevisionContent` and its neighbours); `frontend/app/api/resource/revision/[resource-id]/route.ts` (whole); `frontend/src/lib/models/revision-core.ts` (`writeRevisionContent`, `syncDerivedResourceContent`, `snapshotBeforeDestructiveWrite`, `logCanonicalSave`, `updateRevisionInPlace`); `revision.ts` (`writeRevision`, `listRevisions`); `writing-log.ts` (lines 1 to 200); `word-diff.ts` (whole); `tiptap-utils.ts` (`persistResourceContent`), `tiptap-text.ts`, `word-count.ts`; `frontend/src/store/search-transport-service.ts` and `store/transport/search-transport.ts` (the HTTP part), the search route `app/api/project/[project-id]/search/route.ts` and `src/lib/search/execute-search.ts` (`findProjectRoot`); `app/api/projects/route.ts`, `app/api/resource/route.ts`, `project-crud-core.ts` (`createProjectCore`), `resource-crud-core.ts` (`createResourceCore`), `resource-factory.ts`, `resource-initial-revision.ts`, `resource-persistence.ts` (`writeResourceToFile`, text branch); `frontend/src/lib/sharing/same-origin.ts` (to learn that a non-GET request needs an `Origin` header); `frontend/e2e/helpers/editor.ts` and `components/notifications/Toaster.tsx` (for the editor and toast surfaces). Not read in full: `EditView.tsx`, `StartPage.tsx` (an `aria-label` grep only), `ResourceTree.tsx` (a grep only).

Selectors were not guessed: the start page's open button is `aria-label="Open <project name>"` (StartPage grep), the tree rows are `.resource-tree-button` (as in `e2e/appshell-after-open.e2e.spec.ts`), the footer is `#editview-footer` with the autosave label in its `aria-live="polite"` block (EditView read), the loading state is `data-testid="editview-loading"` (EditView read), the editor is `.ProseMirror[contenteditable="true"]` (the e2e helper's surface). They were then confirmed by the dry run.

### The 40-word list

Defined once in `scripts/lib/fixture.mjs` (`WORD40`; checked: 40 entries, 40 distinct, all lowercase). A long addition is ` A2LONG` or ` B2LONG` followed by these words separated by spaces (41 words appended to the base's 4).

```
harbor lantern meadow copper willow ember falcon garnet hollow island
juniper kettle ledger marble nectar orchid pebble quartz ribbon saddle
thistle umber velvet walnut yarrow zephyr anchor beacon cinder dagger
easel fathom gable harvest ivory jasper knoll lagoon mantle nimbus
```

Base document: one paragraph `BASE alpha bravo charlie`. Markers (typed with a leading space, except `Q`): ` A1`, ` A2`, ` B1`, ` B2`, `Q`; long: ` A2LONG ...`, ` B2LONG ...`.

### Modules (all under `specs/features/two-client-save-measurement/scripts/`)

| File | What it is |
|---|---|
| `lib/util.mjs` | paths, the host clock (`hostNow()` = `performance.timeOrigin + performance.now()`), sha256, `git rev-parse` |
| `lib/server.mjs` | `createRun` (run id, throwaway folders under `/tmp/getwrite-two-client/<run-id>/`, `assertThrowaway` after `realpath`, exit 5 otherwise), `listeners`, `pickFreePort`, `startServer` (spawns `server.js` with `PORT`, `HOSTNAME`/`GETWRITE_BIND` `0.0.0.0`, `GETWRITE_SHARING=1`, throwaway `GETWRITE_SHARING_DIR`, `GETWRITE_PROJECTS_DIR`, window secret held only in a closure; hosted-auth env removed), `recordTree` (ps walk), `stopServer` (recorded pids only, comm checked against the recorded name), `cleanupRun` |
| `lib/pairing.mjs` | `pairContext`: writes `pairing-state.json` (salted HMAC of a random code), types the code into the real `/pair` page of a fresh context; records only that the `getwrite_device` cookie is present |
| `lib/fixture.mjs` | fixed names, `WORD40`, label registry, project and resource creation through `POST /api/projects` and `POST /api/resource` |
| `lib/clients.mjs` | `createClient`: a paired context + page, request/console/dialog/toast capture, `typeText`, `waitForSaved`, `reloadAndOpen`, `holdPatches`/`waitHeld`/`releaseHeld`, `log()`; `savesFrom`, `labelDocs` |
| `lib/stores.mjs` | `readSnapshot`, `snapshotDigest`, `waitQuiet`, `classifySnapshot`, `determineLastProcessed`, `expectedLogEntries`, `verdict`, `searchTokens`, ports of `tiptapToPlainText`, `countWords`, `diffWords` |
| `lib/record.mjs` | `createRecord`: prints the per-repetition record and writes it as JSON under `results/<scenario>/` (a guard refuses keys named `raw`, `content`, `cookie`, `secret`, `code`, `password`, `passphrase`) |
| `lib/session.mjs` | `openSession` (server + Chromium + paired clients), `settleAndRead`, `searchFor`, `close` (teardown: contexts, browser, server by recorded pid, folder removal, port checks) |
| `self-check.mjs` | no browser, no server: synthetic stores, the reader, the classifier and the verdict |
| `dry-run.mjs` | one resource, one marker, one save, end to end |
| `hold-check.mjs` | checks the hold/release hook (two different resources, so not a two-clients-one-resource test) |

Extra files beyond the task's list: `lib/util.mjs`, `lib/session.mjs`, `dry-run.mjs`, `hold-check.mjs`. They are shared plumbing for Tasks 3 to 7.

### How the harness works (design as built)

**Server.** Built standalone `server.js`, sharing on, bind `0.0.0.0` (as `cookie-scope.mjs` does), on a port picked by binding port 0 on `0.0.0.0`, reading it and releasing it, then `lsof` re-checked immediately before the spawn (never 7340 or 3000; busy chosen port means refuse). Window secret: 32 random bytes, passed only in the child's environment and in an `x-getwrite-window` header the Node side adds when it calls the app's own API (fixture creation, readiness, search); it is not a property of the handle and is never printed. A non-GET call from Node also sends `Origin: <base url>` because the gate's same-origin check refuses a state-changing request without one (`same-origin.ts`, read, not run; the dry run's `POST /api/projects` succeeded). Readiness poll: `GET /api/auth-status`, up to 60 s. The pid is recorded, then the descendants (ps walk) after ready; in the dry runs the tree was one process (`next-server (v16.2.6)`, the retitled `node`).

**Pairing.** Each client has its own context, paired one after another through the real `/pair` page (one `pairing-state.json`). Cookie value and code never leave the function; the record shows `deviceCookiePresent: true` only.

**Editing.** Each client opens the start page, clicks `Open <project>`, clicks the resource row, waits for the editor. Typing: `editor.click()`, `keyboard.press("ControlOrMeta+End")`, then `keyboard.type(text, {delay: 40})` (a per-key delay, 40 ms by default; a 3-character marker took about 137 ms from first to last key in the dry run). The harness never calls the save API. The 2500 ms debounce is the client's own (read, not run: `useCanonicalAutosave.ts`); in the dry run the footer went `Autosave queued…` right after typing and `Saved · just now` 2528 ms later. Caret placement was checked in the dry run: after `ControlOrMeta+End` and typing ` A1`, the editor text was `BASE alpha bravo charlie A1` (`typedMarkerCaretAtEnd: true`; on this machine `ControlOrMeta` is Meta).

**Timing is decided by when each client types.** There is no scripted "simultaneous save": a save happens when a client's own debounce fires. To bring two saves close together a scenario types on both clients (for example with `Promise.all`) so the 2500 ms timers expire close together; the achieved gap is measured from the request log, never assumed.

**Hold and release (built, S2 itself not run).** `client.holdPatches()` installs a Playwright route on `**/api/resource/revision/**`; while holding, the page's PATCH requests wait in the handler. `waitHeld(n)` waits for n held requests. `releaseHeld()` calls `route.continue()` on each and records `releaseT` on the request's log entry; `stopHolding()` releases and turns holding off. A scenario releases the two clients with a chosen gap (release A, sleep, release B). The log carries both `sendT` (the page's `request` event) and `releaseT`; `effectiveSendT` is `releaseT` when held. `hold-check.mjs` showed the hook working (below): nothing answered while held, both answered 2xx after release, requested gap 250 ms, achieved gap between the two `releaseT` values 252.0 ms. The achieved gap includes the setTimeout and the first release's own `await`; it is a Playwright event-time gap, not a wire gap.

**Request log (per client).** Every request to `/api/`: method; path with ids replaced at output time by labels (`PRJ` = project directory id, `PRJ-MANIFEST-ID` = the id inside `project.json`, `R1`/`R2` = resources, `REV-R1`/`REV-R2` = canonical revision ids, unknown ids `ID<n>`); `sendT`, `respT` (host clock; Playwright `request`/`response` event times, NOT wire times); status; for a 2xx response `updatedAt`, `snapshotCreated`, `writingLog` fields (read from the JSON body); for a non-2xx response the body cut to 200 characters; for a PATCH carrying a document: content length, sha256 and which marker tokens the document's words contain (plus whether `BASE` is present and how many of the 40 words). The document string is kept in memory (`client.sentDocs`) for classification and is never written. Also captured per page: console errors and warnings, page errors, JS dialogs (accepted, so a `beforeunload` cannot stall a reload; text recorded), failed requests, toast/alert/dialog text and visibility changes (below), and marks for the moments the harness itself reloaded the page.

**Toasts and similar surfaces.** An init script with a `MutationObserver` reports every element with `role` `status`, `alert`, `dialog` or `alertdialog` when it appears or its text changes, through an exposed binding straight to Node (so a page reload does not lose earlier records). the app's toast library is react-hot-toast (the Toaster configuration was read; its rendered DOM was not inspected, so the observer is role-based and records anything with those roles); the editor's own loading message is also `role="status"` and shows up as `Loading this document…`. The footer is read separately, verbatim, with the autosave label taken from the `aria-live="polite"` block.

**Quiet wait and the store reader.** `waitQuiet`: no request in flight on any client, then a digest of the resource's revision files, resource files, sidecar, `meta/index/**`, `meta/writing-log/**` and `meta/backlinks.json`, read twice 1000 ms apart and equal. The wait (ms, number of reads, interval) is recorded. Limit: the index queue itself cannot be observed; "drained" means the digest was stable for 1 s.

**What is on disk (confirmed by reading the code and then by a real fixture and a real save).** The spec calls the revision file `content.bin`. It is a UTF-8 text file, not binary: `writeRevisionContent` writes the string with `writeFile(path, content, "utf8")` and `writeRevision` writes `content.bin` plus `metadata.json` in a temp directory renamed into `revisions/<resource>/v-<N>/` (read, not run). In the real fixture `v-1/content.bin` was 109 bytes of compact JSON (`{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"BASE alpha bravo charlie"}]}]}`), and after the dry run's save 208 bytes, byte-for-byte the string the client had sent (sha256 equal to the request log's). `content.tiptap.json` is `JSON.stringify(doc, null, 2)` of the parsed document (340 bytes after the save), `content.txt` is the plain text (27 bytes: `BASE alpha bravo charlie A1`). The sidecar `meta/resource-<id>.meta.json` has keys `createdAt, folderId, id, name, orderIndex, slug, type, updatedAt, userMetadata, wordCount`; `updatedAt` was `null` in the freshly created fixture and `2026-10-11T18:46:20.934Z` after the save.

**Expected derived forms (read, not run).** From `syncDerivedResourceContent` / `persistResourceContent` / `updateRevisionInPlace`: for a saved document string `c`, `content.bin === c`; `content.tiptap.json === JSON.stringify(JSON.parse(c), null, 2)`; `content.txt === tiptapToPlainText(JSON.parse(c))`; `wordCount === countWords(content.txt)`; the response `updatedAt` is taken from `new Date().toISOString()` just before `writeSidecar`, so the sidecar `updatedAt` after a save equals that save's response `updatedAt` unless another save wrote the sidecar after it. `tiptapToPlainText`, `countWords` and `diffWords` in `lib/stores.mjs` are ports made by reading `tiptap-text.ts`, `word-count.ts` and `word-diff.ts`, not imports (those are TypeScript). A port that differs from the source would appear as a disagreement in a real run; the self-check cannot detect it. In the dry run all three agreed with the product's output.

**Classifier.** For each of the three file stores it names which document(s) the stored text equals byte for byte (`A#1`, `B#1`, `base`, ... , the labels are the documents the clients actually sent plus the base read from the fixture's `content.bin`), or: `unparseable`; `none` with a diff (nearest document, common prefix and suffix lengths, the differing middle cut to 300 chars) and, if the bytes are a first part of one document plus a last part of another, a `mix:` hint, or a `truncated:` hint; `parsed-equal-bytes-differ` (a harness expected-form suspect, counted as a FAIL, never a pass); `missing`. It also reports whether the three agree on one document, the sidecar `wordCount` against each document's word count, and for every non-canonical revision which document its `content.bin` equals (recoverability).

**Last processed.** `determineLastProcessed` takes the 2xx content saves of the repetition. One save: determined. Several: the save with the greatest response `updatedAt` is compared with the save whose response arrived last; if the two last `updatedAt` values tie, or if the two orders disagree, the result is "order not determined" (a repetition counted UNSTABLE). Send order is recorded as evidence but does not decide. Writing-log entry timestamps are listed by the store reader but are not attributed to a client (an entry carries no client), so they are evidence of count and spacing only.

**Independent expected writing-log entries.** `expectedLogEntries(base, documents in processing order)`: each save's word-bag difference against the previous content (the base first), dropping a 0/0 result (read, not run: `logCanonicalSave` appends nothing when added and deleted are both 0). For an undetermined order a scenario computes it for both orders and prints both.

**Verdict function** (`verdict`): FAIL if any file store is not exactly one saved document (none, mixed, unparseable, missing, parsed-equal-only), if the canonical count is not 1, if the three stores do not agree on one document, or if the sidecar `wordCount` does not match the stored document, whatever the save order; else UNSTABLE if the order is not determined; else FAIL if the stored document is not the last processed save's, FAIL if the sidecar `updatedAt` is not that save's response `updatedAt`; else, when `requireReload` is set (it is the default; the self-check turns it off only where there is no browser), FAIL unless every client's text after a reload equals the document's plain text; else PASS. Editor-versus-store agreement after a reload is therefore part of PASS in a real run.

**Search.** The app's search route is `GET /api/project/<id>/search?q=<token>` (the HTTP transport behind `executeSearchRequest`). Its `<id>` is the `id` inside `project.json`, NOT the project directory name: the first dry run searched with the directory name and got 404 for every token (`findProjectRoot` matches `project.json`'s `id`, read, not run), and the fixture now records both ids. The harness calls it from Node with the window header (GET). It records status, hit count and hit resource ids (no snippets).

**Mention and diagnostics indexes.** Read as raw records for the resource from `meta/index/mentions.json` and `meta/index/diagnostics.json`. The fixture declares no entity, so the mention index holds no record for the resource and cannot show a mismatch. The diagnostics heuristics are TypeScript and are not ported, so the harness does NOT compare the diagnostics record against the stored plain text; it prints the raw record. This part of FR-6 is therefore only partly covered by the harness (see Not run).

**The record.** `lib/record.mjs` prints: scenario, repetition, run id, commit, node, server (built standalone, port, pid, "host to itself"), steps with times (ms since the record's start and ISO), the six outcomes of the task header (each printed even when the run did not fill it: "not recorded by this run"), verdict inputs (saves with `updatedAt`/send/response times, the last-processed determination with its evidence, document sha256s, reload texts), the verdict, findings with no verdict, and extra facts (pre-checks, request logs, teardown). The same is written to `results/<scenario>/<run-id>-rep<NN>.json` (marker strings and hashes only; the guard above refuses document-like keys).

**Process safety and cleanup (shown by the runs below).** 7340 and 3000 listener status recorded before and after each run and never acted on; the server stopped by its recorded pid (SIGTERM; SIGKILL only if still alive, with the recorded command name re-checked); Chromium's processes recorded as the descendants of the script that are not the server, confirmed gone after `browser.close()`; the throwaway folder removed and the removal confirmed; the stop list is by pid, never by port or name.

### knip

The task's Notes assumed scripts under `specs/` would not appear; Task 1 had already found they do. `pnpm knip` (inside the sandbox) after these scripts: Unused files 77 (baseline 66): the 11 new entries are exactly `specs/features/two-client-save-measurement/scripts/{dry-run,hold-check,self-check}.mjs` and `scripts/lib/{clients,fixture,pairing,record,server,session,stores,util}.mjs`. Counts in the other sections are unchanged from the baseline (unused dependencies 1, devDependencies 4, unlisted dependencies 6, unlisted binaries 4, unused exports 166, unused exported types 170, duplicate exports 14, configuration hints 6); the names of those sections were not compared by set in this task, only the counts. Nothing was done to hide the new entries.

### Self-check

`node scripts/self-check.mjs`, inside the sandbox, no browser, no server. It writes synthetic stores for one resource into a throwaway folder (`os.tmpdir()`, removed afterwards) and runs the SAME `readSnapshot`, `classifySnapshot`, `determineLastProcessed` and `verdict` the scenarios use. Cases 1 to 7 are the ones the task required (A, B, the base, a mix of A's `content.bin`/`content.tiptap.json` with B's `content.txt`, an interleaving of the first part of A's bytes with the tail of B's in one file, a truncated unparseable file, a sidecar `wordCount` inconsistent with the content); 8 to 14 are extra (right document but not the last processed, order not determined by a tie or by disagreement, a sidecar `updatedAt` of the other save, one stray character in `content.txt`, and the reload requirement). The output of the final run, verbatim (exit status 0):

```
self-check: node v24.15.0; throwaway folder under os.tmpdir() (removed afterwards); no browser, no server
documents: A = base + " A1"; B = base + " B2LONG" + the 40-word list
expected word counts (ported countWords, read not run): base=4 A=5 B=45
verdict called with requireReload=false unless the case says otherwise (no browser here to reload)

ok       1. exactly A's document in all four stores (A processed last)
           content.bin (canonical): = A#1
           content.tiptap.json: = A#1
           content.txt: = A#1
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:02.000Z
           stores agree on A#1
           last processed: A#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: PASS -- all four stores hold A#1, the last processed save

ok       2. exactly B's document in all four stores (B processed last)
           content.bin (canonical): = B#1
           content.tiptap.json: = B#1
           content.txt: = B#1
           sidecar wordCount=45 matches B#1; updatedAt=2026-10-11T18:00:02.000Z
           stores agree on B#1
           last processed: B#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: PASS -- all four stores hold B#1, the last processed save

ok       3. the base document in all four stores (B processed last, so B's save is missing)
           content.bin (canonical): = base
           content.tiptap.json: = base
           content.txt: = base
           sidecar wordCount=4 matches base; updatedAt=2026-10-11T17:59:00.000Z
           stores agree on base
           last processed: B#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: FAIL -- stores hold base but the last processed save carried B#1

ok       4. MIX: content.bin and content.tiptap.json from A, content.txt from B
           content.bin (canonical): = A#1
           content.tiptap.json: = A#1
           content.txt: = B#1
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:02.000Z
           stores disagree
           last processed: A#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: FAIL -- stores disagree: content.bin=A#1, content.tiptap.json=A#1, content.txt=B#1

ok       5. INTERLEAVING: content.bin = first part of A's bytes (through ' A1') + tail of B's bytes
           content.bin (canonical): NONE (mix: first 106 chars match A#1, last 276 chars match B#1)
           content.tiptap.json: = A#1
           content.txt: = A#1
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:02.000Z
           stores disagree
           content.bin diff vs nearest B#1: common prefix 104, common suffix 276, stored 382 chars vs 394; stored middle="A1"
           last processed: A#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: FAIL -- content.bin: holds none of the documents (mix: first 106 chars match A#1, last 276 chars match B#1)

ok       6. truncated, unparseable content.bin (A's bytes cut at 60%)
           content.bin (canonical): UNPARSEABLE (truncated: stored text is the first 67 of 109 chars of base)
           content.tiptap.json: = A#1
           content.txt: = A#1
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:02.000Z
           stores disagree
           content.bin diff vs nearest base: common prefix 67, common suffix 0, stored 67 chars vs 109; stored middle=""
           last processed: A#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: FAIL -- content.bin: unparseable

ok       7. sidecar wordCount inconsistent (A's document everywhere, wordCount of B's)
           content.bin (canonical): = A#1
           content.tiptap.json: = A#1
           content.txt: = A#1
           sidecar wordCount=45 matches B#1; updatedAt=2026-10-11T18:00:02.000Z
           stores agree on A#1
           wordCount inconsistent
           last processed: A#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: FAIL -- wordCount inconsistent: sidecar wordCount=45, stored document word count=5

ok       8. [extra] A's document everywhere but B was processed last
           content.bin (canonical): = A#1
           content.tiptap.json: = A#1
           content.txt: = A#1
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:02.000Z
           stores agree on A#1
           last processed: B#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: FAIL -- stores hold A#1 but the last processed save carried B#1

ok       9. [extra] A's document everywhere, updatedAt of the last two saves tied (order not determined)
           content.bin (canonical): = A#1
           content.tiptap.json: = A#1
           content.txt: = A#1
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:01.000Z
           stores agree on A#1
           last processed: NOT DETERMINED (updatedAt tie between the last two saves)
           verdict: UNSTABLE -- order not determined: updatedAt tie between the last two saves; stores agree on A#1

ok       10. [extra] A's document everywhere, updatedAt order and response arrival order disagree
           content.bin (canonical): = A#1
           content.tiptap.json: = A#1
           content.txt: = A#1
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:02.000Z
           stores agree on A#1
           last processed: NOT DETERMINED (updatedAt order and response arrival order disagree)
           verdict: UNSTABLE -- order not determined: updatedAt order and response arrival order disagree; stores agree on A#1

ok       11. [extra] A's document everywhere, sidecar updatedAt is the other save's
           content.bin (canonical): = A#1
           content.tiptap.json: = A#1
           content.txt: = A#1
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:01.000Z
           stores agree on A#1
           last processed: A#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: FAIL -- sidecar updatedAt 2026-10-11T18:00:01.000Z is not the last processed save's updatedAt 2026-10-11T18:00:02.000Z

ok       12. [extra] content.txt has one stray trailing character
           content.bin (canonical): = A#1
           content.tiptap.json: = A#1
           content.txt: NONE
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:02.000Z
           stores disagree
           content.txt diff vs nearest A#1: stored middle="x", nearest middle=""
           last processed: A#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: FAIL -- content.txt: holds none of the documents

ok       13. [extra] all four hold A (last processed), requireReload on, both clients reloaded to A's text
           content.bin (canonical): = A#1
           content.tiptap.json: = A#1
           content.txt: = A#1
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:02.000Z
           stores agree on A#1
           last processed: A#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: PASS -- all four stores hold A#1, the last processed save

ok       14. [extra] all four hold A (last processed), requireReload on, client B reloaded to the base text
           content.bin (canonical): = A#1
           content.tiptap.json: = A#1
           content.txt: = A#1
           sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:00:02.000Z
           stores agree on A#1
           last processed: A#1 (updatedAt 2026-10-11T18:00:02.000Z)
           verdict: FAIL -- client B shows a different document after reload

throwaway folder removed: true
cases: 14; constructed as PASS: 3 (cases 1, 2, 13); mismatches: 0
SELF-CHECK OK: every case was named and judged as constructed
```

All 14 cases were named and judged as constructed. The verdict function returned PASS for exactly the cases constructed as PASS: 1 (A's document in all four stores, A processed last), 2 (B's document in all four stores, B processed last) and 13 (A's document, reload requirement on, both clients reloaded to A's text, which is a PASS case by construction); it returned FAIL for the base document, the mix, the interleaving, the unparseable file, the inconsistent `wordCount`, the right-document-but-not-last case, the other-save `updatedAt`, the stray character and the wrong reload text, and UNSTABLE for the tie and for the updatedAt/arrival disagreement. Limits of the self-check: it exercises the reader, classifier and verdict on files it wrote itself in the layout read from the code; it does not show that a real server writes that layout (the dry run does, for one save), and it cannot detect a port of a product helper that differs from the product's.

### Dry run (one fresh resource, one typed marker on one client, one save end to end)

**DRY RUN: measures nothing about the product, is not a finding, and every request is host to itself, not a second-device result.** Ran OUTSIDE the command sandbox. Run 2 is the one pasted (run 1 was discarded, see below). The record is the printed output of `node scripts/dry-run.mjs` (exit status 0) with the two request-log lines replaced by the compact tables that follow it (the same data as in the JSON); every other line is verbatim. Written to `results/dry-run/dry-mv46c5uv-79f2c2-rep01.json` (63,208 bytes; a grep of it for `getwrite_device`, `Cookie`, `secret`, `passphrase` as key or value found only the two boolean keys `deviceCookiePresent`; it contains no pairing code).

What the dry run did, in order: created the project and the resource through the app's API; read the stores before any client opened the resource (classified as the base, all four); opened the resource in both clients; typed ` A1` on A with real keystrokes; waited for the footer to read Saved; read B's editor straight after, and after 30 s; waited for quiet; read and classified the stores; reloaded both clients; searched for `A1` and `BASE` before and after; applied the verdict function with the reload requirement on (PASS: this only shows the function can return PASS from real data when one client saved once; it is not a verdict on anything).

```
====================================================================================================
RECORD scenario=dry-run repetition=1 run=dry-mv46c5uv-79f2c2 commit=9718807e node=v24.15.0
started 2026-10-11T18:46:14.074Z
server: built standalone server (frontend/.next/standalone/frontend/server.js), sharing on; port 62466; pid 15827; private LAN IPv4 of this host (host to itself, not a second-device result)
every result in this record: host to itself, not a second-device result. Times: Playwright event times on the host clock, not wire times.
note: DRY RUN of the harness. Measures nothing about the product; not a finding.
-- steps (time since record start) --
  [+    21 ms 2026-10-11T18:46:14.095Z] fixture created through POST /api/projects and POST /api/resource {"resourceLabel":"R1","baseContentChars":109}
  [+  2034 ms 2026-10-11T18:46:16.108Z] initial stores read (before any client opened the resource) {"classification":["content.bin (canonical): = base","content.tiptap.json: = base","content.txt: = base","sidecar wordCount=4 matches base; updatedAt=null","stores agree on base"],"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:46:14.094Z","savedAt":"2026-10-11T18:46:14.094Z","hasId":true,"contentBin":{"bytes":109,"sha256":"2642f35db296aa8e807fcee83ca02fcc876fee0e6793a3726c3993d2481fabe1"},"contentEquals":["base"]}]}
  [+  4241 ms 2026-10-11T18:46:18.315Z] both clients opened the resource in the real editor {"openA":{"openedInMs":1097},"openB":{"openedInMs":1091},"aText":"BASE alpha bravo charlie","bText":"BASE alpha bravo charlie"}
  [+  4244 ms 2026-10-11T18:46:18.317Z] footers after open {"A":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"},"B":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}
  [+  4244 ms 2026-10-11T18:46:18.317Z] requests each page made while opening (no typing yet) {"A":19,"B":19}
  [+  4393 ms 2026-10-11T18:46:18.466Z] A typed ' A1' with real keystrokes {"delayMs":40,"firstToLastMs":137,"editorAfterTyping":"BASE alpha bravo charlie A1","footerRightAfterTyping":{"full":"Words: 5 | Node: Body | Today's writing Today: 0 Autosave queued…","autosave":"Autosave queued…"}}
  [+  6921 ms 2026-10-11T18:46:20.995Z] A's save answered and footer read Saved {"caretAtEnd":true,"ok":true,"footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"},"savedSeenAt":1791744380995.373,"waitedMs":2528}
  [+  6925 ms 2026-10-11T18:46:20.998Z] B's editor right after A's save was acknowledged (no reload) (a) {"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}
  [+ 36935 ms 2026-10-11T18:46:51.009Z] B's editor after 30 s (no reload) (b) {"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}
  [+ 37942 ms 2026-10-11T18:46:52.015Z] quiet wait finished, stores read {"quiet":true,"waitedMs":1005,"reads":2,"intervalMs":1000}
  [+ 39978 ms 2026-10-11T18:46:54.052Z] both reloaded (page reload, then reopen) (c) {"reloadA":{"openedInMs":965},"reloadB":{"openedInMs":961},"footerA":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"},"footerB":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}
-- Outcome 1, server state (four stores, classified) --
  classification: ["content.bin (canonical): = A#1","content.tiptap.json: = A#1","content.txt: = A#1","sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:46:20.934Z","stores agree on A#1"]
  revisionDirsAndMetadata: [{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:46:14.094Z","savedAt":"2026-10-11T18:46:14.094Z","hasId":true,"contentBin":{"bytes":208,"sha256":"7218bdd5b78ee8cedf4ee7b3f3e769fe544c242dd16d55e5f93a8ccc1031e610"},"contentEquals":["A#1"]}]
  otherRevisionDirEntries: []
  sidecar: {"parsed":true,"wordCount":5,"updatedAt":"2026-10-11T18:46:20.934Z","name":"Doc dry-mv46c5uv-79f2c2","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]}
  contentTiptapJson: {"bytes":340,"sha256":"f163edb31df33ced65bc06c4c0eb213f71fb592bdff10b23b596d3f7288536c0"}
  contentTxt: {"bytes":27,"sha256":"b71058e96e11f9980d6864dee1034be30d4b5eeff7b4beaf07b45a678e0215f0"}
  allFourAgree: true
  quietWait: {"quiet":true,"waitedMs":1005,"reads":2,"intervalMs":1000}
  onDiskNames: revisions/<R1>/v-N/content.bin (UTF-8 JSON text of the document the client sent) + metadata.json; resources/<R1>/content.tiptap.json; resources/<R1>/content.txt; meta/resource-<R1>.meta.json
-- Outcome 2, each open editor (text and footer: (a) right after the other client's save was acknowledged, (b) after 30 s, (c) after reload) --
  A_afterReload: BASE alpha bravo charlie A1
  B_rightAfterOtherSave: {"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}
  B_afterReload: BASE alpha bravo charlie A1
-- Outcome 3, notification (surfaces checked are named) --
  surfacesChecked: role=status/alert/dialog elements added or changed (MutationObserver), JS dialogs, console errors/warnings, page errors, failed requests
  A: {"surfaces":[{"t":1791744377172,"role":"status","text":"Loading this document…"},{"t":1791744377172,"role":"status","text":"Loading diagnostics…"},{"t":1791744380944,"role":"status","text":"Loading diagnostics…"},{"t":1791744413012,"role":"status","text":"Loading this document…"},{"t":1791744413012,"role":"status","text":"Loading diagnostics…"}],"console":[{"t":1791744376240.3486,"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)"},{"t":1791744377105.6577,"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead."},{"t":1791744377169.845,"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead."},{"t":1791744412090.513,"type":"error","text":"Error fetching projects: TypeError: Failed to fetch"},{"t":1791744412120.4763,"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)"},{"t":1791744412980.7532,"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead."},{"t":1791744413010.3198,"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead."}],"pageErrors":[],"dialogs":[],"failedRequests":[{"n":24,"method":"GET","error":"net::ERR_ABORTED"},{"n":26,"method":"GET","error":"net::ERR_ABORTED"},{"n":27,"method":"GET","error":"net::ERR_ABORTED"},{"n":23,"method":"GET","error":"net::ERR_ABORTED"},{"n":25,"method":"GET","error":"net::ERR_ABORTED"}]}
  B: {"surfaces":[{"t":1791744378264,"role":"status","text":"Loading this document…"},{"t":1791744378264,"role":"status","text":"Loading diagnostics…"},{"t":1791744414012,"role":"status","text":"Loading this document…"},{"t":1791744414012,"role":"status","text":"Loading diagnostics…"}],"console":[{"t":1791744377326.1125,"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)"},{"t":1791744378193.3208,"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead."},{"t":1791744378261.599,"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead."},{"t":1791744413095.016,"type":"error","text":"Error fetching projects: TypeError: Failed to fetch"},{"t":1791744413124.8245,"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)"},{"t":1791744413977.9802,"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead."},{"t":1791744414010.325,"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead."}],"pageErrors":[],"dialogs":[],"failedRequests":[{"n":24,"method":"GET","error":"net::ERR_ABORTED"},{"n":21,"method":"GET","error":"net::ERR_ABORTED"},{"n":22,"method":"GET","error":"net::ERR_ABORTED"},{"n":20,"method":"GET","error":"net::ERR_ABORTED"},{"n":23,"method":"GET","error":"net::ERR_ABORTED"}]}
-- Outcome 4, lost-update shape (did a stale editor's save write its older copy over newer text, and only after typing) --
  note: not applicable to the dry run: no stale editor saved
-- Outcome 5, side effects (revisions, writing log vs expected, search, wordCount, indexes) --
  revisions: [{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#1"],"sha256":"7218bdd5b78ee8cedf4ee7b3f3e769fe544c242dd16d55e5f93a8ccc1031e610","bytes":208}]
  writingLogEntriesSinceStart: [{"added":1,"deleted":0,"net":1,"timestamp":"2026-10-11T18:46:20.932Z"}]
  expectedWritingLog: [{"added":1,"deleted":0,"net":1}]
  writingLogMatchesExpected: true
  searchBefore: {"A1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["fa8aa39d-626c-4396-80b8-6eb254d0d70b"]}}
  searchAfter: {"A1":{"status":200,"count":1,"resourceIds":["fa8aa39d-626c-4396-80b8-6eb254d0d70b"]},"BASE":{"status":200,"count":1,"resourceIds":["fa8aa39d-626c-4396-80b8-6eb254d0d70b"]}}
  sidecarWordCount: 5
  expectedWordCounts: {"base":4,"A#1":5}
  mentionIndex: {"filePresent":true,"recordsForResource":[]}
  diagnosticsIndex: {"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}}
  indexesComparedToPlainText: not compared by the harness (the diagnostics heuristics are TypeScript and are not ported); raw records are printed
-- Outcome 6, failed saves (non-2xx: status and truncated body; what the client showed) --
  failedSavesA: []
  failedSavesB: []
  result: no failed save
-- verdict inputs --
  {"saves":[{"id":"A20","docLabel":"A#1","updatedAt":"2026-10-11T18:46:20.934Z","sendT":1791744380924.9028,"respT":1791744380937.277}],"lastProcessed":{"docLabel":"A#1","updatedAt":"2026-10-11T18:46:20.934Z"},"evidence":{"byUpdatedAt":["A20"],"byResponseArrival":["A20"],"bySend":["A20"],"updatedAtValues":["2026-10-11T18:46:20.934Z"]},"documentHashes":{"A#1":"7218bdd5b78ee8cedf4ee7b3f3e769fe544c242dd16d55e5f93a8ccc1031e610"},"requireReload":true,"reloadTexts":{"A":"BASE alpha bravo charlie A1","B":"BASE alpha bravo charlie A1"}}
-- verdict (against the Task 1 definition) --
  {"verdict":"PASS","reasons":["all four stores hold A#1, the last processed save"],"flags":{"reloadChecked":true}}
-- findings, raw observations, NO verdict --
  (none recorded by this run)
-- extra facts --
  preChecks: {"listeners7340":"none","listeners3000":"none","chosenPort":62466,"chosenPortListenersBeforeStart":"none (checked immediately before start)","serverPidsRecorded":[{"pid":15827,"comm":"next-server (v16.2.6)"}],"browserPidsRecorded":[{"pid":15856,"comm":"chrome-headless-shell"},{"pid":15857,"comm":"chrome-headless-shell"},{"pid":15858,"comm":"chrome-headless-shell"},{"pid":15896,"comm":"chrome-headless-shell"},{"pid":15910,"comm":"chrome-headless-shell"}],"clientsPaired":{"A":{"paired":true,"deviceCookiePresent":true},"B":{"paired":true,"deviceCookiePresent":true}},"throwawayRootAsserted":"/private/tmp/getwrite-two-client/dry-mv46c5uv-79f2c2"}
  typedMarkerCaretAtEnd: true
  labelsRegistered: [{"label":"PRJ","idLength":36},{"label":"PRJ-MANIFEST-ID","idLength":36},{"label":"R1","idLength":36},{"label":"REV-R1","idLength":36}]
  pageReloadMarks: {"A":[{"name":"page.reload","t":1791744412016.1123}],"B":[{"name":"page.reload","t":1791744413046.014}]}
  visibilityEvents: {"A":[{"t":1791744376135,"state":"hidden"},{"t":1791744412034,"state":"hidden"},{"t":1791744412088,"state":"hidden"}],"B":[{"t":1791744377229,"state":"hidden"},{"t":1791744413052,"state":"hidden"},{"t":1791744413093,"state":"hidden"}]}
  teardown: {"errors":[],"browserPidsRecorded":5,"browserPidsAliveAfterClose":[],"browserPidsAliveAfterTerm":[],"server":{"recorded":[{"pid":15827,"comm":"next-server (v16.2.6)"}],"stillAliveAfterTerm":[],"stillAliveAfterKill":[],"portListenersAfter":[],"listeners7340After":[],"listeners3000After":[]},"listeners7340After":[],"listeners3000After":[],"cleanup":{"removed":true,"path":"/private/tmp/getwrite-two-client/dry-mv46c5uv-79f2c2"}}
====================================================================================================
JSON written: /Users/jedaisaboteur/Repositories/getwrite/specs/features/two-client-save-measurement/results/dry-run/dry-mv46c5uv-79f2c2-rep01.json
DRY RUN: measures nothing about the product; host to itself, not a second-device result.
  requestLogA / requestLogB: see the compact tables below (identical data to the JSON)
```

Request logs of dry run 2 (compact form of `extra.requestLogA` / `requestLogB` in the JSON; times are Playwright event times on the host clock, UTC; ids replaced by labels; response fields only for 2xx):

```
requestLogA
  #1 GET /api/auth/get-session send 18:46:16.227Z resp 18:46:16.240Z 404
  #2 GET /api/encryption send 18:46:16.239Z resp 18:46:16.240Z 200
  #3 GET /api/version-check send 18:46:16.239Z resp 18:46:16.244Z 200
  #4 GET /api/auth-status send 18:46:16.239Z resp 18:46:16.245Z 200
  #5 GET /api/projects send 18:46:16.239Z resp 18:46:16.245Z 200
  #6 GET /api/sharing/limits send 18:46:16.240Z resp 18:46:16.245Z 200
  #7 POST /api/project send 18:46:17.084Z resp 18:46:17.094Z 200
  #8 GET /api/project/PRJ/entity-alias-table send 18:46:17.105Z resp 18:46:17.146Z 200
  #9 GET /api/project/PRJ/entity-alias-table send 18:46:17.121Z resp 18:46:17.148Z 200
  #10 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:46:17.121Z resp 18:46:17.148Z 200
  #11 POST /api/project/tags send 18:46:17.121Z resp 18:46:17.148Z 200
  #12 POST /api/project/query/saved send 18:46:17.121Z resp 18:46:17.148Z 200
  #13 POST /api/project-resources send 18:46:17.175Z resp 18:46:17.185Z 200
  #14 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:46:17.175Z resp 18:46:17.185Z 200
  #15 POST /api/project-resources send 18:46:17.175Z resp 18:46:17.186Z 200
  #16 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:46:17.175Z resp 18:46:17.186Z 200
  #17 POST /api/project/tags send 18:46:17.175Z resp 18:46:17.184Z 200
  #18 POST /api/project/tags send 18:46:17.175Z resp 18:46:17.185Z 200
  #19 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:46:17.187Z resp 18:46:17.212Z 200
  #20 PATCH /api/resource/revision/R1 send 18:46:20.924Z resp 18:46:20.937Z 200 updatedAt=2026-10-11T18:46:20.934Z snapshotCreated=false writingLog=null doc{len=208,sha256=7218bdd5b78ee8cedf4ee7b3f3e769fe544c242dd16d55e5f93a8ccc1031e610,markers=["A1"]}
  #21 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:46:20.941Z resp 18:46:20.946Z 200
  #22 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:46:20.941Z resp 18:46:20.946Z 200
  #23 GET /api/encryption send 18:46:52.088Z resp - null net::ERR_ABORTED
  #24 GET /api/version-check send 18:46:52.088Z resp - null net::ERR_ABORTED
  #25 GET /api/auth-status send 18:46:52.088Z resp - null net::ERR_ABORTED
  #26 GET /api/projects send 18:46:52.088Z resp - null net::ERR_ABORTED
  #27 GET /api/sharing/limits send 18:46:52.088Z resp - null net::ERR_ABORTED
  #28 GET /api/encryption send 18:46:52.113Z resp 18:46:52.116Z 200
  #29 GET /api/version-check send 18:46:52.113Z resp 18:46:52.118Z 200
  #30 GET /api/auth-status send 18:46:52.113Z resp 18:46:52.118Z 200
  #31 GET /api/projects send 18:46:52.113Z resp 18:46:52.121Z 200
  #32 GET /api/sharing/limits send 18:46:52.113Z resp 18:46:52.119Z 200
  #33 GET /api/auth/get-session send 18:46:52.115Z resp 18:46:52.120Z 404
  #34 POST /api/project send 18:46:52.965Z resp 18:46:52.973Z 200
  #35 GET /api/project/PRJ/entity-alias-table send 18:46:52.980Z resp 18:46:52.989Z 200
  #36 GET /api/project/PRJ/entity-alias-table send 18:46:52.987Z resp 18:46:52.995Z 200
  #37 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:46:52.987Z resp 18:46:52.995Z 200
  #38 POST /api/project/tags send 18:46:52.987Z resp 18:46:52.995Z 200
  #39 POST /api/project/query/saved send 18:46:52.987Z resp 18:46:52.992Z 200
  #40 POST /api/project-resources send 18:46:53.013Z resp 18:46:53.024Z 200
  #41 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:46:53.013Z resp 18:46:53.023Z 200
  #42 POST /api/project-resources send 18:46:53.013Z resp 18:46:53.023Z 200
  #43 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:46:53.013Z resp 18:46:53.024Z 200
  #44 POST /api/project/tags send 18:46:53.013Z resp 18:46:53.022Z 200
  #45 POST /api/project/tags send 18:46:53.013Z resp 18:46:53.022Z 200
  #46 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:46:53.024Z resp 18:46:53.039Z 200
requestLogB
  #1 GET /api/auth/get-session send 18:46:17.312Z resp 18:46:17.325Z 404
  #2 GET /api/encryption send 18:46:17.325Z resp 18:46:17.326Z 200
  #3 GET /api/version-check send 18:46:17.325Z resp 18:46:17.329Z 200
  #4 GET /api/auth-status send 18:46:17.325Z resp 18:46:17.330Z 200
  #5 GET /api/projects send 18:46:17.325Z resp 18:46:17.331Z 200
  #6 GET /api/sharing/limits send 18:46:17.325Z resp 18:46:17.330Z 200
  #7 POST /api/project send 18:46:18.174Z resp 18:46:18.181Z 200
  #8 GET /api/project/PRJ/entity-alias-table send 18:46:18.193Z resp 18:46:18.235Z 200
  #9 GET /api/project/PRJ/entity-alias-table send 18:46:18.209Z resp 18:46:18.237Z 200
  #10 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:46:18.209Z resp 18:46:18.237Z 200
  #11 POST /api/project/tags send 18:46:18.209Z resp 18:46:18.237Z 200
  #12 POST /api/project/query/saved send 18:46:18.209Z resp 18:46:18.237Z 200
  #13 POST /api/project-resources send 18:46:18.265Z resp 18:46:18.277Z 200
  #14 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:46:18.265Z resp 18:46:18.276Z 200
  #15 POST /api/project-resources send 18:46:18.265Z resp 18:46:18.277Z 200
  #16 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:46:18.265Z resp 18:46:18.276Z 200
  #17 POST /api/project/tags send 18:46:18.265Z resp 18:46:18.275Z 200
  #18 POST /api/project/tags send 18:46:18.265Z resp 18:46:18.275Z 200
  #19 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:46:18.278Z resp 18:46:18.303Z 200
  #20 GET /api/encryption send 18:46:53.093Z resp - null net::ERR_ABORTED
  #21 GET /api/version-check send 18:46:53.093Z resp - null net::ERR_ABORTED
  #22 GET /api/auth-status send 18:46:53.093Z resp - null net::ERR_ABORTED
  #23 GET /api/projects send 18:46:53.093Z resp - null net::ERR_ABORTED
  #24 GET /api/sharing/limits send 18:46:53.094Z resp - null net::ERR_ABORTED
  #25 GET /api/encryption send 18:46:53.117Z resp 18:46:53.120Z 200
  #26 GET /api/version-check send 18:46:53.117Z resp 18:46:53.122Z 200
  #27 GET /api/auth-status send 18:46:53.117Z resp 18:46:53.122Z 200
  #28 GET /api/projects send 18:46:53.117Z resp 18:46:53.125Z 200
  #29 GET /api/sharing/limits send 18:46:53.117Z resp 18:46:53.124Z 200
  #30 GET /api/auth/get-session send 18:46:53.119Z resp 18:46:53.124Z 404
  #31 POST /api/project send 18:46:53.964Z resp 18:46:53.971Z 200
  #32 GET /api/project/PRJ/entity-alias-table send 18:46:53.977Z resp 18:46:53.986Z 200
  #33 GET /api/project/PRJ/entity-alias-table send 18:46:53.984Z resp 18:46:53.991Z 200
  #34 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:46:53.984Z resp 18:46:53.992Z 200
  #35 POST /api/project/tags send 18:46:53.984Z resp 18:46:53.991Z 200
  #36 POST /api/project/query/saved send 18:46:53.984Z resp 18:46:53.989Z 200
  #37 POST /api/project-resources send 18:46:54.013Z resp 18:46:54.025Z 200
  #38 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:46:54.013Z resp 18:46:54.023Z 200
  #39 POST /api/project-resources send 18:46:54.013Z resp 18:46:54.023Z 200
  #40 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:46:54.013Z resp 18:46:54.023Z 200
  #41 POST /api/project/tags send 18:46:54.013Z resp 18:46:54.022Z 200
  #42 POST /api/project/tags send 18:46:54.013Z resp 18:46:54.023Z 200
  #43 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:46:54.024Z resp 18:46:54.040Z 200
```

What this record shows about the harness (not about the product):

- The fixture came out of the app's own API with a single canonical revision `v-1`; the stores read as the base in all four places before any client opened it.
- Both pages issue about 19 `/api/` requests on opening a resource and one `PATCH` per save; the PATCH carried one document whose marker tokens were `["A1"]`, length 208, sha256 equal to the sha256 of the file on disk.
- The classifier named all four stores as `A#1`, the sidecar `wordCount` 5 matched, the sidecar `updatedAt` equalled the PATCH response's `updatedAt`, the writing log held one entry `{added:1, deleted:0, net:1}` equal to the independently computed expected entry, the search for `A1` found the resource only after the save, and the verdict function returned PASS.
- The aborted GETs (`net::ERR_ABORTED`, numbers 23 to 27 on A and 20 to 24 on B) and the console message `Error fetching projects: TypeError: Failed to fetch` sit at the times of the harness's own `page.reload` marks (`pageReloadMarks`). The harness makes no claim about their cause. In later scenarios, console errors and failed requests within the reload window will be reported as such, with the mark's time, and not as notifications from the other client's save.
- Both pages logged a `visibilitychange` event to `hidden` at the start of each page load (`visibilityEvents`; no event to `visible` was logged). This is a raw observation about Playwright's headless context in this run; whether it differs in a headed browser was not tried. It matters for Task 5, which reads visibility events.
- Other raw facts recorded because the record prints everything: the sidecar `updatedAt` of the freshly created resource was `null`; B's editor still showed the base text after A's save (right after, and 30 s later) and showed A's text after its own reload. This is one repetition of a dry run with one save; it is NOT S1 and nothing is concluded from it.
- Not exercised by the dry run: a toast (`snapshotCreated` stayed false), a non-2xx save, a held request (see below), two documents in one store set, a non-canonical revision, an unparseable stored file.

### Hold/release hook check

`node scripts/hold-check.mjs 250`, OUTSIDE the sandbox, exit 0. Two clients on two DIFFERENT resources of one project (R1, R2), so this is not a two-clients-one-resource scenario and measures nothing about the product's save behaviour. Host to itself. Output of the run (verbatim, lines cut at 900 characters only where long; server port 62554, pid 18348):

```
HOLD/RELEASE HOOK CHECK: measures nothing about the product; two different resources; host to itself, not a second-device result
server port 62554 pid 18348; 7340 listeners before: none; 3000: none
typed concurrently; first-to-last key: A 138 ms, B 135 ms; last key times differ by 5 ms
both PATCHes held: A true, B true
PATCH answered while held (A,B): 0,0 (expected 0,0); footers: A "Saving…", B "Saving…"
asked release gap 250 ms (A then B; includes the setTimeout and the first release's own await); achieved gap between releaseT values 252.0 ms
after release: A saved true (Saved · just now), B saved true (Saved · just now)
  client A PATCH /api/resource/revision/R1 sendT(event)=2026-10-11T18:47:27.847Z releaseT=1791744449385.167 respAt=2026-10-11T18:47:29.398Z durMs(from release)=14 status=200 doc.markers=["A1"] doc.length=208
  client B PATCH /api/resource/revision/R2 sendT(event)=2026-10-11T18:47:27.851Z releaseT=1791744449637.203 respAt=2026-10-11T18:47:29.653Z durMs(from release)=16 status=200 doc.markers=["B1"] doc.length=208
  R1: content.bin (canonical): = A#1 ; content.tiptap.json: = A#1 ; content.txt: = A#1 ; sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:47:29.395Z ; stores agree on A#1
  R2: content.bin (canonical): = B#1 ; content.tiptap.json: = B#1 ; content.txt: = B#1 ; sidecar wordCount=5 matches B#1; updatedAt=2026-10-11T18:47:29.650Z ; stores agree on B#1
teardown: {"errors":[],"browserPidsRecorded":5,"browserPidsAliveAfterClose":[],"browserPidsAliveAfterTerm":[],"server":{"recorded":[{"pid":18348,"comm":"next-server (v16.2.6)"}],"stillAliveAfterTerm":[],"stillAliveAfterKill":[],"portListenersAfter":[],"listeners7340After":[],"listeners3000After":[]},"listeners7340After":[],"listeners3000After":[],"cleanup":{"removed":true,"path":"/private/tmp/getwrite-two-client/holdcheck-mv46dn46-1d7b9f"}}
at 2026-10-11T18:47:34.665Z
```

Read as: with both PATCHes held, nothing was answered in 1500 ms and both footers read `Saving…`; after the two releases 252.0 ms apart both saves answered 200 and each resource held exactly its own client's document. (`sendT(event)` shows the page's original send; `releaseT` is when the harness continued the request; `durMs` is measured from the release.)

### Discarded runs

- **Dry run 1** (`dry-run-1.out`, run id `dry-mv46a5x4-7bf5a1`), discarded. It reached the verdict and PASSed, but four harness faults were found in it and fixed: (1) the JSON writer refused it, because the snapshot summary used the key `content` for a store's hash (the guard names that key); the key is now `contentBin`; (2) the search for `A1` and `BASE` answered 404 for both, because the project was addressed by its directory name and the route wants the `id` inside `project.json`; the fixture now records both ids and search uses the manifest id; (3) toasts and alerts shown before the page reload were lost, because they were stored in the page's `window` and a reload makes a new window; they now flow to Node at once through an exposed binding; (4) the recorded "browser pids" included the transient `ps` process spawned by the pid walk itself; the walk now leaves it out. Nothing from dry run 1 is used anywhere.
- No other run was discarded. The hold check was run once.

### Process record

| Run | Server pid (next-server) | Chromium pids recorded | Port | Outcome at teardown |
|---|---|---|---|---|
| dry run 1 (discarded) | 12057 | 12087, 12088, 12089, 12139, 12141 (and the transient `ps` 12157, not a browser process) | 62349 | server pid and browser pids not alive after `close`; port free; folder removed |
| dry run 2 | 15827 | 15856, 15857, 15858, 15896, 15910 | 62466 | `stillAliveAfterTerm: []`, `browserPidsAliveAfterClose: []`, port listeners after: none, folder removed (`removed: true`) |
| hold check | 18348 | 5 recorded (pids in the run's own teardown line) | 62554 | same: none alive, port free, folder removed |

Before each run, 7340 and 3000 had no listener (recorded in the record's `preChecks`); after each run, none either. Nothing on 7340 or 3000 was touched. The three chosen ports were each free before start and free after. After all three runs: `ps` showed no `next-server`, `chrome-headless-shell` or `server.js` process; `lsof` showed no listener on 7340, 3000, 62349, 62466 or 62554; `/tmp/getwrite-two-client/` held only `logs/` (the three throwaway run folders were removed; the removal was confirmed by each run's `cleanup.removed: true`). The throwaway paths were asserted after `realpath` (`/private/tmp/getwrite-two-client/<run-id>`; `/tmp` is a symlink to `/private/tmp` on this machine). No file under `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite`, `~/Library/Logs/getwrite-electron` or the repo's `projects/` was read, listed or written.

### git status

`git status --short` after Task 2 (the two untracked directories are the whole change; no tracked file changed; nothing outside `specs/`):

```
?? specs/features/two-client-save-measurement/results/
?? specs/features/two-client-save-measurement/scripts/
```

(`experiments.md` itself shows as modified once this section is saved; it was committed at `9718807e`.)

### Not run / not varied

- Any scenario: S1 to S5 (Tasks 3 to 7) are not started. In particular no two clients saved to the same resource in any run here; the only save was one client's, in the dry run.
- Holding and releasing two PATCHes for the SAME resource (the S2 use of the hook). The hook was checked on two different resources only.
- Same-tick typing on two clients (G0): not tried; the achieved gap between two clients' saves is unknown until Task 7 measures it.
- The harness against a failed save (non-2xx), a snapshot toast, a held 404, or a store that really is a mix: only the self-check exercised the classifier on those shapes, with synthetic files.
- Comparing the diagnostics record to the stored plain text (the heuristics are not ported) and the mention index against mentions (the fixture declares no entity): the raw records are printed only.
- Firefox and Safari; a headed browser; a mobile browser; Node 22 or Node 20; the real desktop window as a client; an encrypted project.
- Wall-clock sleep or machine sleep detection (needed by Tasks 5 and 7): not built in this task; those tasks compare the clock gap between logged events.
- A second host: every request here was host to itself.
- The harness was not tested with the project type anything other than `blank`.

### Task 2 done-when, item by item

1. Section describes each module and states the properties: done above; each is shown by a printed record (server start/stop, pids and folders in the process record and `teardown` lines; pairing in `preChecks.clientsPaired`; real keystrokes in the dry run's steps and request log; request log fields in the tables; reader and classifier in the dry run and the self-check; quiet-wait in `quietWait`; expected derived forms labelled "read, not run").
2. Self-check output pasted, all required cases named correctly, PASS only for the two all-agree-with-last-processed cases (plus the reload-requirement variant constructed as PASS), FAIL for each of the others: done.
3. Dry run record pasted: done (run 2; run 1 discarded with reasons).
4. `node --check` on every script: passed (`lib/util.mjs`, `server.mjs`, `pairing.mjs`, `fixture.mjs`, `clients.mjs`, `stores.mjs`, `record.mjs`, `session.mjs`, `dry-run.mjs`, `hold-check.mjs`, `self-check.mjs`).
5. `git status --short` shows no change outside `specs/`: pasted above.

## S1 in turn

Task 3. Date 2026-10-11. Main checkout `/Users/jedaisaboteur/Repositories/getwrite`, branch `feat/two-client-save-measurement`, `git rev-parse --short HEAD` = `c5726668` (the new script `scripts/s1-in-turn.mjs` and `results/s1/` are new, uncommitted files under `specs/`). `node --version` = `v24.15.0` (no Node 22 or 20 run is claimed). Script: `scripts/s1-in-turn.mjs` (written in this task; it uses the Task 2 harness unchanged). Result JSON: `results/s1/s1r<n>-<run id>-rep0<n>.json` and `results/s1/summary-s1r1-mv46r43j-10e1dd.json`.

**Server (every repetition): the built standalone server** (`frontend/.next/standalone/frontend/server.js`, built at `812f2859` in Task 1, reused, `frontend/` unchanged so not rebuilt), sharing on, on a free port the script picked, one fresh server, one fresh project and one fresh resource per repetition. **Every request in this section is host to itself (the private LAN address of this machine), not a second-device result.** Both clients are headless Chromium (Playwright `chrome-headless-shell`), two separate paired browser contexts, real keystrokes into the TipTap editor.

### Where each thing ran

| What | Where |
|---|---|
| `node --check scripts/s1-in-turn.mjs` (first time), `pnpm knip` | inside the command sandbox |
| `node --check` (after the label fix below), the S1 runs (`node scripts/s1-in-turn.mjs 3`), the throwaway servers, Chromium, all `lsof`/`ps` checks | OUTSIDE the sandbox (`dangerouslyDisableSandbox`) |

Output of the kept run: `/tmp/getwrite-two-client/logs/s1-run2.out` (the full printed records, with the request logs as long JSON lines; the same data is in the JSON files). Server logs: `/tmp/getwrite-two-client/logs/s1r<n>-<run id>-server.log` (not read, not pasted).

### The sequence (as scripted, identical in all repetitions)

1. A and B each open the start page, open the project and select R; wait until the editor is visible and shows the base text; the footers are read (they read `All changes saved · not saved yet`).
2. **Step 1.** A: caret to end (`ControlOrMeta+End`), types ` A1` (40 ms per key), waits until a content save has been answered 2xx and the footer reads `Saved`. Then 5 s.
3. **Step 2.** B, NO reload: caret to end, types ` B1`, waits for saved. Then 5 s.
4. **Step 3.** A, NO reload: types ` A2`, waits for saved. Then 5 s.
5. Both editors are read 30 s after the step 3 acknowledgement (no reload); then both reload (page reload, project and resource opened again) and are read; the stores are read once more.

After each step the stores are read inside the 5 s wait: 3.5 s after the acknowledgement the quiet wait starts (no request in flight, then the digest of the resource's files, the sidecar, `meta/index/**` and `meta/writing-log/**` unchanged across two reads 1000 ms apart); the read ends about 4.5 s after the acknowledgement and the script sleeps out the rest of the 5 s. The next client's typing started 5007 to 5015 ms after the previous acknowledgement in every case (table below). The save itself is the client's own: it is sent about 2.46 s after the last keystroke (the client's debounce, read, not run: `useCanonicalAutosave.ts` 2500 ms; measured here as 2457 to 2463 ms from the last key to the PATCH send event, Playwright event times, not wire times) and the footer read `Saved · just now` 2527 to 2532 ms after the end of typing (the harness polls the footer every 100 ms).

Two limits of the sequence, stated before the results: (i) the next step is 5 s after the previous save, so the "after 30 s" reading of the spec (FR-3 b) can only be taken once, 30 s after the LAST save; for steps 1 and 2 the readings are "immediately" and "5 s later" (just before the next client typed). (ii) The "after reload" reading is taken once, at the end.

### Documents

Each client's document is what that client's editor held when it typed, held in memory by the harness: `A#1` = base + ` A1` (A's editor held only the base text); `B#1` = base + ` B1` (B's editor still held only the base text; see below); `A#2` = base + ` A1 A2` (A's editor held `A1` and not `B1`). The stores are classified against `base`, `A#1`, `B#1`, `A#2` as the clients actually sent them (byte-for-byte compare of `content.bin`; the derived forms of `content.tiptap.json` and `content.txt` are compared to the expected forms read from `syncDerivedResourceContent`, "read, not run", as in the Harness section).

### Pre-checks, processes and ports (per repetition)

Before each repetition: `lsof -nP -iTCP:7340 -sTCP:LISTEN` and `-iTCP:3000` printed nothing (recorded in each record's `preChecks.listeners7340` / `listeners3000` as `none`); the chosen port had no listener immediately before the start. Before the whole run `ps` showed no `next-server`, `chrome-headless-shell` or `s1-in-turn` process. Nothing on 7340 or 3000 was touched.

| Rep | Run id | Port | Server pid (`next-server (v16.2.6)`) | Chromium pids recorded | 7340 / 3000 / chosen port before | Teardown |
|---|---|---|---|---|---|---|
| 1 | `s1r1-mv46r43j-10e1dd` | 63287 | 42541 | 42570, 42571, 42572, 42610, 42624 | none / none / none | `stillAliveAfterTerm: []`, `browserPidsAliveAfterClose: []`, folder removed (`removed: true`), no listener on port, 7340, 3000 after |
| 2 | `s1r2-mv46senm-157411` | 63371 | 44766 | 44784, 44785, 44786, 44800, 44802 | none / none / none | same |
| 3 | `s1r3-mv46toyp-f90e33` | 63453 | 46871 | 46889, 46890, 46891, 46941, 46943 | none / none / none | same |

The throwaway root of each run was `/private/tmp/getwrite-two-client/<run id>` (asserted after `realpath`; `/tmp` is a symlink to `/private/tmp` on this machine). The server was stopped by its recorded pid (SIGTERM), Chromium's processes were confirmed gone after `browser.close()`, and each folder was removed with the removal confirmed by the script. After the runs: `ps` showed no `next-server`, `chrome-headless-shell` or `s1-in-turn` process; `lsof` showed no listener on 7340, 3000, or any of the six chosen ports (the three kept and the three discarded); `/tmp/getwrite-two-client/` held only `logs/`. No file under `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite`, `~/Library/Logs/getwrite-electron` or the repo's `projects/` was read, listed or written. No cookie, window secret, pairing code or credential was printed or recorded (the records hold `deviceCookiePresent: true` only).

### Discarded runs

- **First set of three repetitions** (output kept at `/tmp/getwrite-two-client/logs/s1-run1-DISCARDED.out`; run ids `s1r1-mv46mcu6-e01042` port 62954 pid 33817, `s1r2-mv46nnho-19315e` port 63055 pid 36316, `s1r3-mv46oxqi-dad750` port 63143 pid 38499; all three ended PASS with the same shape as the kept set; their teardown was clean and their result JSON files were deleted). DISCARDED for a harness fault found in the printed record: the step field `stateReadTookMs` was mislabelled. Its value is the time from the save acknowledgement to the end of the stores read (4530 to 4535 ms), not the duration of the read. The label was changed in `scripts/s1-in-turn.mjs` to `msFromSaveAckToEndOfStoresRead` and all three repetitions were run again. Nothing in the kept records or in this section comes from the discarded set. The discarded set's outcomes did not differ from the kept set's in any classification, verdict, document marker or writing-log entry (read from its printed output before it was discarded); that is stated so the discard is not read as hiding a different result.
- No other run was discarded. No repetition of the kept set had a harness error.

### Verdict per repetition (against the Task 1 definition; raw observation beside it)

"PASS" below is the harness's `verdict` function applied after the reload: all four stores hold exactly the last-processed save's whole document, parseable, the sidecar `updatedAt` is that save's response `updatedAt`, and both clients' text after reload equals that document's text.

| Rep | Verdict | Last processed (by `updatedAt`; arrival order and send order agree) | Raw observation |
|---|---|---|---|
| 1 | PASS | `A#2`, `updatedAt` `2026-10-11T18:58:14.267Z` (saves: `A#1` `18:57:58.865Z`, `B#1` `18:58:06.567Z`, `A#2`) | after the reload read: `content.bin` = `A#2`, `content.tiptap.json` = `A#2`, `content.txt` = `A#2`, sidecar `wordCount` 6, `updatedAt` = `A#2`'s; all four agree; both clients' text after reload `BASE alpha bravo charlie A1 A2` |
| 2 | PASS | `A#2`, `2026-10-11T18:59:14.276Z` (`A#1` `18:58:58.864Z`, `B#1` `18:59:06.571Z`) | same shape |
| 3 | PASS | `A#2`, `2026-10-11T19:00:14.167Z` (`A#1` `18:59:58.765Z`, `B#1` `19:00:06.460Z`) | same shape |

**Scenario S1 in turn: PASS, 3 of 3 repetitions, stable (every repetition agrees).** Conditions: two headless Chromium clients, host to itself, built standalone server, one plain project, one resource, short additions (one marker each), 5 s between a save and the next client's typing, B and A never reloading before the last read. **What 3 repetitions bound:** 3 clean repetitions bound the failure rate only very loosely (an exact one-sided 95% binomial bound is about 63%; the rule of three, 3/n, is not informative at n = 3). 20 clean repetitions would bound it at roughly 14%; neither is proof of zero. PASS here is the Task 1 definition applied to "the last-processed save's whole document is in every store"; it says nothing about the findings below, which are recorded without a verdict, and in particular it does not mean B's text survived (it did not; see (a) and (d)).

### Step-by-step server state (identical classification in all three repetitions; the per-repetition values are in the pasted records)

| After | `content.bin` (canonical `v-1`) | `content.tiptap.json` | `content.txt` | sidecar `wordCount` / `updatedAt` | All four agree | Revisions | Writing-log entries (actual; expected from the documents in processing order; match) | Search hits (A1 / A2 / B1 / BASE) |
|---|---|---|---|---|---|---|---|---|
| before any client opened R | = base | = base | = base | 4 / `null` | yes | `v-1` "Initial Draft", canonical | none; none; yes | 0 / 0 / 0 / 1 |
| step 1 (A saved ` A1`) | = `A#1` | = `A#1` | = `A#1` | 5 / `A#1`'s | yes | `v-1` only | `{added 1, deleted 0}`; same; yes | 1 / 0 / 0 / 1 |
| step 2 (B saved ` B1`) | = `B#1` | = `B#1` | = `B#1` | 5 / `B#1`'s | yes | `v-1` only, content = `B#1` | add `{added 1, deleted 1}`; same; yes | 0 / 0 / 1 / 1 |
| step 3 (A saved ` A2`) | = `A#2` | = `A#2` | = `A#2` | 6 / `A#2`'s | yes | `v-1` only, content = `A#2` | add `{added 2, deleted 1}`; same; yes | 1 / 1 / 0 / 1 |
| after the reload | = `A#2` | = `A#2` | = `A#2` | 6 / `A#2`'s | yes | unchanged | unchanged (3 entries); yes | 1 / 1 / 0 / 1 |

Word-bag explanation of the three writing-log entries (the rule read from `word-diff.ts`, "read, not run", applied by the harness to the documents in processing order): entry 1 added `A1`; entry 2 added `B1` and deleted `A1`; entry 3 added `A1` and `A2` and deleted `B1`. The actual entries equalled the independently computed ones in every step of every repetition. After each step and after the reload the quiet wait finished with `quiet: true` after 1002 to 1007 ms (2 reads); the initial read, before any client opened R, after 2007 to 2010 ms (4 reads).

Other raw facts, all three repetitions: only one revision directory (`v-1`) existed throughout; no `.tmp-*` entry was seen under `revisions/<R1>/`; no save answered with `snapshotCreated: true` and none carried a `writingLog` signal (all `snapshotCreated: false`, `writingLog: null`); the sidecar's `updatedAt` was `null` before the first save (fixture) and each later value equalled that save's response `updatedAt`; the sidecar `wordCount` equalled the word count of the stored document in every step; the mention index had no record for R (the fixture declares no entity) and the diagnostics record read `{dialogueRatio 0, averageSentenceLength 4 then 5, 5, 6, topRepeatedWords [], heuristicVersion 1}` (raw; not compared to the stored plain text by the harness).

### Each open editor (outcome 2), all three repetitions identical in text and footer wording

| Moment | A's editor text | A's footer (autosave label) | B's editor text | B's footer (autosave label) | Server holds |
|---|---|---|---|---|---|
| both open | `BASE alpha bravo charlie` | `All changes saved · not saved yet` | `BASE alpha bravo charlie` | `All changes saved · not saved yet` | base |
| step 1, right after A's save acknowledged | `BASE alpha bravo charlie A1` | `Saved · just now` | `BASE alpha bravo charlie` | `All changes saved · not saved yet` | `A#1` |
| step 1, +5 s (B's editor text at the moment B started typing) | `... A1` | `All changes saved · just now` | `BASE alpha bravo charlie` | `All changes saved · not saved yet` | `A#1` |
| step 2, right after B's save acknowledged | `... A1` | `All changes saved · just now` | `BASE alpha bravo charlie B1` | `Saved · just now` | `B#1` |
| step 2, +5 s (A's editor text at the moment A started typing) | `BASE alpha bravo charlie A1` | `All changes saved · just now` | `... B1` | `All changes saved · just now` | `B#1` |
| step 3, right after A's save acknowledged | `BASE alpha bravo charlie A1 A2` | `Saved · just now` | `BASE alpha bravo charlie B1` | `All changes saved · just now` | `A#2` |
| step 3, +5 s | `... A1 A2` | `All changes saved · just now` | `... B1` | `All changes saved · just now` | `A#2` |
| 30 s after step 3, no reload | `... A1 A2` | `All changes saved · 10s ago` | `BASE alpha bravo charlie B1` | `All changes saved · 19s ago` | `A#2` |
| after reload (both) | `BASE alpha bravo charlie A1 A2` | `All changes saved · not saved yet` | `BASE alpha bravo charlie A1 A2` | `All changes saved · not saved yet` | `A#2` |

Editor text compared with the stored document's text (the harness's `editorEqualsServerText`): after step 1, A equal and B not equal; after step 2, B equal and A not equal; after step 3 and at 30 s, A equal and B not equal; after reload both equal. B's open editor did NOT hold A's text before B typed: at the moment B started typing it read `BASE alpha bravo charlie` (A's ` A1` had been saved 5 s earlier). A's open editor did not hold B's text when it started typing: `BASE alpha bravo charlie A1`.

### Requests the pages made (outcome 3 and finding (b) input)

Read from the request logs pasted below. Per page, between its opening requests and its reload (the same in all three repetitions):

- A: 19 requests while opening (including `GET /api/resource/revision/R1`, number 19), then `PATCH` number 20 (step 1) and its follow-up `GET writing-log` and `GET diagnostics`, then `PATCH` number 23 (step 3) and its follow-ups, then nothing until the reload burst. The gaps with no request at all (previous request to next request): 3.69 to 3.71 s (open to the first PATCH send), 15.38 to 15.39 s (between the two PATCHes' follow-ups), and 30.13 to 30.14 s (last follow-up to the reload burst).
- B: 19 requests while opening (number 19 is the revision GET), then `PATCH` number 20 (step 2) and its two follow-ups (a writing-log GET and a diagnostics GET), then nothing until the reload burst. Gaps with no request: 10.33 to 10.34 s (revision GET to the PATCH), and 38.84 to 38.85 s (last follow-up to the reload burst).
- Neither page requested the resource's content (`GET /api/resource/revision/...`) again between its open and its reload: A's only revision GET is the one at open, B's likewise. (Observation; the reload, which fetches it again, is the only later one.)
- Total requests: A 49, B 46 in every repetition (49 and 46 include the reload burst).
- PATCH requests: A sent 2 (numbers 20 and 23), B sent 1 (number 20), every one carrying a document and answered 200; each was sent 2457 to 2463 ms after the end of the last keystroke of its typing; no PATCH was sent before a client's first typing, none during the 5 s and 30 s waits, none after a reload mark; every save carried exactly the markers of its client's editor (`A#1` `["A1"]`, `B#1` `["B1"]`, `A#2` `["A1","A2"]`).

### Notification surfaces (outcome 3), named

Surfaces checked: `role` `status`/`alert`/`alertdialog`/`dialog` elements added or changed (a MutationObserver, which includes any toast: the app's toast library renders such elements), JS dialogs, console errors and warnings, page errors, failed requests, non-2xx responses, the footer text (read at every moment in the table above) and the response `snapshotCreated`/`writingLog` fields. The window for each client starts at the first save acknowledgement by the other client (A: B's step 2; B: A's step 1) and ends after the reload read. Identical in all three repetitions apart from sub-millisecond-scale offsets (the three records are pasted):

- `role=status` elements: `Loading diagnostics…` at about +7.65 s after the window start (for A about 7.65 s after B's save, for B about 7.65 s after A's step 1 save) which in each case is the moment of that client's own next save's response (A: PATCH 23; B: PATCH 20) followed by its diagnostics GET (read from the request log: the GET is sent immediately after the PATCH response), i.e. the client's own save follow-up and not a message about the other client; and, at the reload, `Loading this document…` and `Loading diagnostics…` about 0.96 to 1.0 s after the reload mark. No toast text, no alert, no dialog, no page error, no JS dialog in any repetition.
- Console: at 49 to 72 ms after each page's reload mark, `Error fetching projects: TypeError: Failed to fetch` (error), at 75 to 103 ms `Failed to load resource: the server responded with a status of 404 (Not Found)` (error; the request log shows `GET /api/auth/get-session` answered 404 at 74 to 99 ms after the mark, and the same 404 for the same path also occurs at each page's first load before any save), and at about 930 to 995 ms two `[react-tooltip] Do not set `style.border`. Use `border` prop instead.` warnings. Nothing before the reload mark.
- Failed requests (`net::ERR_ABORTED`): five `GET`s (`/api/encryption`, `/api/version-check`, `/api/auth-status`, `/api/projects`, `/api/sharing/limits`) at 49 to 71 ms after each page's reload mark, i.e. the requests of the page that was being replaced; none before the reload mark. No non-2xx response other than the 404 above. These are reported relative to the reload marks as raw observations, with no cause named (Task 2 raw observation, reproduced: the dry run showed the same eight-line pattern at the reload).
- Visibility: each page logged a `visibilitychange` to `hidden` at its page load (first event, before any step) and two `hidden` events at 6 to 18 ms and 48 to 71 ms after its reload mark; no `visible` event was logged (Task 2 raw observation, reproduced; whether a headed browser differs was not tried).
- Footers: A's footer after B's save read `All changes saved · just now` (it did not change); B's footer after A's step 1 save read `All changes saved · not saved yet`. Neither footer ever showed a different wording.

### Outcome 4, the lost-update shape

- Step 2: B's editor held `BASE alpha bravo charlie` (no `A1`). B typed ` B1`; its only save carried the document with marker `B1` and not `A1`; after it, all four stores held `B#1`; `A1` was in no store (search for `A1`: 0 hits). B sent no PATCH before it typed (0 PATCHes before B's first typing). So the stale editor's save wrote its older-based copy over the newer text, after typing.
- Step 3: A's editor held `BASE alpha bravo charlie A1` (no `B1`). A typed ` A2`; its save carried `["A1","A2"]` and not `B1`; after it all four stores held `A#2`; `B1` was in no store (search for `B1`: 0 hits). A sent no PATCH between its step 1 save and the typing for step 3. So again after typing.
- Whether a stale editor's save without typing would overwrite: not exercised (no stale editor sent a save without typing: none sent any PATCH without typing, see (b)).

### Findings (a) to (g), raw observations, NO verdict

What was varied: nothing (one sequence, three repetitions). Held fixed: the sequence, 5 s gaps, short single-marker additions, base document, plain project, headless Chromium, host to itself.

- **(a) A stale editor replaced the other device's text on a keystroke.** Observed twice per repetition, 6 of 6 across the 3 repetitions: B's save (after typing ` B1`) left no `A1` in any store; A's step 3 save (after typing ` A2`) left no `B1` in any store. Each client's document was its editor's text plus its own typing; neither editor held the other's text when it typed (table above).
- **(b) A save sent with no typing.** None observed. The request logs show 3 PATCHes in total per repetition, each 2457 to 2463 ms after a typing action's last key, none before a first typing, none in the 5 s and 30 s waits, none after the reload mark; the windows with no request at all are listed above (up to 38.85 s on B's page, up to 30.14 s on A's). Not varied: focus changes, clicks without typing, scroll, visibility change (S4 does those).
- **(c) Whether the overwritten device was told anything.** In the three repetitions, on the surfaces named above, no surface changed in either page as a result of the other client's save: no toast, alert, dialog, page error, changed footer wording or console message before the reload. The only role=status elements and console messages in the window are the page's own follow-ups and the reload effects at the reload marks.
- **(d) Whether the overwritten text survives anywhere recoverable.** After step 2, `A1` was in no revision (only `v-1`, whose content was `B#1`), no resource file, no sidecar, no index record; the writing log holds counts, not text. A's open editor still held `A1`, and A's next save (step 3) carried it, so `A1` came back through A's own editor, not from the server. After step 3, `B1` was in no revision (only `v-1`, content `A#2`), no resource file, no sidecar, no index; B's open editor still held it until the reload, after which neither page showed it. **An overwrite that left no recoverable copy among the locations read: ` B1` (S1, all 3 repetitions).** Locations read: every `v-*` directory of the resource's revisions (one), `resources/<R1>/content.tiptap.json` and `content.txt`, the sidecar, `meta/index/mentions.json` and `diagnostics.json` records for R, the writing-log entries, search. Not looked at: `.trash`, browser storage and caches, the server's memory and logs. No "Auto-backup before large deletion" revision was created (the replaced texts differed by one word; S3's long variant is the one built to reach that condition).
- **(e) An overwritten editor keeps showing text the server no longer holds.** Observed in every repetition: after B's save, A's editor showed `...A1` (server `B#1`) right after, at +5 s, and until A's next save; after A's step 3 save, B's editor showed `...B1` (server `A#2`) right after, at +5 s, and at 30 s (footer `All changes saved · 19s ago`); both editors equalled the server text only after the reload. The harness's text comparison for the footer-visible state is in the tables above.
- **(f) The writing-log effect.** Three entries in each repetition, equal to the independently computed ones: `{added 1, deleted 0}` (A: `A1`), `{added 1, deleted 1}` (B: added `B1`, deleted `A1` — A's word counted as deleted by B's save), `{added 2, deleted 1}` (A: added `A1` and `A2`, deleted `B1` — A's step 3 save re-added `A1` and counted B's `B1` as deleted). Net sum over the three entries: +2, while the stored document ends 2 words longer than the base (`A1`, `A2`).
- **(g) A failed save on the device the writer believes is last.** None. Every save was answered 200 on both clients; `failedSavesA` and `failedSavesB` were empty in all three repetitions; the 404 "Revision <id> not found" response did not appear in any request log (pointer: Feature 77 FR-37 record and the lead's POS note of 2026-10-10; no cause stated).

### Hypotheses (labelled; none established by this task)

- Hypothesis: the reason neither open editor showed the other's saved text is that nothing in the page asks the server again after opening. Consistent with the request logs (no second `GET /api/resource/revision/...` between open and reload on either page) and with the code reading in the spec (`useRevisionContent.ts`'s effect keys, "read, not run"). The experiment that would discriminate it from "the page requested but did not apply the response" is the same request log with a request-level view of the response, and a trigger that does re-fetch (selecting another resource and back), which S1 did not do and no task of this feature is planned to.
- Hypothesis: the stale document in A's step 3 save is A's editor content only (not a merge). Consistent with the save carrying `["A1","A2"]` and no `B1` and the stores holding exactly that document; established for these three repetitions by the stores' content.
- Hypothesis: that sub-5-second gaps behave the same. Not tested here; S2 varies the gap.

### What was not exercised by this scenario

Roles reversed (B first); idle length (the waits are 5 s and 30 s); other documents (one short plain-text paragraph, one marker per save); client type (headless Chromium only); project type (plain `blank` only); Firefox and Safari; a headed browser; a mobile browser; a second host or device; an encrypted project; the lock-then-save 404 shape; overlapping or near-simultaneous saves (S2); a stale client that never reloads against a long addition (S3); a save with no typing, focus, visibility and scroll (S4); different resources (S5); Node 22 or 20.

### knip

`pnpm knip` (inside the sandbox) after this task: exit 1 as in the baseline; Unused files 78 (Task 2 left 77; the one new entry is `specs/features/two-client-save-measurement/scripts/s1-in-turn.mjs`). It is listed, not hidden. The other sections' counts were not re-compared by set in this task.

### Not run / not varied

- Everything under "What was not exercised by this scenario" above.
- Any repetition beyond the 3 per scenario; an S1 with a different gap, with the first saver being B, with an idle other than 5 s, or with reloads between steps.
- Comparing the diagnostics record to the stored plain text, and the mention index against mentions (as in the Harness section).
- The "after 30 s" reading of the spec for steps 1 and 2 (only after step 3).
- Task 5's visibility/focus/scroll touches; Task 4's long addition; Task 7's near-simultaneous saves.
- A phone, and any result from a second device.

### The pasted records

The three records below are the printed output of `node scripts/s1-in-turn.mjs 3` (run 2, the kept set; exit status 0), with exactly one change: the two request-log lines (`requestLogA`, `requestLogB`: one very long JSON line each in the printed output) are replaced by compact tables with the same data (identical to `extra.requestLogA`/`requestLogB` in the JSON). Every other line is verbatim. Each record ends with its "JSON written" line (the files are `results/s1/<run id>-rep0<n>.json`). The JSON files hold marker strings and hashes only (the record writer refuses document-like keys; a search of the three files for `getwrite_device`, `Cookie`, `secret`, `passphrase`, `pairing` found none beyond the key `deviceCookiePresent`).

```
RECORD scenario=s1 repetition=1 run=s1r1-mv46r43j-10e1dd commit=c5726668 node=v24.15.0
started 2026-10-11T18:57:52.019Z
server: built standalone server (frontend/.next/standalone/frontend/server.js), sharing on; port 63287; pid 42541; private LAN IPv4 of this host (host to itself, not a second-device result)
every result in this record: host to itself, not a second-device result. Times: Playwright event times on the host clock, not wire times.
note: S1 in turn, repetition 1 of 3. Measurement of the unchanged product. Fresh server, project and resource.
-- steps (time since record start) --
  [+    23 ms 2026-10-11T18:57:52.042Z] fixture created through POST /api/projects and POST /api/resource {"resourceLabel":"R1","baseContentChars":109}
  [+  2058 ms 2026-10-11T18:57:54.076Z] initial stores read before any client opened the resource {"classification":["content.bin (canonical): = base","content.tiptap.json: = base","content.txt: = base","sidecar wordCount=4 matches base; updatedAt=null","stores agree on base"]}
  [+  4217 ms 2026-10-11T18:57:56.236Z] both clients opened R in the real editor {"openA":{"openedInMs":1095},"openB":{"openedInMs":1060},"editors":{"at":"2026-10-11T18:57:56.232Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+  4221 ms 2026-10-11T18:57:56.239Z] step 1: A about to type ' A1' {"msSinceLastSaveAck":null,"editorsBeforeTyping":{"at":"2026-10-11T18:57:56.236Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+  6911 ms 2026-10-11T18:57:58.930Z] step 1: A typed ' A1' and save acknowledged {"typed":{"firstToLastMs":137,"delayMs":40},"editorAfterTyping":"BASE alpha bravo charlie A1","footerAfterTyping":{"full":"Words: 5 | Node: Body | Today's writing Today: 0 Autosave queued…","autosave":"Autosave queued…"},"saved":{"ok":true,"footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"},"savedSeenAt":1791745078924.7478,"waitedMs":2532},"editorsRightAfterSave":{"at":"2026-10-11T18:57:58.924Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+ 11912 ms 2026-10-11T18:58:03.931Z] step 1: 5000 ms after the save acknowledgement {"editorsAt5s":{"at":"2026-10-11T18:58:03.924Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"msFromSaveAckToEndOfStoresRead":4534}
  [+ 11916 ms 2026-10-11T18:58:03.935Z] step 2: B about to type ' B1' {"msSinceLastSaveAck":5007,"editorsBeforeTyping":{"at":"2026-10-11T18:58:03.931Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+ 14612 ms 2026-10-11T18:58:06.630Z] step 2: B typed ' B1' and save acknowledged {"typed":{"firstToLastMs":139,"delayMs":40},"editorAfterTyping":"BASE alpha bravo charlie B1","footerAfterTyping":{"full":"Words: 5 | Node: Body | Today's writing Today: 0 Autosave queued…","autosave":"Autosave queued…"},"saved":{"ok":true,"footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"},"savedSeenAt":1791745086625.4036,"waitedMs":2530},"editorsRightAfterSave":{"at":"2026-10-11T18:58:06.625Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}}}}
  [+ 19621 ms 2026-10-11T18:58:11.639Z] step 2: 5000 ms after the save acknowledgement {"editorsAt5s":{"at":"2026-10-11T18:58:11.625Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"msFromSaveAckToEndOfStoresRead":4532}
  [+ 19627 ms 2026-10-11T18:58:11.646Z] step 3: A about to type ' A2' {"msSinceLastSaveAck":5014,"editorsBeforeTyping":{"at":"2026-10-11T18:58:11.639Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}}}
  [+ 22316 ms 2026-10-11T18:58:14.335Z] step 3: A typed ' A2' and save acknowledged {"typed":{"firstToLastMs":140,"delayMs":40},"editorAfterTyping":"BASE alpha bravo charlie A1 A2","footerAfterTyping":{"full":"Words: 6 | Node: Body | Today's writing Today: 1 Autosave queued…","autosave":"Autosave queued…"},"saved":{"ok":true,"footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 Saved · just now","autosave":"Saved · just now"},"savedSeenAt":1791745094330.103,"waitedMs":2529},"editorsRightAfterSave":{"at":"2026-10-11T18:58:14.330Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}}}
  [+ 27326 ms 2026-10-11T18:58:19.344Z] step 3: 5000 ms after the save acknowledgement {"editorsAt5s":{"at":"2026-10-11T18:58:19.330Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"msFromSaveAckToEndOfStoresRead":4535}
  [+ 52327 ms 2026-10-11T18:58:44.346Z] 30 s after the last save acknowledgement, no reload (b) {"msSinceLastSaveAck":30016,"editors":{"at":"2026-10-11T18:58:44.331Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · 10s ago","autosave":"All changes saved · 10s ago"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · 19s ago","autosave":"All changes saved · 19s ago"}}}}
  [+ 54358 ms 2026-10-11T18:58:46.376Z] both reloaded (page reload, then reopen) (c) {"reloadA":{"openedInMs":966},"reloadB":{"openedInMs":956},"editors":{"at":"2026-10-11T18:58:46.372Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+ 55378 ms 2026-10-11T18:58:47.397Z] final stores read after reload {"classification":["content.bin (canonical): = A#2","content.tiptap.json: = A#2","content.txt: = A#2","sidecar wordCount=6 matches A#2; updatedAt=2026-10-11T18:58:14.267Z","stores agree on A#2"]}
-- Outcome 1, server state (four stores, classified) --
  onDiskNames: revisions/<R1>/v-N/content.bin (UTF-8 JSON text of the document the client sent) + metadata.json; resources/<R1>/content.tiptap.json; resources/<R1>/content.txt; meta/resource-<R1>.meta.json
  initial: {"quiet":{"quiet":true,"waitedMs":2010,"reads":4,"intervalMs":1000},"classification":["content.bin (canonical): = base","content.tiptap.json: = base","content.txt: = base","sidecar wordCount=4 matches base; updatedAt=null","stores agree on base"],"allFourAgree":true,"heldLabels":["base"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:57:52.041Z","savedAt":"2026-10-11T18:57:52.041Z","hasId":true,"contentBin":{"bytes":109,"sha256":"2642f35db296aa8e807fcee83ca02fcc876fee0e6793a3726c3993d2481fabe1"},"contentEquals":["base"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["base"],"sha256":"2642f35db296aa8e807fcee83ca02fcc876fee0e6793a3726c3993d2481fabe1","bytes":109}],"sidecar":{"parsed":true,"wordCount":4,"updatedAt":null,"name":"Doc s1r1-mv46r43j-10e1dd","keys":["createdAt","folderId","id","name","orderIndex","slug","type","userMetadata","wordCount"]},"wordCountMatchesDocs":["base"],"expectedWordCounts":{"base":4},"contentTiptapJson":{"bytes":196,"sha256":"abbba3532944c6ba49bd92919009b6651571e83e8ed732ff2637c5cbbfd11440"},"contentTxt":{"bytes":24,"sha256":"ef6459dadd84634b16c4730ac335cac361447c798f9d37ec6a2956834a91f04b"},"lastProcessed":{"determined":false,"reason":"no successful save"},"evidence":{},"writingLogActual":[],"writingLogEntryTimestamps":[],"writingLogExpected":[],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[],"search":{"A1":{"status":200,"count":0,"resourceIds":[]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":4,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"UNSTABLE","reasons":["order not determined: no successful save; stores agree on base"],"flags":{"reloadChecked":false}}}
  afterStep1: {"quiet":{"quiet":true,"waitedMs":1004,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = A#1","content.tiptap.json: = A#1","content.txt: = A#1","sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:57:58.865Z","stores agree on A#1"],"allFourAgree":true,"heldLabels":["A#1"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:57:52.041Z","savedAt":"2026-10-11T18:57:52.041Z","hasId":true,"contentBin":{"bytes":208,"sha256":"be86ffd83aba39563803f836d248be5840c6ade99ef8dd75cdea5cc5c6ce973a"},"contentEquals":["A#1"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#1"],"sha256":"be86ffd83aba39563803f836d248be5840c6ade99ef8dd75cdea5cc5c6ce973a","bytes":208}],"sidecar":{"parsed":true,"wordCount":5,"updatedAt":"2026-10-11T18:57:58.865Z","name":"Doc s1r1-mv46r43j-10e1dd","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#1"],"expectedWordCounts":{"base":4,"A#1":5},"contentTiptapJson":{"bytes":340,"sha256":"9df57a685e604b778427a32d260a43538b3b54b577cefdaa4c85c4eab0e0ad01"},"contentTxt":{"bytes":27,"sha256":"b71058e96e11f9980d6864dee1034be30d4b5eeff7b4beaf07b45a678e0215f0"},"lastProcessed":{"docLabel":"A#1","updatedAt":"2026-10-11T18:57:58.865Z"},"evidence":{"byUpdatedAt":["A20"],"byResponseArrival":["A20"],"bySend":["A20"],"updatedAtValues":["2026-10-11T18:57:58.865Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1}],"writingLogEntryTimestamps":["2026-10-11T18:57:58.861Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold A#1, the last processed save"],"flags":{"reloadChecked":false}}}
  afterStep2: {"quiet":{"quiet":true,"waitedMs":1005,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = B#1","content.tiptap.json: = B#1","content.txt: = B#1","sidecar wordCount=5 matches A#1/B#1; updatedAt=2026-10-11T18:58:06.567Z","stores agree on B#1"],"allFourAgree":true,"heldLabels":["B#1"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:57:52.041Z","savedAt":"2026-10-11T18:57:52.041Z","hasId":true,"contentBin":{"bytes":208,"sha256":"158e85b727ace080c0fc92ef8f83a860760ae79d2a2e9cd95ca33d7ac8151708"},"contentEquals":["B#1"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["B#1"],"sha256":"158e85b727ace080c0fc92ef8f83a860760ae79d2a2e9cd95ca33d7ac8151708","bytes":208}],"sidecar":{"parsed":true,"wordCount":5,"updatedAt":"2026-10-11T18:58:06.567Z","name":"Doc s1r1-mv46r43j-10e1dd","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#1","B#1"],"expectedWordCounts":{"base":4,"A#1":5,"B#1":5},"contentTiptapJson":{"bytes":340,"sha256":"7ea0c4ceab56e4f67f10bdaa6c5c18e8c55594532cf60c5587cf97ea7a63aa41"},"contentTxt":{"bytes":27,"sha256":"b310b25e52eca6b0a1f1c6b974fc82e599d6910188f345b730bc8630dbf9a915"},"lastProcessed":{"docLabel":"B#1","updatedAt":"2026-10-11T18:58:06.567Z"},"evidence":{"byUpdatedAt":["A20","B20"],"byResponseArrival":["A20","B20"],"bySend":["A20","B20"],"updatedAtValues":["2026-10-11T18:57:58.865Z","2026-10-11T18:58:06.567Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogEntryTimestamps":["2026-10-11T18:57:58.861Z","2026-10-11T18:58:06.565Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]}],"search":{"A1":{"status":200,"count":0,"resourceIds":[]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"BASE":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold B#1, the last processed save"],"flags":{"reloadChecked":false}}}
  afterStep3: {"quiet":{"quiet":true,"waitedMs":1006,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = A#2","content.tiptap.json: = A#2","content.txt: = A#2","sidecar wordCount=6 matches A#2; updatedAt=2026-10-11T18:58:14.267Z","stores agree on A#2"],"allFourAgree":true,"heldLabels":["A#2"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:57:52.041Z","savedAt":"2026-10-11T18:57:52.041Z","hasId":true,"contentBin":{"bytes":211,"sha256":"866200bf472ade0362d0727de8b1a01dbc109df558b02d8ab95537250de4c761"},"contentEquals":["A#2"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"866200bf472ade0362d0727de8b1a01dbc109df558b02d8ab95537250de4c761","bytes":211}],"sidecar":{"parsed":true,"wordCount":6,"updatedAt":"2026-10-11T18:58:14.267Z","name":"Doc s1r1-mv46r43j-10e1dd","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#2"],"expectedWordCounts":{"base":4,"A#1":5,"A#2":6,"B#1":5},"contentTiptapJson":{"bytes":343,"sha256":"0a124c031ae208519464bf3470bfc327d7da49bcd8c6e2f84996ffb88878e7b1"},"contentTxt":{"bytes":30,"sha256":"d6bad937ce3eb595d64cc1b56e8ca149e063e1d62c010cda2038c7784502ce29"},"lastProcessed":{"docLabel":"A#2","updatedAt":"2026-10-11T18:58:14.267Z"},"evidence":{"byUpdatedAt":["A20","B20","A23"],"byResponseArrival":["A20","B20","A23"],"bySend":["A20","B20","A23"],"updatedAtValues":["2026-10-11T18:57:58.865Z","2026-10-11T18:58:06.567Z","2026-10-11T18:58:14.267Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogEntryTimestamps":["2026-10-11T18:57:58.861Z","2026-10-11T18:58:06.565Z","2026-10-11T18:58:14.266Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"A2":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold A#2, the last processed save"],"flags":{"reloadChecked":false}}}
  afterReload: {"quiet":{"quiet":true,"waitedMs":1002,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = A#2","content.tiptap.json: = A#2","content.txt: = A#2","sidecar wordCount=6 matches A#2; updatedAt=2026-10-11T18:58:14.267Z","stores agree on A#2"],"allFourAgree":true,"heldLabels":["A#2"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:57:52.041Z","savedAt":"2026-10-11T18:57:52.041Z","hasId":true,"contentBin":{"bytes":211,"sha256":"866200bf472ade0362d0727de8b1a01dbc109df558b02d8ab95537250de4c761"},"contentEquals":["A#2"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"866200bf472ade0362d0727de8b1a01dbc109df558b02d8ab95537250de4c761","bytes":211}],"sidecar":{"parsed":true,"wordCount":6,"updatedAt":"2026-10-11T18:58:14.267Z","name":"Doc s1r1-mv46r43j-10e1dd","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#2"],"expectedWordCounts":{"base":4,"A#1":5,"A#2":6,"B#1":5},"contentTiptapJson":{"bytes":343,"sha256":"0a124c031ae208519464bf3470bfc327d7da49bcd8c6e2f84996ffb88878e7b1"},"contentTxt":{"bytes":30,"sha256":"d6bad937ce3eb595d64cc1b56e8ca149e063e1d62c010cda2038c7784502ce29"},"lastProcessed":{"docLabel":"A#2","updatedAt":"2026-10-11T18:58:14.267Z"},"evidence":{"byUpdatedAt":["A20","B20","A23"],"byResponseArrival":["A20","B20","A23"],"bySend":["A20","B20","A23"],"updatedAtValues":["2026-10-11T18:57:58.865Z","2026-10-11T18:58:06.567Z","2026-10-11T18:58:14.267Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogEntryTimestamps":["2026-10-11T18:57:58.861Z","2026-10-11T18:58:06.565Z","2026-10-11T18:58:14.266Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"A2":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold A#2, the last processed save"],"flags":{"reloadChecked":false}}}
-- Outcome 2, each open editor (text and footer: (a) right after the other client's save was acknowledged, (b) after 30 s, (c) after reload) --
  note: (a) immediately after the other client's save was acknowledged; (5 s) just before the next client typed; (b) 30 s after the LAST save only (the sequence puts the next step at 5 s, so a 30 s read per step is not possible); (c) after reload.
  step0_bothOpen: {"at":"2026-10-11T18:57:56.232Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}
  step1: {"editorsBeforeTyping":{"at":"2026-10-11T18:57:56.236Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"editorsRightAfterSave":{"at":"2026-10-11T18:57:58.924Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"editorsAt5s":{"at":"2026-10-11T18:58:03.924Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"vsServerRightAfter":{"serverHolds":["A#1"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false}}
  step2: {"editorsBeforeTyping":{"at":"2026-10-11T18:58:03.931Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"editorsRightAfterSave":{"at":"2026-10-11T18:58:06.625Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}}},"editorsAt5s":{"at":"2026-10-11T18:58:11.625Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"vsServerAt5s":{"serverHolds":["B#1"],"A_editorEqualsServerText":false,"B_editorEqualsServerText":true}}
  step3: {"editorsBeforeTyping":{"at":"2026-10-11T18:58:11.639Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"editorsRightAfterSave":{"at":"2026-10-11T18:58:14.330Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"editorsAt5s":{"at":"2026-10-11T18:58:19.330Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"vsServerAt5s":{"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false}}
  at30sAfterLastSave_noReload: {"at":"2026-10-11T18:58:44.331Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · 10s ago","autosave":"All changes saved · 10s ago"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · 19s ago","autosave":"All changes saved · 19s ago"}}}
  vsServerAt30s: {"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false}
  afterReload: {"at":"2026-10-11T18:58:46.372Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}
  vsServerAfterReload: {"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":true}
-- Outcome 3, notification (surfaces checked are named) --
  A_sinceBsFirstSave: {"sinceAt":"2026-10-11T18:58:06.625Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7654,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":38715,"msAfterReloadMark":994},{"role":"status","text":"Loading diagnostics…","msAfterSince":38715,"msAfterReloadMark":994}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":37792,"msAfterReloadMark":71},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":37822,"msAfterReloadMark":101},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38678,"msAfterReloadMark":958},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38713,"msAfterReloadMark":992}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":37790,"msAfterReloadMark":69},{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":37790,"msAfterReloadMark":69},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":37789,"msAfterReloadMark":69},{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":37790,"msAfterReloadMark":69},{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":37790,"msAfterReloadMark":69}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":37818,"msAfterReloadMark":97}],"patchResponseSignals":[{"n":23,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T18:58:44.346Z","msAfterSince":37721}]}
  B_sinceAsFirstSave: {"sinceAt":"2026-10-11T18:57:58.924Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7655,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":47415,"msAfterReloadMark":967},{"role":"status","text":"Loading diagnostics…","msAfterSince":47415,"msAfterReloadMark":967}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":46499,"msAfterReloadMark":51},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":46528,"msAfterReloadMark":79},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47382,"msAfterReloadMark":934},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47413,"msAfterReloadMark":965}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":46498,"msAfterReloadMark":50},{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":46498,"msAfterReloadMark":50},{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":46498,"msAfterReloadMark":50},{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":46498,"msAfterReloadMark":50},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":46498,"msAfterReloadMark":50}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":46524,"msAfterReloadMark":75}],"patchResponseSignals":[{"n":20,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T18:58:45.373Z","msAfterSince":46448}]}
-- Outcome 4, lost-update shape (did a stale editor's save write its older copy over newer text, and only after typing) --
  note: established from outcome 1 (which document each store held after the step) and the PATCH log (markers in each sent document)
  step2_B_stale_saved: {"documentSentByB":[{"markers":["B1"],"baseWordsPresent":true}],"markersHeldByEachDocument":{"A#1":["A1"],"B#1":["B1"]},"storesHeldAfterStep2":["B#1"],"patchesBByBeforeTypingInStep2":0,"BsEditorTextAtTypingStart":"BASE alpha bravo charlie","BsEditorHeldAsText_A1":false}
  step3_A_stale_saved: {"documentSentByA":[{"markers":["A1","A2"],"baseWordsPresent":true}],"markersHeldByEachDocument":{"A#1":["A1"],"B#1":["B1"],"A#2":["A1","A2"]},"storesHeldAfterStep3":["A#2"],"patchesAByBeforeTypingInStep3":0,"AsEditorTextAtTypingStart":"BASE alpha bravo charlie A1","AsEditorHeldAsText_B1":false}
  everyPatchSentByA: [{"n":20,"sendAt":"2026-10-11T18:57:58.851Z","status":200,"hasDocument":true,"markers":["A1"],"note":null,"msAfterLastTypingEnd":2462,"lastTypingMarker":" A1","afterAReloadMark":false},{"n":23,"sendAt":"2026-10-11T18:58:14.257Z","status":200,"hasDocument":true,"markers":["A1","A2"],"note":null,"msAfterLastTypingEnd":2460,"lastTypingMarker":" A2","afterAReloadMark":false}]
  everyPatchSentByB: [{"n":20,"sendAt":"2026-10-11T18:58:06.555Z","status":200,"hasDocument":true,"markers":["B1"],"note":null,"msAfterLastTypingEnd":2463,"lastTypingMarker":" B1","afterAReloadMark":false}]
-- Outcome 5, side effects (revisions, writing log vs expected, search, wordCount, indexes) --
  afterStep1: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#1"],"sha256":"be86ffd83aba39563803f836d248be5840c6ade99ef8dd75cdea5cc5c6ce973a","bytes":208}],"writingLogActual":[{"added":1,"deleted":0,"net":1}],"writingLogExpected":[{"added":1,"deleted":0,"net":1}],"writingLogMatchesExpected":true,"tokens":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]}},"sidecarWordCount":5,"expectedWordCounts":{"base":4,"A#1":5},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}}}
  afterStep2: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["B#1"],"sha256":"158e85b727ace080c0fc92ef8f83a860760ae79d2a2e9cd95ca33d7ac8151708","bytes":208}],"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogMatchesExpected":true,"tokens":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]}],"search":{"A1":{"status":200,"count":0,"resourceIds":[]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"BASE":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]}},"sidecarWordCount":5,"expectedWordCounts":{"base":4,"A#1":5,"B#1":5},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}}}
  afterStep3: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"866200bf472ade0362d0727de8b1a01dbc109df558b02d8ab95537250de4c761","bytes":211}],"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"tokens":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"A2":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]}},"sidecarWordCount":6,"expectedWordCounts":{"base":4,"A#1":5,"A#2":6,"B#1":5},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}}}
  afterReload: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"866200bf472ade0362d0727de8b1a01dbc109df558b02d8ab95537250de4c761","bytes":211}],"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"search":{"A1":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"A2":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["13e664bb-e4c6-4a6e-9255-938a4aa4a681"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}}}
  indexesComparedToPlainText: not compared by the harness (diagnostics heuristics are TypeScript and not ported; the fixture declares no entity so the mention index holds no record); raw records are printed
-- Outcome 6, failed saves (non-2xx: status and truncated body; what the client showed) --
  failedSavesA: []
  failedSavesB: []
  result: no failed save
-- verdict inputs --
  {"saves":[{"id":"A20","docLabel":"A#1","updatedAt":"2026-10-11T18:57:58.865Z","sendT":1791745078851.8882,"respT":1791745078868.6},{"id":"A23","docLabel":"A#2","updatedAt":"2026-10-11T18:58:14.267Z","sendT":1791745094257.4966,"respT":1791745094270.9954},{"id":"B20","docLabel":"B#1","updatedAt":"2026-10-11T18:58:06.567Z","sendT":1791745086555.186,"respT":1791745086570.9248}],"lastProcessed":{"docLabel":"A#2","updatedAt":"2026-10-11T18:58:14.267Z"},"evidence":{"byUpdatedAt":["A20","B20","A23"],"byResponseArrival":["A20","B20","A23"],"bySend":["A20","B20","A23"],"updatedAtValues":["2026-10-11T18:57:58.865Z","2026-10-11T18:58:06.567Z","2026-10-11T18:58:14.267Z"]},"sendOrderAgreesWithUpdatedAt":true,"documentHashes":{"base":"2642f35db296aa8e807fcee83ca02fcc876fee0e6793a3726c3993d2481fabe1","A#1":"be86ffd83aba39563803f836d248be5840c6ade99ef8dd75cdea5cc5c6ce973a","A#2":"866200bf472ade0362d0727de8b1a01dbc109df558b02d8ab95537250de4c761","B#1":"158e85b727ace080c0fc92ef8f83a860760ae79d2a2e9cd95ca33d7ac8151708"},"requireReload":true,"reloadTexts":{"A":"BASE alpha bravo charlie A1 A2","B":"BASE alpha bravo charlie A1 A2"}}
-- verdict (against the Task 1 definition) --
  {"verdict":"PASS","reasons":["all four stores hold A#2, the last processed save"],"flags":{"reloadChecked":true}}
-- findings, raw observations, NO verdict --
  a_stale_editor_replaced_other_text_on_a_keystroke: {"step2_B":{"storesHeldAfter":["B#1"],"BsDocumentMarkers":[["B1"]],"A1_in_BsDocument":false,"A1_in_serverPlainAfterStep2":false},"step3_A":{"storesHeldAfter":["A#2"],"AsDocumentMarkers":[["A1","A2"]],"B1_in_AsDocument":false,"B1_in_serverPlainAfterStep3":false},"varied":"nothing (in turn, 5 s gaps, short additions)"}
  b_saves_sent_with_no_typing: {"patchesA":[{"n":20,"hasDocument":true,"markers":["A1"],"msAfterLastTypingEnd":2462,"afterAReloadMark":false},{"n":23,"hasDocument":true,"markers":["A1","A2"],"msAfterLastTypingEnd":2460,"afterAReloadMark":false}],"patchesB":[{"n":20,"hasDocument":true,"markers":["B1"],"msAfterLastTypingEnd":2463,"afterAReloadMark":false}],"typingActions":{"A":[" A1"," A2"],"B":[" B1"]},"patchesBeforeFirstTyping":{"A":0,"B":0},"idleApiRequestsNote":"see requestLogA / requestLogB in extra facts for every request"}
  c_overwritten_device_told_anything: {"B_overwrittenAtStep3":{"sinceAt":"2026-10-11T18:57:58.924Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7655,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":47415,"msAfterReloadMark":967},{"role":"status","text":"Loading diagnostics…","msAfterSince":47415,"msAfterReloadMark":967}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":46499,"msAfterReloadMark":51},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":46528,"msAfterReloadMark":79},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47382,"msAfterReloadMark":934},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47413,"msAfterReloadMark":965}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":46498,"msAfterReloadMark":50},{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":46498,"msAfterReloadMark":50},{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":46498,"msAfterReloadMark":50},{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":46498,"msAfterReloadMark":50},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":46498,"msAfterReloadMark":50}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":46524,"msAfterReloadMark":75}],"patchResponseSignals":[{"n":20,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T18:58:45.373Z","msAfterSince":46448}]},"A_overwrittenAtStep2":{"sinceAt":"2026-10-11T18:58:06.625Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7654,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":38715,"msAfterReloadMark":994},{"role":"status","text":"Loading diagnostics…","msAfterSince":38715,"msAfterReloadMark":994}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":37792,"msAfterReloadMark":71},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":37822,"msAfterReloadMark":101},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38678,"msAfterReloadMark":958},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38713,"msAfterReloadMark":992}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":37790,"msAfterReloadMark":69},{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":37790,"msAfterReloadMark":69},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":37789,"msAfterReloadMark":69},{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":37790,"msAfterReloadMark":69},{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":37790,"msAfterReloadMark":69}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":37818,"msAfterReloadMark":97}],"patchResponseSignals":[{"n":23,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T18:58:44.346Z","msAfterSince":37721}]},"note":"full lists are in outcome 3; surfaces named there"}
  d_overwritten_text_recoverable: {"afterStep2":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["B#1"],"sha256":"158e85b727ace080c0fc92ef8f83a860760ae79d2a2e9cd95ca33d7ac8151708","bytes":208}],"afterStep3":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"866200bf472ade0362d0727de8b1a01dbc109df558b02d8ab95537250de4c761","bytes":211}],"afterReload":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"866200bf472ade0362d0727de8b1a01dbc109df558b02d8ab95537250de4c761","bytes":211}],"revisionDirListingAfterReload":[{"dir":"v-1","name":"Initial Draft","automaticSnapshot":false,"isCanonical":true,"contentEquals":["A#2"]}]}
  e_overwritten_editor_shows_text_the_server_no_longer_holds: {"afterStep2_A_editor":false,"A_editorTextAfterStep2":"BASE alpha bravo charlie A1","afterStep3_B_editor":false,"B_editorTextAfterStep3":"BASE alpha bravo charlie B1","at30s_noReload":{"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false},"afterReload":{"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":true}}
  f_writing_log_effect: {"actualAfterStep3":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"expectedAfterStep3":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"tokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"matchesExpected":true}
  g_failed_save_on_the_device_the_writer_believes_is_last: {"failedSavesA":[],"failedSavesB":[],"result":"none"}
-- extra facts --
  preChecks: {"listeners7340":"none","listeners3000":"none","chosenPort":63287,"chosenPortListenersBeforeStart":"none (checked immediately before start)","serverPidsRecorded":[{"pid":42541,"comm":"next-server (v16.2.6)"}],"browserPidsRecorded":[{"pid":42570,"comm":"chrome-headless-shell"},{"pid":42571,"comm":"chrome-headless-shell"},{"pid":42572,"comm":"chrome-headless-shell"},{"pid":42610,"comm":"chrome-headless-shell"},{"pid":42624,"comm":"chrome-headless-shell"}],"clientsPaired":{"A":{"paired":true,"deviceCookiePresent":true},"B":{"paired":true,"deviceCookiePresent":true}},"throwawayRootAsserted":"/private/tmp/getwrite-two-client/s1r1-mv46r43j-10e1dd"}
requestLogA
  #1 GET /api/auth/get-session send 18:57:54.177Z resp 18:57:54.189Z 404
  #2 GET /api/encryption send 18:57:54.189Z resp 18:57:54.191Z 200
  #3 GET /api/version-check send 18:57:54.189Z resp 18:57:54.193Z 200
  #4 GET /api/auth-status send 18:57:54.189Z resp 18:57:54.193Z 200
  #5 GET /api/projects send 18:57:54.189Z resp 18:57:54.195Z 200
  #6 GET /api/sharing/limits send 18:57:54.189Z resp 18:57:54.195Z 200
  #7 POST /api/project send 18:57:55.036Z resp 18:57:55.043Z 200
  #8 GET /api/project/PRJ/entity-alias-table send 18:57:55.054Z resp 18:57:55.094Z 200
  #9 GET /api/project/PRJ/entity-alias-table send 18:57:55.070Z resp 18:57:55.096Z 200
  #10 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:57:55.070Z resp 18:57:55.096Z 200
  #11 POST /api/project/tags send 18:57:55.070Z resp 18:57:55.097Z 200
  #12 POST /api/project/query/saved send 18:57:55.070Z resp 18:57:55.097Z 200
  #13 POST /api/project-resources send 18:57:55.124Z resp 18:57:55.133Z 200
  #14 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:57:55.124Z resp 18:57:55.132Z 200
  #15 POST /api/project-resources send 18:57:55.124Z resp 18:57:55.134Z 200
  #16 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:57:55.124Z resp 18:57:55.134Z 200
  #17 POST /api/project/tags send 18:57:55.124Z resp 18:57:55.132Z 200
  #18 POST /api/project/tags send 18:57:55.124Z resp 18:57:55.132Z 200
  #19 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:57:55.134Z resp 18:57:55.160Z 200
  #20 PATCH /api/resource/revision/R1 send 18:57:58.851Z resp 18:57:58.868Z 200 updatedAt=2026-10-11T18:57:58.865Z snapshotCreated=False writingLog=null doc{len=208,sha256=be86ffd83aba39563803f836d248be5840c6ade99ef8dd75cdea5cc5c6ce973a,markers=["A1"]}
  #21 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:57:58.874Z resp 18:57:58.879Z 200
  #22 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:57:58.874Z resp 18:57:58.879Z 200
  #23 PATCH /api/resource/revision/R1 send 18:58:14.257Z resp 18:58:14.270Z 200 updatedAt=2026-10-11T18:58:14.267Z snapshotCreated=False writingLog=null doc{len=211,sha256=866200bf472ade0362d0727de8b1a01dbc109df558b02d8ab95537250de4c761,markers=["A1", "A2"]}
  #24 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:58:14.275Z resp 18:58:14.281Z 200
  #25 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:58:14.275Z resp 18:58:14.281Z 200
  #26 GET /api/encryption send 18:58:44.414Z resp  - null net::ERR_ABORTED
  #27 GET /api/version-check send 18:58:44.414Z resp  - null net::ERR_ABORTED
  #28 GET /api/auth-status send 18:58:44.414Z resp  - null net::ERR_ABORTED
  #29 GET /api/projects send 18:58:44.415Z resp  - null net::ERR_ABORTED
  #30 GET /api/sharing/limits send 18:58:44.415Z resp  - null net::ERR_ABORTED
  #31 GET /api/encryption send 18:58:44.441Z resp 18:58:44.444Z 200
  #32 GET /api/version-check send 18:58:44.441Z resp 18:58:44.445Z 200
  #33 GET /api/auth-status send 18:58:44.441Z resp 18:58:44.446Z 200
  #34 GET /api/projects send 18:58:44.441Z resp 18:58:44.448Z 200
  #35 GET /api/sharing/limits send 18:58:44.441Z resp 18:58:44.447Z 200
  #36 GET /api/auth/get-session send 18:58:44.443Z resp 18:58:44.447Z 404
  #37 POST /api/project send 18:58:45.291Z resp 18:58:45.297Z 200
  #38 GET /api/project/PRJ/entity-alias-table send 18:58:45.303Z resp 18:58:45.312Z 200
  #39 GET /api/project/PRJ/entity-alias-table send 18:58:45.311Z resp 18:58:45.318Z 200
  #40 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:58:45.311Z resp 18:58:45.318Z 200
  #41 POST /api/project/tags send 18:58:45.311Z resp 18:58:45.318Z 200
  #42 POST /api/project/query/saved send 18:58:45.311Z resp 18:58:45.315Z 200
  #43 POST /api/project-resources send 18:58:45.341Z resp 18:58:45.351Z 200
  #44 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:58:45.341Z resp 18:58:45.350Z 200
  #45 POST /api/project-resources send 18:58:45.341Z resp 18:58:45.351Z 200
  #46 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:58:45.341Z resp 18:58:45.351Z 200
  #47 POST /api/project/tags send 18:58:45.341Z resp 18:58:45.349Z 200
  #48 POST /api/project/tags send 18:58:45.341Z resp 18:58:45.350Z 200
  #49 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:58:45.352Z resp 18:58:45.367Z 200
requestLogB
  #1 GET /api/auth/get-session send 18:57:55.258Z resp 18:57:55.271Z 404
  #2 GET /api/encryption send 18:57:55.271Z resp 18:57:55.273Z 200
  #3 GET /api/version-check send 18:57:55.271Z resp 18:57:55.275Z 200
  #4 GET /api/auth-status send 18:57:55.271Z resp 18:57:55.275Z 200
  #5 GET /api/projects send 18:57:55.271Z resp 18:57:55.277Z 200
  #6 GET /api/sharing/limits send 18:57:55.271Z resp 18:57:55.275Z 200
  #7 POST /api/project send 18:57:56.108Z resp 18:57:56.112Z 200
  #8 GET /api/project/PRJ/entity-alias-table send 18:57:56.120Z resp 18:57:56.157Z 200
  #9 GET /api/project/PRJ/entity-alias-table send 18:57:56.134Z resp 18:57:56.159Z 200
  #10 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:57:56.134Z resp 18:57:56.159Z 200
  #11 POST /api/project/tags send 18:57:56.134Z resp 18:57:56.159Z 200
  #12 POST /api/project/query/saved send 18:57:56.134Z resp 18:57:56.159Z 200
  #13 POST /api/project-resources send 18:57:56.188Z resp 18:57:56.196Z 200
  #14 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:57:56.188Z resp 18:57:56.195Z 200
  #15 POST /api/project-resources send 18:57:56.188Z resp 18:57:56.197Z 200
  #16 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:57:56.188Z resp 18:57:56.196Z 200
  #17 POST /api/project/tags send 18:57:56.188Z resp 18:57:56.195Z 200
  #18 POST /api/project/tags send 18:57:56.188Z resp 18:57:56.195Z 200
  #19 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:57:56.198Z resp 18:57:56.222Z 200
  #20 PATCH /api/resource/revision/R1 send 18:58:06.555Z resp 18:58:06.570Z 200 updatedAt=2026-10-11T18:58:06.567Z snapshotCreated=False writingLog=null doc{len=208,sha256=158e85b727ace080c0fc92ef8f83a860760ae79d2a2e9cd95ca33d7ac8151708,markers=["B1"]}
  #21 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:58:06.577Z resp 18:58:06.583Z 200
  #22 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:58:06.577Z resp 18:58:06.583Z 200
  #23 GET /api/encryption send 18:58:45.423Z resp  - null net::ERR_ABORTED
  #24 GET /api/version-check send 18:58:45.423Z resp  - null net::ERR_ABORTED
  #25 GET /api/auth-status send 18:58:45.423Z resp  - null net::ERR_ABORTED
  #26 GET /api/projects send 18:58:45.423Z resp  - null net::ERR_ABORTED
  #27 GET /api/sharing/limits send 18:58:45.423Z resp  - null net::ERR_ABORTED
  #28 GET /api/encryption send 18:58:45.446Z resp 18:58:45.449Z 200
  #29 GET /api/version-check send 18:58:45.446Z resp 18:58:45.451Z 200
  #30 GET /api/auth-status send 18:58:45.446Z resp 18:58:45.452Z 200
  #31 GET /api/projects send 18:58:45.447Z resp 18:58:45.454Z 200
  #32 GET /api/sharing/limits send 18:58:45.447Z resp 18:58:45.453Z 200
  #33 GET /api/auth/get-session send 18:58:45.448Z resp 18:58:45.452Z 404
  #34 POST /api/project send 18:58:46.295Z resp 18:58:46.300Z 200
  #35 GET /api/project/PRJ/entity-alias-table send 18:58:46.306Z resp 18:58:46.314Z 200
  #36 GET /api/project/PRJ/entity-alias-table send 18:58:46.313Z resp 18:58:46.319Z 200
  #37 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:58:46.313Z resp 18:58:46.319Z 200
  #38 POST /api/project/tags send 18:58:46.313Z resp 18:58:46.317Z 200
  #39 POST /api/project/query/saved send 18:58:46.313Z resp 18:58:46.317Z 200
  #40 POST /api/project-resources send 18:58:46.341Z resp 18:58:46.350Z 200
  #41 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:58:46.341Z resp 18:58:46.349Z 200
  #42 POST /api/project-resources send 18:58:46.341Z resp 18:58:46.350Z 200
  #43 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:58:46.341Z resp 18:58:46.350Z 200
  #44 POST /api/project/tags send 18:58:46.341Z resp 18:58:46.348Z 200
  #45 POST /api/project/tags send 18:58:46.341Z resp 18:58:46.349Z 200
  #46 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:58:46.351Z resp 18:58:46.365Z 200
  labelsRegistered: [{"label":"PRJ","idLength":36},{"label":"PRJ-MANIFEST-ID","idLength":36},{"label":"R1","idLength":36},{"label":"REV-R1","idLength":36}]
  pageReloadMarks: {"A":[{"name":"page.reload","t":1791745124346.3064,"at":"2026-10-11T18:58:44.346Z"}],"B":[{"name":"page.reload","t":1791745125373.0945,"at":"2026-10-11T18:58:45.373Z"}]}
  visibilityEvents: {"A":[{"t":1791745074085,"state":"hidden","at":"2026-10-11T18:57:54.085Z","msAfterReloadMark":null},{"t":1791745124362,"state":"hidden","at":"2026-10-11T18:58:44.362Z","msAfterReloadMark":16},{"t":1791745124415,"state":"hidden","at":"2026-10-11T18:58:44.415Z","msAfterReloadMark":69}],"B":[{"t":1791745075178,"state":"hidden","at":"2026-10-11T18:57:55.178Z","msAfterReloadMark":null},{"t":1791745125380,"state":"hidden","at":"2026-10-11T18:58:45.380Z","msAfterReloadMark":7},{"t":1791745125422,"state":"hidden","at":"2026-10-11T18:58:45.422Z","msAfterReloadMark":49}]}
  timelineSummary: {"stepGapsMs":[{"step":1,"who":"A","msSinceLastSaveAckWhenTypingStarted":null},{"step":2,"who":"B","msSinceLastSaveAckWhenTypingStarted":5007},{"step":3,"who":"A","msSinceLastSaveAckWhenTypingStarted":5014}]}
  teardown: {"errors":[],"browserPidsRecorded":5,"browserPidsAliveAfterClose":[],"browserPidsAliveAfterTerm":[],"server":{"recorded":[{"pid":42541,"comm":"next-server (v16.2.6)"}],"stillAliveAfterTerm":[],"stillAliveAfterKill":[],"portListenersAfter":[],"listeners7340After":[],"listeners3000After":[]},"listeners7340After":[],"listeners3000After":[],"cleanup":{"removed":true,"path":"/private/tmp/getwrite-two-client/s1r1-mv46r43j-10e1dd"}}
====================================================================================================
JSON written: /Users/jedaisaboteur/Repositories/getwrite/specs/features/two-client-save-measurement/results/s1/s1r1-mv46r43j-10e1dd-rep01.json
====================================================================================================

RECORD scenario=s1 repetition=2 run=s1r2-mv46senm-157411 commit=c5726668 node=v24.15.0
started 2026-10-11T18:58:52.009Z
server: built standalone server (frontend/.next/standalone/frontend/server.js), sharing on; port 63371; pid 44766; private LAN IPv4 of this host (host to itself, not a second-device result)
every result in this record: host to itself, not a second-device result. Times: Playwright event times on the host clock, not wire times.
note: S1 in turn, repetition 2 of 3. Measurement of the unchanged product. Fresh server, project and resource.
-- steps (time since record start) --
  [+    19 ms 2026-10-11T18:58:52.029Z] fixture created through POST /api/projects and POST /api/resource {"resourceLabel":"R1","baseContentChars":109}
  [+  2050 ms 2026-10-11T18:58:54.059Z] initial stores read before any client opened the resource {"classification":["content.bin (canonical): = base","content.tiptap.json: = base","content.txt: = base","sidecar wordCount=4 matches base; updatedAt=null","stores agree on base"]}
  [+  4226 ms 2026-10-11T18:58:56.235Z] both clients opened R in the real editor {"openA":{"openedInMs":1091},"openB":{"openedInMs":1081},"editors":{"at":"2026-10-11T18:58:56.232Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+  4229 ms 2026-10-11T18:58:56.238Z] step 1: A about to type ' A1' {"msSinceLastSaveAck":null,"editorsBeforeTyping":{"at":"2026-10-11T18:58:56.235Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+  6916 ms 2026-10-11T18:58:58.925Z] step 1: A typed ' A1' and save acknowledged {"typed":{"firstToLastMs":137,"delayMs":40},"editorAfterTyping":"BASE alpha bravo charlie A1","footerAfterTyping":{"full":"Words: 5 | Node: Body | Today's writing Today: 0 Autosave queued…","autosave":"Autosave queued…"},"saved":{"ok":true,"footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"},"savedSeenAt":1791745138920.3054,"waitedMs":2530},"editorsRightAfterSave":{"at":"2026-10-11T18:58:58.920Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+ 11924 ms 2026-10-11T18:59:03.934Z] step 1: 5000 ms after the save acknowledgement {"editorsAt5s":{"at":"2026-10-11T18:59:03.920Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"msFromSaveAckToEndOfStoresRead":4530}
  [+ 11930 ms 2026-10-11T18:59:03.940Z] step 2: B about to type ' B1' {"msSinceLastSaveAck":5014,"editorsBeforeTyping":{"at":"2026-10-11T18:59:03.934Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+ 14632 ms 2026-10-11T18:59:06.641Z] step 2: B typed ' B1' and save acknowledged {"typed":{"firstToLastMs":145,"delayMs":40},"editorAfterTyping":"BASE alpha bravo charlie B1","footerAfterTyping":{"full":"Words: 5 | Node: Body | Today's writing Today: 0 Autosave queued…","autosave":"Autosave queued…"},"saved":{"ok":true,"footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"},"savedSeenAt":1791745146636.997,"waitedMs":2527},"editorsRightAfterSave":{"at":"2026-10-11T18:59:06.637Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}}}}
  [+ 19641 ms 2026-10-11T18:59:11.651Z] step 2: 5000 ms after the save acknowledgement {"editorsAt5s":{"at":"2026-10-11T18:59:11.637Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"msFromSaveAckToEndOfStoresRead":4528}
  [+ 19648 ms 2026-10-11T18:59:11.657Z] step 3: A about to type ' A2' {"msSinceLastSaveAck":5014,"editorsBeforeTyping":{"at":"2026-10-11T18:59:11.651Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}}}
  [+ 22336 ms 2026-10-11T18:59:14.346Z] step 3: A typed ' A2' and save acknowledged {"typed":{"firstToLastMs":138,"delayMs":40},"editorAfterTyping":"BASE alpha bravo charlie A1 A2","footerAfterTyping":{"full":"Words: 6 | Node: Body | Today's writing Today: 1 Autosave queued…","autosave":"Autosave queued…"},"saved":{"ok":true,"footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 Saved · just now","autosave":"Saved · just now"},"savedSeenAt":1791745154340.6775,"waitedMs":2529},"editorsRightAfterSave":{"at":"2026-10-11T18:59:14.340Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}}}
  [+ 27344 ms 2026-10-11T18:59:19.354Z] step 3: 5000 ms after the save acknowledgement {"editorsAt5s":{"at":"2026-10-11T18:59:19.341Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"msFromSaveAckToEndOfStoresRead":4528}
  [+ 52346 ms 2026-10-11T18:59:44.356Z] 30 s after the last save acknowledgement, no reload (b) {"msSinceLastSaveAck":30016,"editors":{"at":"2026-10-11T18:59:44.340Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · 10s ago","autosave":"All changes saved · 10s ago"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · 19s ago","autosave":"All changes saved · 19s ago"}}}}
  [+ 54379 ms 2026-10-11T18:59:46.389Z] both reloaded (page reload, then reopen) (c) {"reloadA":{"openedInMs":957},"reloadB":{"openedInMs":966},"editors":{"at":"2026-10-11T18:59:46.385Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+ 55402 ms 2026-10-11T18:59:47.412Z] final stores read after reload {"classification":["content.bin (canonical): = A#2","content.tiptap.json: = A#2","content.txt: = A#2","sidecar wordCount=6 matches A#2; updatedAt=2026-10-11T18:59:14.276Z","stores agree on A#2"]}
-- Outcome 1, server state (four stores, classified) --
  onDiskNames: revisions/<R1>/v-N/content.bin (UTF-8 JSON text of the document the client sent) + metadata.json; resources/<R1>/content.tiptap.json; resources/<R1>/content.txt; meta/resource-<R1>.meta.json
  initial: {"quiet":{"quiet":true,"waitedMs":2007,"reads":4,"intervalMs":1000},"classification":["content.bin (canonical): = base","content.tiptap.json: = base","content.txt: = base","sidecar wordCount=4 matches base; updatedAt=null","stores agree on base"],"allFourAgree":true,"heldLabels":["base"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:58:52.028Z","savedAt":"2026-10-11T18:58:52.028Z","hasId":true,"contentBin":{"bytes":109,"sha256":"2642f35db296aa8e807fcee83ca02fcc876fee0e6793a3726c3993d2481fabe1"},"contentEquals":["base"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["base"],"sha256":"2642f35db296aa8e807fcee83ca02fcc876fee0e6793a3726c3993d2481fabe1","bytes":109}],"sidecar":{"parsed":true,"wordCount":4,"updatedAt":null,"name":"Doc s1r2-mv46senm-157411","keys":["createdAt","folderId","id","name","orderIndex","slug","type","userMetadata","wordCount"]},"wordCountMatchesDocs":["base"],"expectedWordCounts":{"base":4},"contentTiptapJson":{"bytes":196,"sha256":"abbba3532944c6ba49bd92919009b6651571e83e8ed732ff2637c5cbbfd11440"},"contentTxt":{"bytes":24,"sha256":"ef6459dadd84634b16c4730ac335cac361447c798f9d37ec6a2956834a91f04b"},"lastProcessed":{"determined":false,"reason":"no successful save"},"evidence":{},"writingLogActual":[],"writingLogEntryTimestamps":[],"writingLogExpected":[],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[],"search":{"A1":{"status":200,"count":0,"resourceIds":[]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":4,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"UNSTABLE","reasons":["order not determined: no successful save; stores agree on base"],"flags":{"reloadChecked":false}}}
  afterStep1: {"quiet":{"quiet":true,"waitedMs":1006,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = A#1","content.tiptap.json: = A#1","content.txt: = A#1","sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:58:58.864Z","stores agree on A#1"],"allFourAgree":true,"heldLabels":["A#1"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:58:52.028Z","savedAt":"2026-10-11T18:58:52.028Z","hasId":true,"contentBin":{"bytes":208,"sha256":"e0b7ab9bb8ffa4c93a54328671ddd2890864aec34336f2875e069e87d4dc4265"},"contentEquals":["A#1"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#1"],"sha256":"e0b7ab9bb8ffa4c93a54328671ddd2890864aec34336f2875e069e87d4dc4265","bytes":208}],"sidecar":{"parsed":true,"wordCount":5,"updatedAt":"2026-10-11T18:58:58.864Z","name":"Doc s1r2-mv46senm-157411","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#1"],"expectedWordCounts":{"base":4,"A#1":5},"contentTiptapJson":{"bytes":340,"sha256":"4776e18495bcb42d4497b479e0650f06c205273fa81caeaa206fb87058ed96db"},"contentTxt":{"bytes":27,"sha256":"b71058e96e11f9980d6864dee1034be30d4b5eeff7b4beaf07b45a678e0215f0"},"lastProcessed":{"docLabel":"A#1","updatedAt":"2026-10-11T18:58:58.864Z"},"evidence":{"byUpdatedAt":["A20"],"byResponseArrival":["A20"],"bySend":["A20"],"updatedAtValues":["2026-10-11T18:58:58.864Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1}],"writingLogEntryTimestamps":["2026-10-11T18:58:58.861Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold A#1, the last processed save"],"flags":{"reloadChecked":false}}}
  afterStep2: {"quiet":{"quiet":true,"waitedMs":1005,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = B#1","content.tiptap.json: = B#1","content.txt: = B#1","sidecar wordCount=5 matches A#1/B#1; updatedAt=2026-10-11T18:59:06.571Z","stores agree on B#1"],"allFourAgree":true,"heldLabels":["B#1"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:58:52.028Z","savedAt":"2026-10-11T18:58:52.028Z","hasId":true,"contentBin":{"bytes":208,"sha256":"4c924debc4598cad30c207912715be5bc97e1f07e9cc823adfa1ed252574edd8"},"contentEquals":["B#1"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["B#1"],"sha256":"4c924debc4598cad30c207912715be5bc97e1f07e9cc823adfa1ed252574edd8","bytes":208}],"sidecar":{"parsed":true,"wordCount":5,"updatedAt":"2026-10-11T18:59:06.571Z","name":"Doc s1r2-mv46senm-157411","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#1","B#1"],"expectedWordCounts":{"base":4,"A#1":5,"B#1":5},"contentTiptapJson":{"bytes":340,"sha256":"74728ed703abfd6a62bfe657662ca3aa46dd745ab974e8486ce937caa8dd786a"},"contentTxt":{"bytes":27,"sha256":"b310b25e52eca6b0a1f1c6b974fc82e599d6910188f345b730bc8630dbf9a915"},"lastProcessed":{"docLabel":"B#1","updatedAt":"2026-10-11T18:59:06.571Z"},"evidence":{"byUpdatedAt":["A20","B20"],"byResponseArrival":["A20","B20"],"bySend":["A20","B20"],"updatedAtValues":["2026-10-11T18:58:58.864Z","2026-10-11T18:59:06.571Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogEntryTimestamps":["2026-10-11T18:58:58.861Z","2026-10-11T18:59:06.569Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]}],"search":{"A1":{"status":200,"count":0,"resourceIds":[]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"BASE":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold B#1, the last processed save"],"flags":{"reloadChecked":false}}}
  afterStep3: {"quiet":{"quiet":true,"waitedMs":1004,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = A#2","content.tiptap.json: = A#2","content.txt: = A#2","sidecar wordCount=6 matches A#2; updatedAt=2026-10-11T18:59:14.276Z","stores agree on A#2"],"allFourAgree":true,"heldLabels":["A#2"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:58:52.028Z","savedAt":"2026-10-11T18:58:52.028Z","hasId":true,"contentBin":{"bytes":211,"sha256":"1cc35067b55a39425bf77a78143fde3b55f6243629bb1beda1c92a6fcefb3177"},"contentEquals":["A#2"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"1cc35067b55a39425bf77a78143fde3b55f6243629bb1beda1c92a6fcefb3177","bytes":211}],"sidecar":{"parsed":true,"wordCount":6,"updatedAt":"2026-10-11T18:59:14.276Z","name":"Doc s1r2-mv46senm-157411","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#2"],"expectedWordCounts":{"base":4,"A#1":5,"A#2":6,"B#1":5},"contentTiptapJson":{"bytes":343,"sha256":"c2a1bd328999dc8aff42b2a27c52b09088d27470d9a5c9e71bad39b9761783a8"},"contentTxt":{"bytes":30,"sha256":"d6bad937ce3eb595d64cc1b56e8ca149e063e1d62c010cda2038c7784502ce29"},"lastProcessed":{"docLabel":"A#2","updatedAt":"2026-10-11T18:59:14.276Z"},"evidence":{"byUpdatedAt":["A20","B20","A23"],"byResponseArrival":["A20","B20","A23"],"bySend":["A20","B20","A23"],"updatedAtValues":["2026-10-11T18:58:58.864Z","2026-10-11T18:59:06.571Z","2026-10-11T18:59:14.276Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogEntryTimestamps":["2026-10-11T18:58:58.861Z","2026-10-11T18:59:06.569Z","2026-10-11T18:59:14.274Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"A2":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold A#2, the last processed save"],"flags":{"reloadChecked":false}}}
  afterReload: {"quiet":{"quiet":true,"waitedMs":1002,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = A#2","content.tiptap.json: = A#2","content.txt: = A#2","sidecar wordCount=6 matches A#2; updatedAt=2026-10-11T18:59:14.276Z","stores agree on A#2"],"allFourAgree":true,"heldLabels":["A#2"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:58:52.028Z","savedAt":"2026-10-11T18:58:52.028Z","hasId":true,"contentBin":{"bytes":211,"sha256":"1cc35067b55a39425bf77a78143fde3b55f6243629bb1beda1c92a6fcefb3177"},"contentEquals":["A#2"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"1cc35067b55a39425bf77a78143fde3b55f6243629bb1beda1c92a6fcefb3177","bytes":211}],"sidecar":{"parsed":true,"wordCount":6,"updatedAt":"2026-10-11T18:59:14.276Z","name":"Doc s1r2-mv46senm-157411","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#2"],"expectedWordCounts":{"base":4,"A#1":5,"A#2":6,"B#1":5},"contentTiptapJson":{"bytes":343,"sha256":"c2a1bd328999dc8aff42b2a27c52b09088d27470d9a5c9e71bad39b9761783a8"},"contentTxt":{"bytes":30,"sha256":"d6bad937ce3eb595d64cc1b56e8ca149e063e1d62c010cda2038c7784502ce29"},"lastProcessed":{"docLabel":"A#2","updatedAt":"2026-10-11T18:59:14.276Z"},"evidence":{"byUpdatedAt":["A20","B20","A23"],"byResponseArrival":["A20","B20","A23"],"bySend":["A20","B20","A23"],"updatedAtValues":["2026-10-11T18:58:58.864Z","2026-10-11T18:59:06.571Z","2026-10-11T18:59:14.276Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogEntryTimestamps":["2026-10-11T18:58:58.861Z","2026-10-11T18:59:06.569Z","2026-10-11T18:59:14.274Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"A2":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold A#2, the last processed save"],"flags":{"reloadChecked":false}}}
-- Outcome 2, each open editor (text and footer: (a) right after the other client's save was acknowledged, (b) after 30 s, (c) after reload) --
  note: (a) immediately after the other client's save was acknowledged; (5 s) just before the next client typed; (b) 30 s after the LAST save only (the sequence puts the next step at 5 s, so a 30 s read per step is not possible); (c) after reload.
  step0_bothOpen: {"at":"2026-10-11T18:58:56.232Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}
  step1: {"editorsBeforeTyping":{"at":"2026-10-11T18:58:56.235Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"editorsRightAfterSave":{"at":"2026-10-11T18:58:58.920Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"editorsAt5s":{"at":"2026-10-11T18:59:03.920Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"vsServerRightAfter":{"serverHolds":["A#1"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false}}
  step2: {"editorsBeforeTyping":{"at":"2026-10-11T18:59:03.934Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"editorsRightAfterSave":{"at":"2026-10-11T18:59:06.637Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}}},"editorsAt5s":{"at":"2026-10-11T18:59:11.637Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"vsServerAt5s":{"serverHolds":["B#1"],"A_editorEqualsServerText":false,"B_editorEqualsServerText":true}}
  step3: {"editorsBeforeTyping":{"at":"2026-10-11T18:59:11.651Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"editorsRightAfterSave":{"at":"2026-10-11T18:59:14.340Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"editorsAt5s":{"at":"2026-10-11T18:59:19.341Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"vsServerAt5s":{"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false}}
  at30sAfterLastSave_noReload: {"at":"2026-10-11T18:59:44.340Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · 10s ago","autosave":"All changes saved · 10s ago"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · 19s ago","autosave":"All changes saved · 19s ago"}}}
  vsServerAt30s: {"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false}
  afterReload: {"at":"2026-10-11T18:59:46.385Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}
  vsServerAfterReload: {"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":true}
-- Outcome 3, notification (surfaces checked are named) --
  A_sinceBsFirstSave: {"sinceAt":"2026-10-11T18:59:06.637Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7650,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":38707,"msAfterReloadMark":988},{"role":"status","text":"Loading diagnostics…","msAfterSince":38707,"msAfterReloadMark":988}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":37791,"msAfterReloadMark":72},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":37823,"msAfterReloadMark":103},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38672,"msAfterReloadMark":953},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38705,"msAfterReloadMark":986}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":37791,"msAfterReloadMark":71},{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":37791,"msAfterReloadMark":71},{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":37791,"msAfterReloadMark":71},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":37791,"msAfterReloadMark":71},{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":37791,"msAfterReloadMark":71}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":37818,"msAfterReloadMark":99}],"patchResponseSignals":[{"n":23,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T18:59:44.356Z","msAfterSince":37719}]}
  B_sinceAsFirstSave: {"sinceAt":"2026-10-11T18:58:58.920Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7662,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":47432,"msAfterReloadMark":975},{"role":"status","text":"Loading diagnostics…","msAfterSince":47432,"msAfterReloadMark":975}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":46507,"msAfterReloadMark":50},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":46538,"msAfterReloadMark":81},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47394,"msAfterReloadMark":937},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47430,"msAfterReloadMark":973}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":46506,"msAfterReloadMark":50},{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":46506,"msAfterReloadMark":50},{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":46506,"msAfterReloadMark":50},{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":46506,"msAfterReloadMark":50},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":46506,"msAfterReloadMark":50}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":46532,"msAfterReloadMark":75}],"patchResponseSignals":[{"n":20,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T18:59:45.376Z","msAfterSince":46456}]}
-- Outcome 4, lost-update shape (did a stale editor's save write its older copy over newer text, and only after typing) --
  note: established from outcome 1 (which document each store held after the step) and the PATCH log (markers in each sent document)
  step2_B_stale_saved: {"documentSentByB":[{"markers":["B1"],"baseWordsPresent":true}],"markersHeldByEachDocument":{"A#1":["A1"],"B#1":["B1"]},"storesHeldAfterStep2":["B#1"],"patchesBByBeforeTypingInStep2":0,"BsEditorTextAtTypingStart":"BASE alpha bravo charlie","BsEditorHeldAsText_A1":false}
  step3_A_stale_saved: {"documentSentByA":[{"markers":["A1","A2"],"baseWordsPresent":true}],"markersHeldByEachDocument":{"A#1":["A1"],"B#1":["B1"],"A#2":["A1","A2"]},"storesHeldAfterStep3":["A#2"],"patchesAByBeforeTypingInStep3":0,"AsEditorTextAtTypingStart":"BASE alpha bravo charlie A1","AsEditorHeldAsText_B1":false}
  everyPatchSentByA: [{"n":20,"sendAt":"2026-10-11T18:58:58.849Z","status":200,"hasDocument":true,"markers":["A1"],"note":null,"msAfterLastTypingEnd":2461,"lastTypingMarker":" A1","afterAReloadMark":false},{"n":23,"sendAt":"2026-10-11T18:59:14.267Z","status":200,"hasDocument":true,"markers":["A1","A2"],"note":null,"msAfterLastTypingEnd":2459,"lastTypingMarker":" A2","afterAReloadMark":false}]
  everyPatchSentByB: [{"n":20,"sendAt":"2026-10-11T18:59:06.563Z","status":200,"hasDocument":true,"markers":["B1"],"note":null,"msAfterLastTypingEnd":2457,"lastTypingMarker":" B1","afterAReloadMark":false}]
-- Outcome 5, side effects (revisions, writing log vs expected, search, wordCount, indexes) --
  afterStep1: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#1"],"sha256":"e0b7ab9bb8ffa4c93a54328671ddd2890864aec34336f2875e069e87d4dc4265","bytes":208}],"writingLogActual":[{"added":1,"deleted":0,"net":1}],"writingLogExpected":[{"added":1,"deleted":0,"net":1}],"writingLogMatchesExpected":true,"tokens":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]}},"sidecarWordCount":5,"expectedWordCounts":{"base":4,"A#1":5},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}}}
  afterStep2: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["B#1"],"sha256":"4c924debc4598cad30c207912715be5bc97e1f07e9cc823adfa1ed252574edd8","bytes":208}],"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogMatchesExpected":true,"tokens":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]}],"search":{"A1":{"status":200,"count":0,"resourceIds":[]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"BASE":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]}},"sidecarWordCount":5,"expectedWordCounts":{"base":4,"A#1":5,"B#1":5},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}}}
  afterStep3: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"1cc35067b55a39425bf77a78143fde3b55f6243629bb1beda1c92a6fcefb3177","bytes":211}],"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"tokens":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"A2":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]}},"sidecarWordCount":6,"expectedWordCounts":{"base":4,"A#1":5,"A#2":6,"B#1":5},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}}}
  afterReload: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"1cc35067b55a39425bf77a78143fde3b55f6243629bb1beda1c92a6fcefb3177","bytes":211}],"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"search":{"A1":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"A2":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["9987b756-5c30-4cc9-adba-d8db406a889b"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}}}
  indexesComparedToPlainText: not compared by the harness (diagnostics heuristics are TypeScript and not ported; the fixture declares no entity so the mention index holds no record); raw records are printed
-- Outcome 6, failed saves (non-2xx: status and truncated body; what the client showed) --
  failedSavesA: []
  failedSavesB: []
  result: no failed save
-- verdict inputs --
  {"saves":[{"id":"A20","docLabel":"A#1","updatedAt":"2026-10-11T18:58:58.864Z","sendT":1791745138849.4111,"respT":1791745138867.3872},{"id":"A23","docLabel":"A#2","updatedAt":"2026-10-11T18:59:14.276Z","sendT":1791745154267.2986,"respT":1791745154278.5303},{"id":"B20","docLabel":"B#1","updatedAt":"2026-10-11T18:59:06.571Z","sendT":1791745146563.1255,"respT":1791745146573.5454}],"lastProcessed":{"docLabel":"A#2","updatedAt":"2026-10-11T18:59:14.276Z"},"evidence":{"byUpdatedAt":["A20","B20","A23"],"byResponseArrival":["A20","B20","A23"],"bySend":["A20","B20","A23"],"updatedAtValues":["2026-10-11T18:58:58.864Z","2026-10-11T18:59:06.571Z","2026-10-11T18:59:14.276Z"]},"sendOrderAgreesWithUpdatedAt":true,"documentHashes":{"base":"2642f35db296aa8e807fcee83ca02fcc876fee0e6793a3726c3993d2481fabe1","A#1":"e0b7ab9bb8ffa4c93a54328671ddd2890864aec34336f2875e069e87d4dc4265","A#2":"1cc35067b55a39425bf77a78143fde3b55f6243629bb1beda1c92a6fcefb3177","B#1":"4c924debc4598cad30c207912715be5bc97e1f07e9cc823adfa1ed252574edd8"},"requireReload":true,"reloadTexts":{"A":"BASE alpha bravo charlie A1 A2","B":"BASE alpha bravo charlie A1 A2"}}
-- verdict (against the Task 1 definition) --
  {"verdict":"PASS","reasons":["all four stores hold A#2, the last processed save"],"flags":{"reloadChecked":true}}
-- findings, raw observations, NO verdict --
  a_stale_editor_replaced_other_text_on_a_keystroke: {"step2_B":{"storesHeldAfter":["B#1"],"BsDocumentMarkers":[["B1"]],"A1_in_BsDocument":false,"A1_in_serverPlainAfterStep2":false},"step3_A":{"storesHeldAfter":["A#2"],"AsDocumentMarkers":[["A1","A2"]],"B1_in_AsDocument":false,"B1_in_serverPlainAfterStep3":false},"varied":"nothing (in turn, 5 s gaps, short additions)"}
  b_saves_sent_with_no_typing: {"patchesA":[{"n":20,"hasDocument":true,"markers":["A1"],"msAfterLastTypingEnd":2461,"afterAReloadMark":false},{"n":23,"hasDocument":true,"markers":["A1","A2"],"msAfterLastTypingEnd":2459,"afterAReloadMark":false}],"patchesB":[{"n":20,"hasDocument":true,"markers":["B1"],"msAfterLastTypingEnd":2457,"afterAReloadMark":false}],"typingActions":{"A":[" A1"," A2"],"B":[" B1"]},"patchesBeforeFirstTyping":{"A":0,"B":0},"idleApiRequestsNote":"see requestLogA / requestLogB in extra facts for every request"}
  c_overwritten_device_told_anything: {"B_overwrittenAtStep3":{"sinceAt":"2026-10-11T18:58:58.920Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7662,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":47432,"msAfterReloadMark":975},{"role":"status","text":"Loading diagnostics…","msAfterSince":47432,"msAfterReloadMark":975}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":46507,"msAfterReloadMark":50},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":46538,"msAfterReloadMark":81},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47394,"msAfterReloadMark":937},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47430,"msAfterReloadMark":973}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":46506,"msAfterReloadMark":50},{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":46506,"msAfterReloadMark":50},{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":46506,"msAfterReloadMark":50},{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":46506,"msAfterReloadMark":50},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":46506,"msAfterReloadMark":50}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":46532,"msAfterReloadMark":75}],"patchResponseSignals":[{"n":20,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T18:59:45.376Z","msAfterSince":46456}]},"A_overwrittenAtStep2":{"sinceAt":"2026-10-11T18:59:06.637Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7650,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":38707,"msAfterReloadMark":988},{"role":"status","text":"Loading diagnostics…","msAfterSince":38707,"msAfterReloadMark":988}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":37791,"msAfterReloadMark":72},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":37823,"msAfterReloadMark":103},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38672,"msAfterReloadMark":953},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38705,"msAfterReloadMark":986}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":37791,"msAfterReloadMark":71},{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":37791,"msAfterReloadMark":71},{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":37791,"msAfterReloadMark":71},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":37791,"msAfterReloadMark":71},{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":37791,"msAfterReloadMark":71}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":37818,"msAfterReloadMark":99}],"patchResponseSignals":[{"n":23,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T18:59:44.356Z","msAfterSince":37719}]},"note":"full lists are in outcome 3; surfaces named there"}
  d_overwritten_text_recoverable: {"afterStep2":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["B#1"],"sha256":"4c924debc4598cad30c207912715be5bc97e1f07e9cc823adfa1ed252574edd8","bytes":208}],"afterStep3":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"1cc35067b55a39425bf77a78143fde3b55f6243629bb1beda1c92a6fcefb3177","bytes":211}],"afterReload":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"1cc35067b55a39425bf77a78143fde3b55f6243629bb1beda1c92a6fcefb3177","bytes":211}],"revisionDirListingAfterReload":[{"dir":"v-1","name":"Initial Draft","automaticSnapshot":false,"isCanonical":true,"contentEquals":["A#2"]}]}
  e_overwritten_editor_shows_text_the_server_no_longer_holds: {"afterStep2_A_editor":false,"A_editorTextAfterStep2":"BASE alpha bravo charlie A1","afterStep3_B_editor":false,"B_editorTextAfterStep3":"BASE alpha bravo charlie B1","at30s_noReload":{"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false},"afterReload":{"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":true}}
  f_writing_log_effect: {"actualAfterStep3":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"expectedAfterStep3":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"tokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"matchesExpected":true}
  g_failed_save_on_the_device_the_writer_believes_is_last: {"failedSavesA":[],"failedSavesB":[],"result":"none"}
-- extra facts --
  preChecks: {"listeners7340":"none","listeners3000":"none","chosenPort":63371,"chosenPortListenersBeforeStart":"none (checked immediately before start)","serverPidsRecorded":[{"pid":44766,"comm":"next-server (v16.2.6)"}],"browserPidsRecorded":[{"pid":44784,"comm":"chrome-headless-shell"},{"pid":44785,"comm":"chrome-headless-shell"},{"pid":44786,"comm":"chrome-headless-shell"},{"pid":44800,"comm":"chrome-headless-shell"},{"pid":44802,"comm":"chrome-headless-shell"}],"clientsPaired":{"A":{"paired":true,"deviceCookiePresent":true},"B":{"paired":true,"deviceCookiePresent":true}},"throwawayRootAsserted":"/private/tmp/getwrite-two-client/s1r2-mv46senm-157411"}
requestLogA
  #1 GET /api/auth/get-session send 18:58:54.160Z resp 18:58:54.172Z 404
  #2 GET /api/encryption send 18:58:54.172Z resp 18:58:54.173Z 200
  #3 GET /api/version-check send 18:58:54.172Z resp 18:58:54.176Z 200
  #4 GET /api/auth-status send 18:58:54.172Z resp 18:58:54.176Z 200
  #5 GET /api/projects send 18:58:54.172Z resp 18:58:54.178Z 200
  #6 GET /api/sharing/limits send 18:58:54.172Z resp 18:58:54.178Z 200
  #7 POST /api/project send 18:58:55.013Z resp 18:58:55.022Z 200
  #8 GET /api/project/PRJ/entity-alias-table send 18:58:55.033Z resp 18:58:55.077Z 200
  #9 GET /api/project/PRJ/entity-alias-table send 18:58:55.049Z resp 18:58:55.079Z 200
  #10 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:58:55.049Z resp 18:58:55.079Z 200
  #11 POST /api/project/tags send 18:58:55.049Z resp 18:58:55.080Z 200
  #12 POST /api/project/query/saved send 18:58:55.049Z resp 18:58:55.080Z 200
  #13 POST /api/project-resources send 18:58:55.105Z resp 18:58:55.116Z 200
  #14 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:58:55.105Z resp 18:58:55.115Z 200
  #15 POST /api/project-resources send 18:58:55.105Z resp 18:58:55.116Z 200
  #16 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:58:55.105Z resp 18:58:55.115Z 200
  #17 POST /api/project/tags send 18:58:55.105Z resp 18:58:55.114Z 200
  #18 POST /api/project/tags send 18:58:55.105Z resp 18:58:55.114Z 200
  #19 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:58:55.117Z resp 18:58:55.141Z 200
  #20 PATCH /api/resource/revision/R1 send 18:58:58.849Z resp 18:58:58.867Z 200 updatedAt=2026-10-11T18:58:58.864Z snapshotCreated=False writingLog=null doc{len=208,sha256=e0b7ab9bb8ffa4c93a54328671ddd2890864aec34336f2875e069e87d4dc4265,markers=["A1"]}
  #21 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:58:58.872Z resp 18:58:58.877Z 200
  #22 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:58:58.872Z resp 18:58:58.878Z 200
  #23 PATCH /api/resource/revision/R1 send 18:59:14.267Z resp 18:59:14.278Z 200 updatedAt=2026-10-11T18:59:14.276Z snapshotCreated=False writingLog=null doc{len=211,sha256=1cc35067b55a39425bf77a78143fde3b55f6243629bb1beda1c92a6fcefb3177,markers=["A1", "A2"]}
  #24 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:59:14.283Z resp 18:59:14.289Z 200
  #25 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:59:14.283Z resp 18:59:14.289Z 200
  #26 GET /api/encryption send 18:59:44.427Z resp  - null net::ERR_ABORTED
  #27 GET /api/version-check send 18:59:44.427Z resp  - null net::ERR_ABORTED
  #28 GET /api/auth-status send 18:59:44.427Z resp  - null net::ERR_ABORTED
  #29 GET /api/projects send 18:59:44.427Z resp  - null net::ERR_ABORTED
  #30 GET /api/sharing/limits send 18:59:44.427Z resp  - null net::ERR_ABORTED
  #31 GET /api/encryption send 18:59:44.453Z resp 18:59:44.456Z 200
  #32 GET /api/version-check send 18:59:44.453Z resp 18:59:44.458Z 200
  #33 GET /api/auth-status send 18:59:44.453Z resp 18:59:44.458Z 200
  #34 GET /api/projects send 18:59:44.453Z resp 18:59:44.461Z 200
  #35 GET /api/sharing/limits send 18:59:44.453Z resp 18:59:44.460Z 200
  #36 GET /api/auth/get-session send 18:59:44.455Z resp 18:59:44.459Z 404
  #37 POST /api/project send 18:59:45.298Z resp 18:59:45.303Z 200
  #38 GET /api/project/PRJ/entity-alias-table send 18:59:45.308Z resp 18:59:45.316Z 200
  #39 GET /api/project/PRJ/entity-alias-table send 18:59:45.314Z resp 18:59:45.321Z 200
  #40 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:59:45.314Z resp 18:59:45.321Z 200
  #41 POST /api/project/tags send 18:59:45.314Z resp 18:59:45.321Z 200
  #42 POST /api/project/query/saved send 18:59:45.314Z resp 18:59:45.319Z 200
  #43 POST /api/project-resources send 18:59:45.345Z resp 18:59:45.353Z 200
  #44 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:59:45.345Z resp 18:59:45.352Z 200
  #45 POST /api/project-resources send 18:59:45.345Z resp 18:59:45.352Z 200
  #46 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:59:45.345Z resp 18:59:45.354Z 200
  #47 POST /api/project/tags send 18:59:45.345Z resp 18:59:45.351Z 200
  #48 POST /api/project/tags send 18:59:45.345Z resp 18:59:45.351Z 200
  #49 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:59:45.353Z resp 18:59:45.369Z 200
requestLogB
  #1 GET /api/auth/get-session send 18:58:55.237Z resp 18:58:55.250Z 404
  #2 GET /api/encryption send 18:58:55.250Z resp 18:58:55.251Z 200
  #3 GET /api/version-check send 18:58:55.250Z resp 18:58:55.254Z 200
  #4 GET /api/auth-status send 18:58:55.250Z resp 18:58:55.254Z 200
  #5 GET /api/projects send 18:58:55.250Z resp 18:58:55.255Z 200
  #6 GET /api/sharing/limits send 18:58:55.250Z resp 18:58:55.254Z 200
  #7 POST /api/project send 18:58:56.098Z resp 18:58:56.105Z 200
  #8 GET /api/project/PRJ/entity-alias-table send 18:58:56.117Z resp 18:58:56.160Z 200
  #9 GET /api/project/PRJ/entity-alias-table send 18:58:56.133Z resp 18:58:56.162Z 200
  #10 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:58:56.133Z resp 18:58:56.162Z 200
  #11 POST /api/project/tags send 18:58:56.133Z resp 18:58:56.162Z 200
  #12 POST /api/project/query/saved send 18:58:56.133Z resp 18:58:56.162Z 200
  #13 POST /api/project-resources send 18:58:56.188Z resp 18:58:56.196Z 200
  #14 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:58:56.188Z resp 18:58:56.195Z 200
  #15 POST /api/project-resources send 18:58:56.188Z resp 18:58:56.196Z 200
  #16 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:58:56.188Z resp 18:58:56.196Z 200
  #17 POST /api/project/tags send 18:58:56.188Z resp 18:58:56.194Z 200
  #18 POST /api/project/tags send 18:58:56.188Z resp 18:58:56.194Z 200
  #19 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:58:56.197Z resp 18:58:56.222Z 200
  #20 PATCH /api/resource/revision/R1 send 18:59:06.563Z resp 18:59:06.573Z 200 updatedAt=2026-10-11T18:59:06.571Z snapshotCreated=False writingLog=null doc{len=208,sha256=4c924debc4598cad30c207912715be5bc97e1f07e9cc823adfa1ed252574edd8,markers=["B1"]}
  #21 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:59:06.578Z resp 18:59:06.583Z 200
  #22 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:59:06.578Z resp 18:59:06.584Z 200
  #23 GET /api/encryption send 18:59:45.426Z resp  - null net::ERR_ABORTED
  #24 GET /api/version-check send 18:59:45.426Z resp  - null net::ERR_ABORTED
  #25 GET /api/auth-status send 18:59:45.426Z resp  - null net::ERR_ABORTED
  #26 GET /api/projects send 18:59:45.426Z resp  - null net::ERR_ABORTED
  #27 GET /api/sharing/limits send 18:59:45.426Z resp  - null net::ERR_ABORTED
  #28 GET /api/encryption send 18:59:45.450Z resp 18:59:45.457Z 200
  #29 GET /api/version-check send 18:59:45.450Z resp 18:59:45.453Z 200
  #30 GET /api/auth-status send 18:59:45.450Z resp 18:59:45.454Z 200
  #31 GET /api/projects send 18:59:45.450Z resp 18:59:45.458Z 200
  #32 GET /api/sharing/limits send 18:59:45.450Z resp 18:59:45.456Z 200
  #33 GET /api/auth/get-session send 18:59:45.451Z resp 18:59:45.457Z 404
  #34 POST /api/project send 18:59:46.301Z resp 18:59:46.307Z 200
  #35 GET /api/project/PRJ/entity-alias-table send 18:59:46.314Z resp 18:59:46.322Z 200
  #36 GET /api/project/PRJ/entity-alias-table send 18:59:46.321Z resp 18:59:46.328Z 200
  #37 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:59:46.321Z resp 18:59:46.329Z 200
  #38 POST /api/project/tags send 18:59:46.321Z resp 18:59:46.328Z 200
  #39 POST /api/project/query/saved send 18:59:46.321Z resp 18:59:46.326Z 200
  #40 POST /api/project-resources send 18:59:46.353Z resp 18:59:46.363Z 200
  #41 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:59:46.353Z resp 18:59:46.363Z 200
  #42 POST /api/project-resources send 18:59:46.353Z resp 18:59:46.363Z 200
  #43 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:59:46.353Z resp 18:59:46.363Z 200
  #44 POST /api/project/tags send 18:59:46.353Z resp 18:59:46.362Z 200
  #45 POST /api/project/tags send 18:59:46.353Z resp 18:59:46.362Z 200
  #46 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:59:46.364Z resp 18:59:46.378Z 200
  labelsRegistered: [{"label":"PRJ","idLength":36},{"label":"PRJ-MANIFEST-ID","idLength":36},{"label":"R1","idLength":36},{"label":"REV-R1","idLength":36}]
  pageReloadMarks: {"A":[{"name":"page.reload","t":1791745184356.4595,"at":"2026-10-11T18:59:44.356Z"}],"B":[{"name":"page.reload","t":1791745185376.7864,"at":"2026-10-11T18:59:45.376Z"}]}
  visibilityEvents: {"A":[{"t":1791745134069,"state":"hidden","at":"2026-10-11T18:58:54.069Z","msAfterReloadMark":null},{"t":1791745184374,"state":"hidden","at":"2026-10-11T18:59:44.374Z","msAfterReloadMark":18},{"t":1791745184427,"state":"hidden","at":"2026-10-11T18:59:44.427Z","msAfterReloadMark":71}],"B":[{"t":1791745135157,"state":"hidden","at":"2026-10-11T18:58:55.157Z","msAfterReloadMark":null},{"t":1791745185383,"state":"hidden","at":"2026-10-11T18:59:45.383Z","msAfterReloadMark":6},{"t":1791745185426,"state":"hidden","at":"2026-10-11T18:59:45.426Z","msAfterReloadMark":49}]}
  timelineSummary: {"stepGapsMs":[{"step":1,"who":"A","msSinceLastSaveAckWhenTypingStarted":null},{"step":2,"who":"B","msSinceLastSaveAckWhenTypingStarted":5014},{"step":3,"who":"A","msSinceLastSaveAckWhenTypingStarted":5014}]}
  teardown: {"errors":[],"browserPidsRecorded":5,"browserPidsAliveAfterClose":[],"browserPidsAliveAfterTerm":[],"server":{"recorded":[{"pid":44766,"comm":"next-server (v16.2.6)"}],"stillAliveAfterTerm":[],"stillAliveAfterKill":[],"portListenersAfter":[],"listeners7340After":[],"listeners3000After":[]},"listeners7340After":[],"listeners3000After":[],"cleanup":{"removed":true,"path":"/private/tmp/getwrite-two-client/s1r2-mv46senm-157411"}}
====================================================================================================
JSON written: /Users/jedaisaboteur/Repositories/getwrite/specs/features/two-client-save-measurement/results/s1/s1r2-mv46senm-157411-rep02.json
====================================================================================================

RECORD scenario=s1 repetition=3 run=s1r3-mv46toyp-f90e33 commit=c5726668 node=v24.15.0
started 2026-10-11T18:59:51.920Z
server: built standalone server (frontend/.next/standalone/frontend/server.js), sharing on; port 63453; pid 46871; private LAN IPv4 of this host (host to itself, not a second-device result)
every result in this record: host to itself, not a second-device result. Times: Playwright event times on the host clock, not wire times.
note: S1 in turn, repetition 3 of 3. Measurement of the unchanged product. Fresh server, project and resource.
-- steps (time since record start) --
  [+    18 ms 2026-10-11T18:59:51.938Z] fixture created through POST /api/projects and POST /api/resource {"resourceLabel":"R1","baseContentChars":109}
  [+  2047 ms 2026-10-11T18:59:53.967Z] initial stores read before any client opened the resource {"classification":["content.bin (canonical): = base","content.tiptap.json: = base","content.txt: = base","sidecar wordCount=4 matches base; updatedAt=null","stores agree on base"]}
  [+  4215 ms 2026-10-11T18:59:56.135Z] both clients opened R in the real editor {"openA":{"openedInMs":1092},"openB":{"openedInMs":1072},"editors":{"at":"2026-10-11T18:59:56.132Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+  4218 ms 2026-10-11T18:59:56.138Z] step 1: A about to type ' A1' {"msSinceLastSaveAck":null,"editorsBeforeTyping":{"at":"2026-10-11T18:59:56.135Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+  6903 ms 2026-10-11T18:59:58.823Z] step 1: A typed ' A1' and save acknowledged {"typed":{"firstToLastMs":137,"delayMs":40},"editorAfterTyping":"BASE alpha bravo charlie A1","footerAfterTyping":{"full":"Words: 5 | Node: Body | Today's writing Today: 0 Autosave queued…","autosave":"Autosave queued…"},"saved":{"ok":true,"footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"},"savedSeenAt":1791745198818.3813,"waitedMs":2528},"editorsRightAfterSave":{"at":"2026-10-11T18:59:58.818Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+ 11913 ms 2026-10-11T19:00:03.833Z] step 1: 5000 ms after the save acknowledgement {"editorsAt5s":{"at":"2026-10-11T19:00:03.819Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"msFromSaveAckToEndOfStoresRead":4541}
  [+ 11919 ms 2026-10-11T19:00:03.839Z] step 2: B about to type ' B1' {"msSinceLastSaveAck":5015,"editorsBeforeTyping":{"at":"2026-10-11T19:00:03.833Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+ 14615 ms 2026-10-11T19:00:06.535Z] step 2: B typed ' B1' and save acknowledged {"typed":{"firstToLastMs":143,"delayMs":40},"editorAfterTyping":"BASE alpha bravo charlie B1","footerAfterTyping":{"full":"Words: 5 | Node: Body | Today's writing Today: 0 Autosave queued…","autosave":"Autosave queued…"},"saved":{"ok":true,"footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"},"savedSeenAt":1791745206531.4084,"waitedMs":2530},"editorsRightAfterSave":{"at":"2026-10-11T19:00:06.531Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}}}}
  [+ 19619 ms 2026-10-11T19:00:11.539Z] step 2: 5000 ms after the save acknowledgement {"editorsAt5s":{"at":"2026-10-11T19:00:11.531Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"msFromSaveAckToEndOfStoresRead":4534}
  [+ 19625 ms 2026-10-11T19:00:11.545Z] step 3: A about to type ' A2' {"msSinceLastSaveAck":5008,"editorsBeforeTyping":{"at":"2026-10-11T19:00:11.539Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}}}
  [+ 22316 ms 2026-10-11T19:00:14.236Z] step 3: A typed ' A2' and save acknowledged {"typed":{"firstToLastMs":140,"delayMs":40},"editorAfterTyping":"BASE alpha bravo charlie A1 A2","footerAfterTyping":{"full":"Words: 6 | Node: Body | Today's writing Today: 1 Autosave queued…","autosave":"Autosave queued…"},"saved":{"ok":true,"footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 Saved · just now","autosave":"Saved · just now"},"savedSeenAt":1791745214230.8567,"waitedMs":2530},"editorsRightAfterSave":{"at":"2026-10-11T19:00:14.230Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}}}
  [+ 27324 ms 2026-10-11T19:00:19.244Z] step 3: 5000 ms after the save acknowledgement {"editorsAt5s":{"at":"2026-10-11T19:00:19.231Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"msFromSaveAckToEndOfStoresRead":4532}
  [+ 52324 ms 2026-10-11T19:00:44.244Z] 30 s after the last save acknowledgement, no reload (b) {"msSinceLastSaveAck":30014,"editors":{"at":"2026-10-11T19:00:44.231Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · 10s ago","autosave":"All changes saved · 10s ago"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · 19s ago","autosave":"All changes saved · 19s ago"}}}}
  [+ 54354 ms 2026-10-11T19:00:46.274Z] both reloaded (page reload, then reopen) (c) {"reloadA":{"openedInMs":970},"reloadB":{"openedInMs":954},"editors":{"at":"2026-10-11T19:00:46.270Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}}
  [+ 55375 ms 2026-10-11T19:00:47.295Z] final stores read after reload {"classification":["content.bin (canonical): = A#2","content.tiptap.json: = A#2","content.txt: = A#2","sidecar wordCount=6 matches A#2; updatedAt=2026-10-11T19:00:14.167Z","stores agree on A#2"]}
-- Outcome 1, server state (four stores, classified) --
  onDiskNames: revisions/<R1>/v-N/content.bin (UTF-8 JSON text of the document the client sent) + metadata.json; resources/<R1>/content.tiptap.json; resources/<R1>/content.txt; meta/resource-<R1>.meta.json
  initial: {"quiet":{"quiet":true,"waitedMs":2008,"reads":4,"intervalMs":1000},"classification":["content.bin (canonical): = base","content.tiptap.json: = base","content.txt: = base","sidecar wordCount=4 matches base; updatedAt=null","stores agree on base"],"allFourAgree":true,"heldLabels":["base"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:59:51.937Z","savedAt":"2026-10-11T18:59:51.937Z","hasId":true,"contentBin":{"bytes":109,"sha256":"2642f35db296aa8e807fcee83ca02fcc876fee0e6793a3726c3993d2481fabe1"},"contentEquals":["base"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["base"],"sha256":"2642f35db296aa8e807fcee83ca02fcc876fee0e6793a3726c3993d2481fabe1","bytes":109}],"sidecar":{"parsed":true,"wordCount":4,"updatedAt":null,"name":"Doc s1r3-mv46toyp-f90e33","keys":["createdAt","folderId","id","name","orderIndex","slug","type","userMetadata","wordCount"]},"wordCountMatchesDocs":["base"],"expectedWordCounts":{"base":4},"contentTiptapJson":{"bytes":196,"sha256":"abbba3532944c6ba49bd92919009b6651571e83e8ed732ff2637c5cbbfd11440"},"contentTxt":{"bytes":24,"sha256":"ef6459dadd84634b16c4730ac335cac361447c798f9d37ec6a2956834a91f04b"},"lastProcessed":{"determined":false,"reason":"no successful save"},"evidence":{},"writingLogActual":[],"writingLogEntryTimestamps":[],"writingLogExpected":[],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[],"search":{"A1":{"status":200,"count":0,"resourceIds":[]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":4,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"UNSTABLE","reasons":["order not determined: no successful save; stores agree on base"],"flags":{"reloadChecked":false}}}
  afterStep1: {"quiet":{"quiet":true,"waitedMs":1007,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = A#1","content.tiptap.json: = A#1","content.txt: = A#1","sidecar wordCount=5 matches A#1; updatedAt=2026-10-11T18:59:58.765Z","stores agree on A#1"],"allFourAgree":true,"heldLabels":["A#1"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:59:51.937Z","savedAt":"2026-10-11T18:59:51.937Z","hasId":true,"contentBin":{"bytes":208,"sha256":"24505b8ef3ca09018ccb1384d1319dcad28868b03d5b3f433b09cf366d79a038"},"contentEquals":["A#1"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#1"],"sha256":"24505b8ef3ca09018ccb1384d1319dcad28868b03d5b3f433b09cf366d79a038","bytes":208}],"sidecar":{"parsed":true,"wordCount":5,"updatedAt":"2026-10-11T18:59:58.765Z","name":"Doc s1r3-mv46toyp-f90e33","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#1"],"expectedWordCounts":{"base":4,"A#1":5},"contentTiptapJson":{"bytes":340,"sha256":"e76869b2a2dbd6d015174809722c2557d43cd76a4d05c656d964954eb0ae29e1"},"contentTxt":{"bytes":27,"sha256":"b71058e96e11f9980d6864dee1034be30d4b5eeff7b4beaf07b45a678e0215f0"},"lastProcessed":{"docLabel":"A#1","updatedAt":"2026-10-11T18:59:58.765Z"},"evidence":{"byUpdatedAt":["A20"],"byResponseArrival":["A20"],"bySend":["A20"],"updatedAtValues":["2026-10-11T18:59:58.765Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1}],"writingLogEntryTimestamps":["2026-10-11T18:59:58.762Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold A#1, the last processed save"],"flags":{"reloadChecked":false}}}
  afterStep2: {"quiet":{"quiet":true,"waitedMs":1006,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = B#1","content.tiptap.json: = B#1","content.txt: = B#1","sidecar wordCount=5 matches A#1/B#1; updatedAt=2026-10-11T19:00:06.460Z","stores agree on B#1"],"allFourAgree":true,"heldLabels":["B#1"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:59:51.937Z","savedAt":"2026-10-11T18:59:51.937Z","hasId":true,"contentBin":{"bytes":208,"sha256":"d6315ba0dc2b9495d797d4a1efca33e41fd1d118d579b27e8fd8bc8ed30c4859"},"contentEquals":["B#1"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["B#1"],"sha256":"d6315ba0dc2b9495d797d4a1efca33e41fd1d118d579b27e8fd8bc8ed30c4859","bytes":208}],"sidecar":{"parsed":true,"wordCount":5,"updatedAt":"2026-10-11T19:00:06.460Z","name":"Doc s1r3-mv46toyp-f90e33","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#1","B#1"],"expectedWordCounts":{"base":4,"A#1":5,"B#1":5},"contentTiptapJson":{"bytes":340,"sha256":"c60c45616585d2b8e5a5251f362f4704a1cdb7f6a20d6bb7086628064a3dc83f"},"contentTxt":{"bytes":27,"sha256":"b310b25e52eca6b0a1f1c6b974fc82e599d6910188f345b730bc8630dbf9a915"},"lastProcessed":{"docLabel":"B#1","updatedAt":"2026-10-11T19:00:06.460Z"},"evidence":{"byUpdatedAt":["A20","B20"],"byResponseArrival":["A20","B20"],"bySend":["A20","B20"],"updatedAtValues":["2026-10-11T18:59:58.765Z","2026-10-11T19:00:06.460Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogEntryTimestamps":["2026-10-11T18:59:58.762Z","2026-10-11T19:00:06.459Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]}],"search":{"A1":{"status":200,"count":0,"resourceIds":[]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"BASE":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold B#1, the last processed save"],"flags":{"reloadChecked":false}}}
  afterStep3: {"quiet":{"quiet":true,"waitedMs":1005,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = A#2","content.tiptap.json: = A#2","content.txt: = A#2","sidecar wordCount=6 matches A#2; updatedAt=2026-10-11T19:00:14.167Z","stores agree on A#2"],"allFourAgree":true,"heldLabels":["A#2"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:59:51.937Z","savedAt":"2026-10-11T18:59:51.937Z","hasId":true,"contentBin":{"bytes":211,"sha256":"904cb03bdd118c9cf1cd82a0285b7da372c8f5cfbc190f8fd17797fa3553173f"},"contentEquals":["A#2"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"904cb03bdd118c9cf1cd82a0285b7da372c8f5cfbc190f8fd17797fa3553173f","bytes":211}],"sidecar":{"parsed":true,"wordCount":6,"updatedAt":"2026-10-11T19:00:14.167Z","name":"Doc s1r3-mv46toyp-f90e33","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#2"],"expectedWordCounts":{"base":4,"A#1":5,"A#2":6,"B#1":5},"contentTiptapJson":{"bytes":343,"sha256":"42cfb77735251e4569616df3406e3911b4270ea72bf527ad20fc346dc06c9f53"},"contentTxt":{"bytes":30,"sha256":"d6bad937ce3eb595d64cc1b56e8ca149e063e1d62c010cda2038c7784502ce29"},"lastProcessed":{"docLabel":"A#2","updatedAt":"2026-10-11T19:00:14.167Z"},"evidence":{"byUpdatedAt":["A20","B20","A23"],"byResponseArrival":["A20","B20","A23"],"bySend":["A20","B20","A23"],"updatedAtValues":["2026-10-11T18:59:58.765Z","2026-10-11T19:00:06.460Z","2026-10-11T19:00:14.167Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogEntryTimestamps":["2026-10-11T18:59:58.762Z","2026-10-11T19:00:06.459Z","2026-10-11T19:00:14.165Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"A2":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold A#2, the last processed save"],"flags":{"reloadChecked":false}}}
  afterReload: {"quiet":{"quiet":true,"waitedMs":1004,"reads":2,"intervalMs":1000},"classification":["content.bin (canonical): = A#2","content.tiptap.json: = A#2","content.txt: = A#2","sidecar wordCount=6 matches A#2; updatedAt=2026-10-11T19:00:14.167Z","stores agree on A#2"],"allFourAgree":true,"heldLabels":["A#2"],"canonicalCount":1,"revisions":[{"dir":"v-1","versionNumber":1,"metadataParsed":true,"isCanonical":true,"name":"Initial Draft","automaticSnapshot":false,"preserve":false,"createdAt":"2026-10-11T18:59:51.937Z","savedAt":"2026-10-11T18:59:51.937Z","hasId":true,"contentBin":{"bytes":211,"sha256":"904cb03bdd118c9cf1cd82a0285b7da372c8f5cfbc190f8fd17797fa3553173f"},"contentEquals":["A#2"]}],"otherRevisionDirEntries":[],"revisionContents":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"904cb03bdd118c9cf1cd82a0285b7da372c8f5cfbc190f8fd17797fa3553173f","bytes":211}],"sidecar":{"parsed":true,"wordCount":6,"updatedAt":"2026-10-11T19:00:14.167Z","name":"Doc s1r3-mv46toyp-f90e33","keys":["createdAt","folderId","id","name","orderIndex","slug","type","updatedAt","userMetadata","wordCount"]},"wordCountMatchesDocs":["A#2"],"expectedWordCounts":{"base":4,"A#1":5,"A#2":6,"B#1":5},"contentTiptapJson":{"bytes":343,"sha256":"42cfb77735251e4569616df3406e3911b4270ea72bf527ad20fc346dc06c9f53"},"contentTxt":{"bytes":30,"sha256":"d6bad937ce3eb595d64cc1b56e8ca149e063e1d62c010cda2038c7784502ce29"},"lastProcessed":{"docLabel":"A#2","updatedAt":"2026-10-11T19:00:14.167Z"},"evidence":{"byUpdatedAt":["A20","B20","A23"],"byResponseArrival":["A20","B20","A23"],"bySend":["A20","B20","A23"],"updatedAtValues":["2026-10-11T18:59:58.765Z","2026-10-11T19:00:06.460Z","2026-10-11T19:00:14.167Z"]},"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogEntryTimestamps":["2026-10-11T18:59:58.762Z","2026-10-11T19:00:06.459Z","2026-10-11T19:00:14.165Z"],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"writingLogTokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"A2":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}},"stepStateVerdict_informational":{"verdict":"PASS","reasons":["all four stores hold A#2, the last processed save"],"flags":{"reloadChecked":false}}}
-- Outcome 2, each open editor (text and footer: (a) right after the other client's save was acknowledged, (b) after 30 s, (c) after reload) --
  note: (a) immediately after the other client's save was acknowledged; (5 s) just before the next client typed; (b) 30 s after the LAST save only (the sequence puts the next step at 5 s, so a 30 s read per step is not possible); (c) after reload.
  step0_bothOpen: {"at":"2026-10-11T18:59:56.132Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}
  step1: {"editorsBeforeTyping":{"at":"2026-10-11T18:59:56.135Z","A":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"editorsRightAfterSave":{"at":"2026-10-11T18:59:58.818Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"editorsAt5s":{"at":"2026-10-11T19:00:03.819Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"vsServerRightAfter":{"serverHolds":["A#1"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false}}
  step2: {"editorsBeforeTyping":{"at":"2026-10-11T19:00:03.833Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie","footer":{"full":"Words: 4 | Node: Body | Today's writing Today: 0 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}},"editorsRightAfterSave":{"at":"2026-10-11T19:00:06.531Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 Saved · just now","autosave":"Saved · just now"}}},"editorsAt5s":{"at":"2026-10-11T19:00:11.531Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"vsServerAt5s":{"serverHolds":["B#1"],"A_editorEqualsServerText":false,"B_editorEqualsServerText":true}}
  step3: {"editorsBeforeTyping":{"at":"2026-10-11T19:00:11.539Z","A":{"text":"BASE alpha bravo charlie A1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"editorsRightAfterSave":{"at":"2026-10-11T19:00:14.230Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 Saved · just now","autosave":"Saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"editorsAt5s":{"at":"2026-10-11T19:00:19.231Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · just now","autosave":"All changes saved · just now"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · just now","autosave":"All changes saved · just now"}}},"vsServerAt5s":{"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false}}
  at30sAfterLastSave_noReload: {"at":"2026-10-11T19:00:44.231Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · 10s ago","autosave":"All changes saved · 10s ago"}},"B":{"text":"BASE alpha bravo charlie B1","footer":{"full":"Words: 5 | Node: Body | Today's writing Today: 1 All changes saved · 19s ago","autosave":"All changes saved · 19s ago"}}}
  vsServerAt30s: {"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false}
  afterReload: {"at":"2026-10-11T19:00:46.270Z","A":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}},"B":{"text":"BASE alpha bravo charlie A1 A2","footer":{"full":"Words: 6 | Node: Body | Today's writing Today: 2 All changes saved · not saved yet","autosave":"All changes saved · not saved yet"}}}
  vsServerAfterReload: {"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":true}
-- Outcome 3, notification (surfaces checked are named) --
  A_sinceBsFirstSave: {"sinceAt":"2026-10-11T19:00:06.531Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7648,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":38708,"msAfterReloadMark":995},{"role":"status","text":"Loading diagnostics…","msAfterSince":38709,"msAfterReloadMark":996}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":37782,"msAfterReloadMark":69},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":37813,"msAfterReloadMark":100},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38675,"msAfterReloadMark":962},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38706,"msAfterReloadMark":993}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":37781,"msAfterReloadMark":68},{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":37781,"msAfterReloadMark":68},{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":37781,"msAfterReloadMark":68},{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":37781,"msAfterReloadMark":68},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":37781,"msAfterReloadMark":68}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":37807,"msAfterReloadMark":94}],"patchResponseSignals":[{"n":23,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T19:00:44.244Z","msAfterSince":37713}]}
  B_sinceAsFirstSave: {"sinceAt":"2026-10-11T18:59:58.818Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7650,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":47421,"msAfterReloadMark":964},{"role":"status","text":"Loading diagnostics…","msAfterSince":47421,"msAfterReloadMark":964}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":46506,"msAfterReloadMark":49},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":46535,"msAfterReloadMark":79},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47387,"msAfterReloadMark":931},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47419,"msAfterReloadMark":962}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":46505,"msAfterReloadMark":49},{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":46505,"msAfterReloadMark":49},{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":46505,"msAfterReloadMark":49},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":46505,"msAfterReloadMark":49},{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":46505,"msAfterReloadMark":49}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":46530,"msAfterReloadMark":74}],"patchResponseSignals":[{"n":20,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T19:00:45.274Z","msAfterSince":46456}]}
-- Outcome 4, lost-update shape (did a stale editor's save write its older copy over newer text, and only after typing) --
  note: established from outcome 1 (which document each store held after the step) and the PATCH log (markers in each sent document)
  step2_B_stale_saved: {"documentSentByB":[{"markers":["B1"],"baseWordsPresent":true}],"markersHeldByEachDocument":{"A#1":["A1"],"B#1":["B1"]},"storesHeldAfterStep2":["B#1"],"patchesBByBeforeTypingInStep2":0,"BsEditorTextAtTypingStart":"BASE alpha bravo charlie","BsEditorHeldAsText_A1":false}
  step3_A_stale_saved: {"documentSentByA":[{"markers":["A1","A2"],"baseWordsPresent":true}],"markersHeldByEachDocument":{"A#1":["A1"],"B#1":["B1"],"A#2":["A1","A2"]},"storesHeldAfterStep3":["A#2"],"patchesAByBeforeTypingInStep3":0,"AsEditorTextAtTypingStart":"BASE alpha bravo charlie A1","AsEditorHeldAsText_B1":false}
  everyPatchSentByA: [{"n":20,"sendAt":"2026-10-11T18:59:58.751Z","status":200,"hasDocument":true,"markers":["A1"],"note":null,"msAfterLastTypingEnd":2463,"lastTypingMarker":" A1","afterAReloadMark":false},{"n":23,"sendAt":"2026-10-11T19:00:14.159Z","status":200,"hasDocument":true,"markers":["A1","A2"],"note":null,"msAfterLastTypingEnd":2462,"lastTypingMarker":" A2","afterAReloadMark":false}]
  everyPatchSentByB: [{"n":20,"sendAt":"2026-10-11T19:00:06.455Z","status":200,"hasDocument":true,"markers":["B1"],"note":null,"msAfterLastTypingEnd":2457,"lastTypingMarker":" B1","afterAReloadMark":false}]
-- Outcome 5, side effects (revisions, writing log vs expected, search, wordCount, indexes) --
  afterStep1: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#1"],"sha256":"24505b8ef3ca09018ccb1384d1319dcad28868b03d5b3f433b09cf366d79a038","bytes":208}],"writingLogActual":[{"added":1,"deleted":0,"net":1}],"writingLogExpected":[{"added":1,"deleted":0,"net":1}],"writingLogMatchesExpected":true,"tokens":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]}},"sidecarWordCount":5,"expectedWordCounts":{"base":4,"A#1":5},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}}}
  afterStep2: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["B#1"],"sha256":"d6315ba0dc2b9495d797d4a1efca33e41fd1d118d579b27e8fd8bc8ed30c4859","bytes":208}],"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0}],"writingLogMatchesExpected":true,"tokens":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]}],"search":{"A1":{"status":200,"count":0,"resourceIds":[]},"A2":{"status":200,"count":0,"resourceIds":[]},"B1":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"BASE":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]}},"sidecarWordCount":5,"expectedWordCounts":{"base":4,"A#1":5,"B#1":5},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":5,"topRepeatedWords":[],"heuristicVersion":1}}}
  afterStep3: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"904cb03bdd118c9cf1cd82a0285b7da372c8f5cfbc190f8fd17797fa3553173f","bytes":211}],"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"tokens":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"search":{"A1":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"A2":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]}},"sidecarWordCount":6,"expectedWordCounts":{"base":4,"A#1":5,"A#2":6,"B#1":5},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}}}
  afterReload: {"revisions":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"904cb03bdd118c9cf1cd82a0285b7da372c8f5cfbc190f8fd17797fa3553173f","bytes":211}],"writingLogActual":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogExpected":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"writingLogMatchesExpected":true,"search":{"A1":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"A2":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]},"B1":{"status":200,"count":0,"resourceIds":[]},"BASE":{"status":200,"count":1,"resourceIds":["d526f7db-ca42-46eb-8bef-bd3a63090ed7"]}},"mentionIndex":{"filePresent":true,"recordsForResource":[]},"diagnosticsIndex":{"filePresent":true,"recordForResource":{"dialogueRatio":0,"averageSentenceLength":6,"topRepeatedWords":[],"heuristicVersion":1}}}
  indexesComparedToPlainText: not compared by the harness (diagnostics heuristics are TypeScript and not ported; the fixture declares no entity so the mention index holds no record); raw records are printed
-- Outcome 6, failed saves (non-2xx: status and truncated body; what the client showed) --
  failedSavesA: []
  failedSavesB: []
  result: no failed save
-- verdict inputs --
  {"saves":[{"id":"A20","docLabel":"A#1","updatedAt":"2026-10-11T18:59:58.765Z","sendT":1791745198751.1316,"respT":1791745198768.11},{"id":"A23","docLabel":"A#2","updatedAt":"2026-10-11T19:00:14.167Z","sendT":1791745214159.0378,"respT":1791745214169.996},{"id":"B20","docLabel":"B#1","updatedAt":"2026-10-11T19:00:06.460Z","sendT":1791745206455.3015,"respT":1791745206462.4685}],"lastProcessed":{"docLabel":"A#2","updatedAt":"2026-10-11T19:00:14.167Z"},"evidence":{"byUpdatedAt":["A20","B20","A23"],"byResponseArrival":["A20","B20","A23"],"bySend":["A20","B20","A23"],"updatedAtValues":["2026-10-11T18:59:58.765Z","2026-10-11T19:00:06.460Z","2026-10-11T19:00:14.167Z"]},"sendOrderAgreesWithUpdatedAt":true,"documentHashes":{"base":"2642f35db296aa8e807fcee83ca02fcc876fee0e6793a3726c3993d2481fabe1","A#1":"24505b8ef3ca09018ccb1384d1319dcad28868b03d5b3f433b09cf366d79a038","A#2":"904cb03bdd118c9cf1cd82a0285b7da372c8f5cfbc190f8fd17797fa3553173f","B#1":"d6315ba0dc2b9495d797d4a1efca33e41fd1d118d579b27e8fd8bc8ed30c4859"},"requireReload":true,"reloadTexts":{"A":"BASE alpha bravo charlie A1 A2","B":"BASE alpha bravo charlie A1 A2"}}
-- verdict (against the Task 1 definition) --
  {"verdict":"PASS","reasons":["all four stores hold A#2, the last processed save"],"flags":{"reloadChecked":true}}
-- findings, raw observations, NO verdict --
  a_stale_editor_replaced_other_text_on_a_keystroke: {"step2_B":{"storesHeldAfter":["B#1"],"BsDocumentMarkers":[["B1"]],"A1_in_BsDocument":false,"A1_in_serverPlainAfterStep2":false},"step3_A":{"storesHeldAfter":["A#2"],"AsDocumentMarkers":[["A1","A2"]],"B1_in_AsDocument":false,"B1_in_serverPlainAfterStep3":false},"varied":"nothing (in turn, 5 s gaps, short additions)"}
  b_saves_sent_with_no_typing: {"patchesA":[{"n":20,"hasDocument":true,"markers":["A1"],"msAfterLastTypingEnd":2463,"afterAReloadMark":false},{"n":23,"hasDocument":true,"markers":["A1","A2"],"msAfterLastTypingEnd":2462,"afterAReloadMark":false}],"patchesB":[{"n":20,"hasDocument":true,"markers":["B1"],"msAfterLastTypingEnd":2457,"afterAReloadMark":false}],"typingActions":{"A":[" A1"," A2"],"B":[" B1"]},"patchesBeforeFirstTyping":{"A":0,"B":0},"idleApiRequestsNote":"see requestLogA / requestLogB in extra facts for every request"}
  c_overwritten_device_told_anything: {"B_overwrittenAtStep3":{"sinceAt":"2026-10-11T18:59:58.818Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7650,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":47421,"msAfterReloadMark":964},{"role":"status","text":"Loading diagnostics…","msAfterSince":47421,"msAfterReloadMark":964}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":46506,"msAfterReloadMark":49},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":46535,"msAfterReloadMark":79},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47387,"msAfterReloadMark":931},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":47419,"msAfterReloadMark":962}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":46505,"msAfterReloadMark":49},{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":46505,"msAfterReloadMark":49},{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":46505,"msAfterReloadMark":49},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":46505,"msAfterReloadMark":49},{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":46505,"msAfterReloadMark":49}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":46530,"msAfterReloadMark":74}],"patchResponseSignals":[{"n":20,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T19:00:45.274Z","msAfterSince":46456}]},"A_overwrittenAtStep2":{"sinceAt":"2026-10-11T19:00:06.531Z","surfacesChecked":"role=status/alert/alertdialog/dialog elements (MutationObserver, incl. toasts), JS dialogs, console errors+warnings, page errors, failed requests, non-2xx responses, footer text (read at steps), snapshotCreated flags","surfaces":[{"role":"status","text":"Loading diagnostics…","msAfterSince":7648,"msAfterReloadMark":null},{"role":"status","text":"Loading this document…","msAfterSince":38708,"msAfterReloadMark":995},{"role":"status","text":"Loading diagnostics…","msAfterSince":38709,"msAfterReloadMark":996}],"console":[{"type":"error","text":"Error fetching projects: TypeError: Failed to fetch","msAfterSince":37782,"msAfterReloadMark":69},{"type":"error","text":"Failed to load resource: the server responded with a status of 404 (Not Found)","msAfterSince":37813,"msAfterReloadMark":100},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38675,"msAfterReloadMark":962},{"type":"warning","text":"[react-tooltip] Do not set `style.border`. Use `border` prop instead.","msAfterSince":38706,"msAfterReloadMark":993}],"pageErrors":[],"dialogs":[],"failedRequests":[{"method":"GET","path":"/api/projects","error":"net::ERR_ABORTED","msAfterSince":37781,"msAfterReloadMark":68},{"method":"GET","path":"/api/auth-status","error":"net::ERR_ABORTED","msAfterSince":37781,"msAfterReloadMark":68},{"method":"GET","path":"/api/sharing/limits","error":"net::ERR_ABORTED","msAfterSince":37781,"msAfterReloadMark":68},{"method":"GET","path":"/api/version-check","error":"net::ERR_ABORTED","msAfterSince":37781,"msAfterReloadMark":68},{"method":"GET","path":"/api/encryption","error":"net::ERR_ABORTED","msAfterSince":37781,"msAfterReloadMark":68}],"nonOkResponses":[{"method":"GET","path":"/api/auth/get-session","status":404,"body":"","msAfterSince":37807,"msAfterReloadMark":94}],"patchResponseSignals":[{"n":23,"snapshotCreated":false,"writingLog":null}],"reloadMarks":[{"name":"page.reload","at":"2026-10-11T19:00:44.244Z","msAfterSince":37713}]},"note":"full lists are in outcome 3; surfaces named there"}
  d_overwritten_text_recoverable: {"afterStep2":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["B#1"],"sha256":"d6315ba0dc2b9495d797d4a1efca33e41fd1d118d579b27e8fd8bc8ed30c4859","bytes":208}],"afterStep3":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"904cb03bdd118c9cf1cd82a0285b7da372c8f5cfbc190f8fd17797fa3553173f","bytes":211}],"afterReload":[{"dir":"v-1","canonical":true,"name":"Initial Draft","automaticSnapshot":false,"status":"equals","equals":["A#2"],"sha256":"904cb03bdd118c9cf1cd82a0285b7da372c8f5cfbc190f8fd17797fa3553173f","bytes":211}],"revisionDirListingAfterReload":[{"dir":"v-1","name":"Initial Draft","automaticSnapshot":false,"isCanonical":true,"contentEquals":["A#2"]}]}
  e_overwritten_editor_shows_text_the_server_no_longer_holds: {"afterStep2_A_editor":false,"A_editorTextAfterStep2":"BASE alpha bravo charlie A1","afterStep3_B_editor":false,"B_editorTextAfterStep3":"BASE alpha bravo charlie B1","at30s_noReload":{"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":false},"afterReload":{"serverHolds":["A#2"],"A_editorEqualsServerText":true,"B_editorEqualsServerText":true}}
  f_writing_log_effect: {"actualAfterStep3":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"expectedAfterStep3":[{"added":1,"deleted":0,"net":1},{"added":1,"deleted":1,"net":0},{"added":2,"deleted":1,"net":1}],"tokensByProcessedSave":[{"save":"A#1","addedTokens":["A1"],"deletedTokens":[]},{"save":"B#1","addedTokens":["B1"],"deletedTokens":["A1"]},{"save":"A#2","addedTokens":["A1","A2"],"deletedTokens":["B1"]}],"matchesExpected":true}
  g_failed_save_on_the_device_the_writer_believes_is_last: {"failedSavesA":[],"failedSavesB":[],"result":"none"}
-- extra facts --
  preChecks: {"listeners7340":"none","listeners3000":"none","chosenPort":63453,"chosenPortListenersBeforeStart":"none (checked immediately before start)","serverPidsRecorded":[{"pid":46871,"comm":"next-server (v16.2.6)"}],"browserPidsRecorded":[{"pid":46889,"comm":"chrome-headless-shell"},{"pid":46890,"comm":"chrome-headless-shell"},{"pid":46891,"comm":"chrome-headless-shell"},{"pid":46941,"comm":"chrome-headless-shell"},{"pid":46943,"comm":"chrome-headless-shell"}],"clientsPaired":{"A":{"paired":true,"deviceCookiePresent":true},"B":{"paired":true,"deviceCookiePresent":true}},"throwawayRootAsserted":"/private/tmp/getwrite-two-client/s1r3-mv46toyp-f90e33"}
requestLogA
  #1 GET /api/auth/get-session send 18:59:54.068Z resp 18:59:54.081Z 404
  #2 GET /api/encryption send 18:59:54.081Z resp 18:59:54.082Z 200
  #3 GET /api/version-check send 18:59:54.081Z resp 18:59:54.086Z 200
  #4 GET /api/auth-status send 18:59:54.081Z resp 18:59:54.087Z 200
  #5 GET /api/projects send 18:59:54.081Z resp 18:59:54.088Z 200
  #6 GET /api/sharing/limits send 18:59:54.081Z resp 18:59:54.086Z 200
  #7 POST /api/project send 18:59:54.921Z resp 18:59:54.930Z 200
  #8 GET /api/project/PRJ/entity-alias-table send 18:59:54.941Z resp 18:59:54.982Z 200
  #9 GET /api/project/PRJ/entity-alias-table send 18:59:54.957Z resp 18:59:54.984Z 200
  #10 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:59:54.957Z resp 18:59:54.984Z 200
  #11 POST /api/project/tags send 18:59:54.957Z resp 18:59:54.984Z 200
  #12 POST /api/project/query/saved send 18:59:54.957Z resp 18:59:54.984Z 200
  #13 POST /api/project-resources send 18:59:55.013Z resp 18:59:55.024Z 200
  #14 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:59:55.013Z resp 18:59:55.023Z 200
  #15 POST /api/project-resources send 18:59:55.013Z resp 18:59:55.024Z 200
  #16 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:59:55.013Z resp 18:59:55.023Z 200
  #17 POST /api/project/tags send 18:59:55.013Z resp 18:59:55.022Z 200
  #18 POST /api/project/tags send 18:59:55.013Z resp 18:59:55.023Z 200
  #19 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:59:55.025Z resp 18:59:55.050Z 200
  #20 PATCH /api/resource/revision/R1 send 18:59:58.751Z resp 18:59:58.768Z 200 updatedAt=2026-10-11T18:59:58.765Z snapshotCreated=False writingLog=null doc{len=208,sha256=24505b8ef3ca09018ccb1384d1319dcad28868b03d5b3f433b09cf366d79a038,markers=["A1"]}
  #21 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:59:58.773Z resp 18:59:58.778Z 200
  #22 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:59:58.773Z resp 18:59:58.779Z 200
  #23 PATCH /api/resource/revision/R1 send 19:00:14.159Z resp 19:00:14.169Z 200 updatedAt=2026-10-11T19:00:14.167Z snapshotCreated=False writingLog=null doc{len=211,sha256=904cb03bdd118c9cf1cd82a0285b7da372c8f5cfbc190f8fd17797fa3553173f,markers=["A1", "A2"]}
  #24 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 19:00:14.175Z resp 19:00:14.181Z 200
  #25 GET /api/resource/R1/diagnostics?projectId=PRJ send 19:00:14.175Z resp 19:00:14.181Z 200
  #26 GET /api/encryption send 19:00:44.312Z resp  - null net::ERR_ABORTED
  #27 GET /api/version-check send 19:00:44.312Z resp  - null net::ERR_ABORTED
  #28 GET /api/auth-status send 19:00:44.312Z resp  - null net::ERR_ABORTED
  #29 GET /api/projects send 19:00:44.312Z resp  - null net::ERR_ABORTED
  #30 GET /api/sharing/limits send 19:00:44.312Z resp  - null net::ERR_ABORTED
  #31 GET /api/encryption send 19:00:44.337Z resp 19:00:44.340Z 200
  #32 GET /api/version-check send 19:00:44.337Z resp 19:00:44.342Z 200
  #33 GET /api/auth-status send 19:00:44.337Z resp 19:00:44.342Z 200
  #34 GET /api/projects send 19:00:44.337Z resp 19:00:44.346Z 200
  #35 GET /api/sharing/limits send 19:00:44.337Z resp 19:00:44.344Z 200
  #36 GET /api/auth/get-session send 19:00:44.338Z resp 19:00:44.344Z 404
  #37 POST /api/project send 19:00:45.190Z resp 19:00:45.198Z 200
  #38 GET /api/project/PRJ/entity-alias-table send 19:00:45.206Z resp 19:00:45.214Z 200
  #39 GET /api/project/PRJ/entity-alias-table send 19:00:45.213Z resp 19:00:45.220Z 200
  #40 POST /api/project/PRJ-MANIFEST-ID/reindex send 19:00:45.213Z resp 19:00:45.220Z 200
  #41 POST /api/project/tags send 19:00:45.213Z resp 19:00:45.220Z 200
  #42 POST /api/project/query/saved send 19:00:45.213Z resp 19:00:45.218Z 200
  #43 POST /api/project-resources send 19:00:45.240Z resp 19:00:45.251Z 200
  #44 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 19:00:45.240Z resp 19:00:45.250Z 200
  #45 POST /api/project-resources send 19:00:45.240Z resp 19:00:45.251Z 200
  #46 GET /api/resource/R1/diagnostics?projectId=PRJ send 19:00:45.240Z resp 19:00:45.251Z 200
  #47 POST /api/project/tags send 19:00:45.240Z resp 19:00:45.250Z 200
  #48 POST /api/project/tags send 19:00:45.240Z resp 19:00:45.249Z 200
  #49 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 19:00:45.251Z resp 19:00:45.267Z 200
requestLogB
  #1 GET /api/auth/get-session send 18:59:55.147Z resp 18:59:55.159Z 404
  #2 GET /api/encryption send 18:59:55.159Z resp 18:59:55.160Z 200
  #3 GET /api/version-check send 18:59:55.159Z resp 18:59:55.163Z 200
  #4 GET /api/auth-status send 18:59:55.159Z resp 18:59:55.164Z 200
  #5 GET /api/projects send 18:59:55.159Z resp 18:59:55.165Z 200
  #6 GET /api/sharing/limits send 18:59:55.159Z resp 18:59:55.164Z 200
  #7 POST /api/project send 18:59:56.001Z resp 18:59:56.007Z 200
  #8 GET /api/project/PRJ/entity-alias-table send 18:59:56.017Z resp 18:59:56.057Z 200
  #9 GET /api/project/PRJ/entity-alias-table send 18:59:56.032Z resp 18:59:56.059Z 200
  #10 POST /api/project/PRJ-MANIFEST-ID/reindex send 18:59:56.032Z resp 18:59:56.059Z 200
  #11 POST /api/project/tags send 18:59:56.032Z resp 18:59:56.059Z 200
  #12 POST /api/project/query/saved send 18:59:56.032Z resp 18:59:56.059Z 200
  #13 POST /api/project-resources send 18:59:56.089Z resp 18:59:56.096Z 200
  #14 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 18:59:56.089Z resp 18:59:56.096Z 200
  #15 POST /api/project-resources send 18:59:56.089Z resp 18:59:56.096Z 200
  #16 GET /api/resource/R1/diagnostics?projectId=PRJ send 18:59:56.089Z resp 18:59:56.096Z 200
  #17 POST /api/project/tags send 18:59:56.089Z resp 18:59:56.095Z 200
  #18 POST /api/project/tags send 18:59:56.089Z resp 18:59:56.095Z 200
  #19 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 18:59:56.097Z resp 18:59:56.122Z 200
  #20 PATCH /api/resource/revision/R1 send 19:00:06.455Z resp 19:00:06.462Z 200 updatedAt=2026-10-11T19:00:06.460Z snapshotCreated=False writingLog=null doc{len=208,sha256=d6315ba0dc2b9495d797d4a1efca33e41fd1d118d579b27e8fd8bc8ed30c4859,markers=["B1"]}
  #21 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 19:00:06.466Z resp 19:00:06.470Z 200
  #22 GET /api/resource/R1/diagnostics?projectId=PRJ send 19:00:06.466Z resp 19:00:06.471Z 200
  #23 GET /api/encryption send 19:00:45.323Z resp  - null net::ERR_ABORTED
  #24 GET /api/version-check send 19:00:45.323Z resp  - null net::ERR_ABORTED
  #25 GET /api/auth-status send 19:00:45.323Z resp  - null net::ERR_ABORTED
  #26 GET /api/projects send 19:00:45.323Z resp  - null net::ERR_ABORTED
  #27 GET /api/sharing/limits send 19:00:45.323Z resp  - null net::ERR_ABORTED
  #28 GET /api/encryption send 19:00:45.346Z resp 19:00:45.350Z 200
  #29 GET /api/version-check send 19:00:45.346Z resp 19:00:45.351Z 200
  #30 GET /api/auth-status send 19:00:45.346Z resp 19:00:45.351Z 200
  #31 GET /api/projects send 19:00:45.346Z resp 19:00:45.353Z 200
  #32 GET /api/sharing/limits send 19:00:45.346Z resp 19:00:45.352Z 200
  #33 GET /api/auth/get-session send 19:00:45.348Z resp 19:00:45.353Z 404
  #34 POST /api/project send 19:00:46.194Z resp 19:00:46.199Z 200
  #35 GET /api/project/PRJ/entity-alias-table send 19:00:46.205Z resp 19:00:46.213Z 200
  #36 GET /api/project/PRJ/entity-alias-table send 19:00:46.211Z resp 19:00:46.219Z 200
  #37 POST /api/project/PRJ-MANIFEST-ID/reindex send 19:00:46.211Z resp 19:00:46.219Z 200
  #38 POST /api/project/tags send 19:00:46.211Z resp 19:00:46.219Z 200
  #39 POST /api/project/query/saved send 19:00:46.211Z resp 19:00:46.217Z 200
  #40 POST /api/project-resources send 19:00:46.239Z resp 19:00:46.249Z 200
  #41 GET /api/project/writing-log?projectId=PRJ&from=2026-10-11T06%3A00%3A00.000Z&to=2026-10-12T06%3A00%3A00.000Z send 19:00:46.239Z resp 19:00:46.248Z 200
  #42 POST /api/project-resources send 19:00:46.240Z resp 19:00:46.250Z 200
  #43 GET /api/resource/R1/diagnostics?projectId=PRJ send 19:00:46.240Z resp 19:00:46.249Z 200
  #44 POST /api/project/tags send 19:00:46.240Z resp 19:00:46.248Z 200
  #45 POST /api/project/tags send 19:00:46.240Z resp 19:00:46.248Z 200
  #46 GET /api/resource/revision/R1?projectId=PRJ&revisionId=REV-R1 send 19:00:46.250Z resp 19:00:46.263Z 200
  labelsRegistered: [{"label":"PRJ","idLength":36},{"label":"PRJ-MANIFEST-ID","idLength":36},{"label":"R1","idLength":36},{"label":"REV-R1","idLength":36}]
  pageReloadMarks: {"A":[{"name":"page.reload","t":1791745244244.4236,"at":"2026-10-11T19:00:44.244Z"}],"B":[{"name":"page.reload","t":1791745245274.721,"at":"2026-10-11T19:00:45.274Z"}]}
  visibilityEvents: {"A":[{"t":1791745193978,"state":"hidden","at":"2026-10-11T18:59:53.978Z","msAfterReloadMark":null},{"t":1791745244259,"state":"hidden","at":"2026-10-11T19:00:44.259Z","msAfterReloadMark":15},{"t":1791745244312,"state":"hidden","at":"2026-10-11T19:00:44.312Z","msAfterReloadMark":68}],"B":[{"t":1791745195066,"state":"hidden","at":"2026-10-11T18:59:55.066Z","msAfterReloadMark":null},{"t":1791745245282,"state":"hidden","at":"2026-10-11T19:00:45.282Z","msAfterReloadMark":7},{"t":1791745245323,"state":"hidden","at":"2026-10-11T19:00:45.323Z","msAfterReloadMark":48}]}
  timelineSummary: {"stepGapsMs":[{"step":1,"who":"A","msSinceLastSaveAckWhenTypingStarted":null},{"step":2,"who":"B","msSinceLastSaveAckWhenTypingStarted":5015},{"step":3,"who":"A","msSinceLastSaveAckWhenTypingStarted":5008}]}
  teardown: {"errors":[],"browserPidsRecorded":5,"browserPidsAliveAfterClose":[],"browserPidsAliveAfterTerm":[],"server":{"recorded":[{"pid":46871,"comm":"next-server (v16.2.6)"}],"stillAliveAfterTerm":[],"stillAliveAfterKill":[],"portListenersAfter":[],"listeners7340After":[],"listeners3000After":[]},"listeners7340After":[],"listeners3000After":[],"cleanup":{"removed":true,"path":"/private/tmp/getwrite-two-client/s1r3-mv46toyp-f90e33"}}
====================================================================================================
JSON written: /Users/jedaisaboteur/Repositories/getwrite/specs/features/two-client-save-measurement/results/s1/s1r3-mv46toyp-f90e33-rep03.json

```

### git status (S1)

`git status --short` after Task 3 (nothing outside `specs/`; `experiments.md` is the only modified tracked file):

```
 M specs/features/two-client-save-measurement/experiments.md
?? specs/features/two-client-save-measurement/results/s1/
?? specs/features/two-client-save-measurement/scripts/s1-in-turn.mjs
```

### Task 3 done-when, item by item

1. Server stated (built standalone, free port chosen, host to itself): "Server" paragraph and process table above.
2. Per repetition (3, fresh resource, base `BASE alpha bravo charlie`): pre-check results for 7340, 3000 and the chosen port (table; `preChecks` in each record); the sequence with measured times (the steps lists in the pasted records; gaps between acknowledgement and next typing 5007 to 5015 ms); the six outcomes after each step (outcome sections in each record, summarised in the tables, nothing removed from the records).
3. Verdict per repetition and scenario with the raw observation beside it: PASS x3, scenario PASS (stable), with the stated loose bound.
4. Findings (a) to (g) listed with no verdict, including the editor text at the moment B started typing (`BASE alpha bravo charlie`, A's ` A1` not in it).
5. Causes: none named; hypotheses labelled with the discriminating experiment.
6. "Not run / not varied": roles reversed, idle length, other documents, client type, project type (plain only), Firefox and Safari are in the lists.
7. Servers and contexts stopped by recorded pids, throwaway folders removed, ports confirmed free: process table and the post-run checks above.
8. `git status --short` shows no change outside `specs/`: pasted above.
9. Harness fault found: the mislabelled field; the first set of three repetitions was discarded and re-run; stated above.
