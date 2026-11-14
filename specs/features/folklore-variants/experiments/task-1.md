# Task 1: FR-1 (a), (d), (f), (g), (i)

Results of reads and throwaway probes. Base commit `64823bc0`, node v24.15.0, pnpm 10.28.0, vitest v4.1.6. No production file was edited. Probe source: `probe-task1.test.ts` (outside the repository; copied to `frontend/tests/unit/zz-probe-task1.test.ts` for one `pnpm exec vitest run` from `frontend/`, 5 tests passed, then removed; output lines below are from its `.out` file). A line marked READ was read in source and not run. No cause is written as a cause.

## Stop-point finding for Task 5 (FR-1 (i)), stated first

- Measured (probe): the shell's off-view predicate, applied to a third module view with `defaultEnabled: false`, says "off" with no entry and "on" with `folklore: true` (rows (i)-1 to (i)-3 below). The fallback effect in `AppShell.tsx:555-571` is written over `moduleViews.registered` and `moduleViews.enabled`, with no view id named, so READ: it needs no code for a third view.
- READ, not run: rendering a third module view is not generic. `AppShell.tsx:1604` (the outer condition) and `AppShell.tsx:1774` (the module-view branch) each name the view ids `trash`, `sources` and `claims` literally. A view id not in those lists has no render path: with a resource selected it reaches the `default` branch of the switch at `AppShell.tsx:1837` (a bare "Work Area" heading); with none selected the outer condition at `:1595-1605` is false.
- Consequence for the task list: `frontend/components/Layout/AppShell.tsx` is in the `Files` of neither Task 5 nor Task 20 (`tasks.md`). A third module view that renders needs an AppShell edit, and its `ViewName` entry is Task 5's. This is the case Task 5's Notes say to stop on ("if Task 1 (i) records that the shell fallback needs code for a third view"). Strictly the fallback needs none; the render does. This is returned to the owner as a decision.

## (a) Readers of `config.modules` and callers of the module registry

Commands: `grep -rnE "isModuleEnabled|useModuleEnabled|useModuleViews|enabledViews|indexSteps" src components app --include='*.ts' --include='*.tsx'` from `frontend/`; the same pattern plus `\.modules\b` over `cli/src` and `electron/src`; `grep -rnE "\bmodules\b"` over `src components app`, comments and the registry files excluded.

Readers and writers of `config.modules` (production):

| Site | Role |
| --- | --- |
| `src/lib/models/types.ts:157`, `src/lib/models/schemas.ts:436`, `src/lib/api/schemas.ts:250` | type and Zod schemas, `Record<string, boolean>`, optional |
| `src/store/projectsSlice.ts:113,180,780-787,1129` | stored copy, `setProjectModules`, `selectActiveProjectModules` |
| `src/lib/models/module-config-core.ts:105-114` | the only writer of an entry (`setModuleEnabledCore`), id checked against `MODULE_ID_PATTERN` |
| `src/lib/models/project-creator.ts:287-290` | writes `config.modules` once at creation from a project type's `modules` record |
| `src/lib/models/derived-index-rebuild.ts:79-91` (`readModulesConfig`) | reads it for `registry.indexSteps` |
| `src/lib/models/indexer-queue.ts:272-278` | reads it for `moduleRegistry.indexSteps` |
| `components/project-types/ProjectTypeDraftService.ts:260-306`, `ProjectTypeEditorForm.tsx:680-712` | edit a project type's `modules` record, one row per `MODULE_MANIFEST` entry |
| `src/lib/api/modules.ts`, `src/store/transport/native-modules-backend.ts` | transport of the write |

Production calls of the five names:

| Name | Production calls |
| --- | --- |
| `isModuleEnabled` | `registry.ts:92` (definition), `registry.ts:128` (inside `createModuleRegistry`), `components/Modules/useModuleEnabled.ts:19`, `components/Modules/useEnabledModuleViews.ts:41`, `components/Editor/Annotations/useAnnotationsPanel.ts:415` |
| `useModuleEnabled` | `components/Modules/ModuleSwitchSection.tsx:41`, `components/Editor/Citations/CitationControlSlot.tsx:38` |
| `useModuleViews` | `components/Layout/AppShell.tsx:358` (one call) |
| `registry.enabledViews` | no production caller; defined at `registry.ts:109,133`, used only in tests |
| `registry.indexSteps` | `derived-index-rebuild.ts:272`, `indexer-queue.ts:275` (both guarded by `registry.modules.some((m) => m.indexSteps.length > 0)`) |
| `registry.arrangements` (not in the FR list, read for completeness) | `project-creator.ts:500` |

`grep` over `cli/src` and `electron/src` for the five names and `\.modules\b`: 0 matches.

Does a third module with `defaultEnabled: false` need a change in any of them? Observed through the probe (rows (a)-1 to (a)-4) and READ of the table above: every call above takes the module id or the manifest as data; `moduleDefaultEnabled` (`registry.ts:75-80`) reads `defaultEnabled` from the manifest entry. No call site needs a change for the id `folklore`. The module-specific, non-generic sites found are different from these callers: `ViewName` (`types.ts:260-274`), the two literal id lists in `AppShell.tsx` (`:1604`, `:1774`), `uiRegistry.ts` entries, and `AnnotationsPanel.tsx:113` (`CLAIMS_MODULE_ID`, Claims only).

Probe output:

- (a)-1 `registered => ["sources","claims","folklore"]` (manifest plus a `folklore` entry with `defaultEnabled: false`, empty `indexSteps`)
- (a)-2 `enabled, no entry => ["sources"]`
- (a)-3 `enabled, folklore true => ["sources","folklore"]`
- (a)-4 `enabled, sources false and folklore true => ["folklore"]`; `isModuleEnabled no entry => false`

## (d) A Narrative folder and a Variant Source after the project's subtype list loses the label and gains another

Probe of `normalizeSubtypeLabel`, `isLabelInList`, `isFieldVisibleForSubtype` (`src/lib/models/field-subtype-scope.ts`). List before: `["Narrative","Variant"]`; list after: `["Tale","Variant"]` (Narrative removed, Tale added). Stored labels tried: `"Narrative"`, `"  narrative "`, `"NARRATIVE"`, `"Variant"`.

- `normalize => ["narrative","narrative","narrative","variant"]`
- `isLabelInList before => [true,true,true,true]`
- `isLabelInList after => [false,false,false,true]`
- `isFieldVisibleForSubtype("x", ["Narrative"], "Narrative") => true` (no list argument exists)
- `isFieldVisibleForSubtype("x", ["Tale"], "Narrative") => false`
- `isFieldVisibleForSubtype("teller", ["Variant"], "Variant") => true`; with `["variant"]` also `true`
- `isFieldVisibleForSubtype("x", ["Variant"], undefined) => false`

What this shows: matching by `normalizeSubtypeLabel` of the stored label against the literal `"Narrative"` or `"Variant"` is unchanged by the list; matching a stored label against the current list (`isLabelInList`) turns false for `Narrative` once it leaves the list. `isFieldVisibleForSubtype` takes no list, so the Variant-limited fields keep showing for a stored `Variant` whatever the list holds. READ (`docs/features/resource-subtype.md` lines 54-56): removing a label from the list rewrites nothing, so the folder's and the Source's stored label stays and the sidebar shows it as "(not in the current list)". Which of the two matchings the module uses is OQ-1 and is not decided here; the module that matches against the literal name keeps recognising a folder and a Source after the list change, the module that matches against the list stops recognising a Narrative folder.

## (f) Does `userMetadata` of a resource in the store reflect a sidebar edit without a reload?

Stated for Task 15: **store**.

Evidence: READ `frontend/app/(app)/page.tsx:534-650`. `updateResource` (used by `handleChangeDynamicMetadata` at `:693`, `handleChangeStatus` and the others) calls `updateSidecar(...)` and, in the same synchronous run, `dispatch(updateResourceInStore(applyUpdate(resource)))` (`:629`), whose reducer (`resourcesSlice.ts:138-152`) merges the payload into `state.resources`. The store is therefore updated before the sidecar write resolves; on a failed write `revertUnsavedChange` puts the keys back and a toast shows (`:608-624`). The subtype control writes the sidecar first and patches Redux after it resolves (`docs/features/resource-subtype.md` line 47, READ). Run: `pnpm exec vitest run tests/page-stale-sidecar-save.test.tsx` from `frontend/`: 1 file, 8 tests passed; it asserts the Redux copy and the next payload after sidebar edits (including "a dropped userMetadata field and status survive a later edit of another field"). Not measured: an edit made in another window, on a paired device or by the CLI is not in the store until a reload (no subscription exists; READ, not run). Task 15's note: a list read from the store follows edits made in this window only.

## (g) Canonical revision text versus `content.txt`; `fetchResourceContent` failure shapes

All rows from the probe against a real temporary project (`createResourceCore` of a Source, files under `resources/<id>/` and `revisions/<id>/v-1/`), except the client mapping, which is READ.

Files of a new Source: `resources/<id>/` holds `content.tiptap.json`, `content.txt`; `revisions/<id>/v-1/` holds `content.bin`, `metadata.json`; `v-1` is canonical.

Can the canonical revision text and `content.txt` differ? Yes, observed in two ways:

- Canonical save with a non-TipTap payload: after `updateRevisionInPlace(..., "plain legacy payload")`, `content.bin => "plain legacy payload"` while `content.txt => "edited via canonical save"` (the earlier value). READ `revision-core.ts:123-150`: the derived-file sync is skipped when the content is not a TipTap document.
- Derived file edited outside the revision path: with `content.txt` rewritten on disk, core `plaintextContent => "changed on disk only"` while the canonical `content.bin => "plain legacy payload"`.
- Agreement case: after a canonical save of a TipTap document, `content.bin` held the document with text `edited via canonical save` and `content.txt => "edited via canonical save"`.

`fetchResourceContentCore` (the core under `fetchResourceContent`), per input:

| Input | Observed |
| --- | --- |
| missing canonical revision: `metadata.json` of `v-1` removed | returns, `revisions` length 0 (`missing metadata.json -> core revisions => 0`) |
| missing canonical revision: whole `revisions/<id>` removed | returns, `revisions` length 0 |
| missing `v-N` file: `content.bin` removed | core returns and still lists the revision with `canon: true`; `readRevision` then throws code `ENOENT` (the revision-content read, which `fetchRevisionContent` reaches, fails; the resource read does not) |
| unparseable `content.tiptap.json` (`{not json`) | returns `tipTap: null`, `plain: "first words"`, 1 revision |
| `content.tiptap.json` holding `{}` | returns `tipTap: {}` |
| unparseable canonical `content.bin` (`{broken`) | `readRevision` returns the raw string `{broken` (no parse in the core) |
| no content files and no revisions | returns `{"resourceContent":{"tipTapContent":null,"plaintextContent":null},"revisions":[]}`; did not throw (the doc comment at `resource-crud-core.ts:918-922` says it throws; observed: it did not) |
| locked encrypted project (keyring locked) | throws `ProjectLockedError`, `isLockedAccessError` true |

Client mapping, READ (not run): `fetchResourceContent` (`src/lib/api/resources.ts:694-704`) wraps the transport in `try { ... } catch { return null }`. HTTP transport: a non-ok response returns `null` (`:390`); the route lets a locked error propagate (`app/api/project-resources/route.ts:46-48`, mapped to 401 per `tests/unit/project-resources-route.test.ts`), so a locked project reaches the client as `null`. Native backend (`native-resource-backend.ts:187-197`): any throw returns `null`. So, as read, a locked project, a failed read and a thrown fetch give the same client value `null`, distinct from the core's "missing canonical" and "unparseable" cases which return a value. `fetchRevisionContent` likewise returns `null` on any failure (`:717-732`). This is the failure-visibility hazard Tasks 8 to 11 are written around; they must not reuse `fetchResourceContent`.

## (i) Shell fallback for an open view that is switched off, third module view

Probe of the predicate used at `AppShell.tsx:555-557` (`registered` has the view, `enabled` does not), with a third entry `folklore`, `defaultEnabled: false`:

- (i)-1 `registered => ["sources","claims","folklore"]`
- (i)-2 `isOff(folklore open, no entry) => true`
- (i)-3 `isOff(folklore open, on) => false`

READ of the effect itself (`AppShell.tsx:549-571`): when `isOff(current)`, it sets the view to `viewForSelection("edit", selectedType)`, or `"data"` with no selected resource. It names no view id, so the fallback does not need code for a third view (read; the effect was not mounted in this task, and the existing `tests/work-area-view-gating.test.tsx` pins it for `sources` only, lines 560-700). The render path is the separate matter stated at the top: two literal id lists in `AppShell.tsx` (`:1604`, `:1774`) and the `ViewName` union (`types.ts:260-274`).

## Not run

`next build`, Storybook, e2e, any device or WebView; the AppShell effect with a third view mounted; the locked project through the HTTP route or the native backend.
