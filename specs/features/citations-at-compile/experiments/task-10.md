# Task 10: FR-3 (a), (b) before, (h)

Date: 2026-11-14. Reads and one throwaway probe; no production file edited. All paths are under `frontend/` unless stated. Line numbers are from the worktree at commit `962a910f`.

Each item is an observed value with the command that produced it. Where this file says what a fourth module needs, that is a reading of the code until Task 14's tests run.

## (a) Readers of module state

Command (from `frontend/`): `grep -rnE "config\??\.modules|isModuleEnabled|useModuleEnabled|useModuleViews|useEnabledModuleViews|enabledViews|indexSteps|MODULE_MANIFEST|readModulesConfig|\.arrangements\(|moduleManifest|\.modules\b" app components src ../cli/src ../electron/src`, then each hit opened. `../cli/src` and `../electron/src` returned no hit.

### Production calls of `isModuleEnabled`

| Site | Observed |
|---|---|
| `src/lib/models/modules/registry.ts:92` | the definition; reads `config?.modules` own-property, else `moduleDefaultEnabled(id, manifest)` (`manifest.find(...)?.defaultEnabled !== false`; an id not in the manifest reads as on) |
| `src/lib/models/modules/registry.ts:128` | inside `createModuleRegistry`'s `enabled(config)`, which feeds `enabledViews`, `indexSteps` and `arrangements` |
| `components/Modules/useModuleEnabled.ts:19` | `isModuleEnabled({ modules: override ?? stored }, moduleId)` |
| `components/Modules/useEnabledModuleViews.ts:41` | in `useModuleViews`, filter over `uiModuleRegistry.modules` (not the model manifest) |
| `components/Editor/Annotations/useAnnotationsPanel.ts:415` | `useModuleSwitch`, same rule, tolerant of a missing store |

### Production calls of `useModuleEnabled`

| Site | Observed |
|---|---|
| `components/Modules/ModuleSwitchSection.tsx:41` | `useModuleEnabled(module.id)` per manifest row |
| `components/Editor/Citations/CitationControlSlot.tsx:38` | per `uiModuleRegistry.modules` entry that has a `citationControl` |

`useModuleSwitch` (not in the task's list, found by the same grep): `components/Editor/Annotations/AnnotationsPanel.tsx:391-392` calls it for `CLAIMS_MODULE_ID` and `SOURCES_MODULE_ID`.

### Production calls of `useModuleViews`

| Site | Observed |
|---|---|
| `components/Layout/AppShell.tsx:358` | `const moduleViews = useModuleViews();` (default registry `uiModuleRegistry`) |

### Production calls of `registry.enabledViews`

Observed: none. The grep finds only the interface declaration and implementation in `registry.ts` (lines 109 and 133). The UI does not call it; `useModuleViews` filters `uiModuleRegistry` itself.

### Production calls of `registry.indexSteps`

| Site | Observed |
|---|---|
| `src/lib/models/derived-index-rebuild.ts:270-272` | guarded by `registry.modules.some((m) => m.indexSteps.length > 0)`, then `readModulesConfig`, then `registry.indexSteps(config)`; `DEFAULT_REGISTRY = createModuleRegistry(MODULE_MANIFEST)` at line 60 |
| `src/lib/models/indexer-queue.ts:272-278` | same guard, `moduleRegistry.indexSteps(await readModulesConfig(projectRoot))`; a read failure is `console.error`'d at 278 |

All three shipped manifest entries have `indexSteps: []` (`src/lib/models/modules/manifest.ts` lines 16, 22, 30), so that guard reads false in production today.

### Other readers of `config.modules` or the manifest

| Site | Observed |
|---|---|
| `src/lib/models/module-config-core.ts:105-112` | write: spreads the existing map, sets `[moduleId]`; `MODULE_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/` (line 39); no check against the manifest |
| `src/lib/models/derived-index-rebuild.ts:77` | `readModulesConfig`: plain read of `project.json` `config` |
| `src/lib/models/project-creator.ts:287-290` | a project type's `modules` record copied into `project.config.modules` at creation |
| `src/lib/models/project-creator.ts:413`, `:500` | `createModuleRegistry(manifest).arrangements(...)` seeds arrangements while a module is on |
| `src/lib/models/schemas.ts:436`, `:1165` | `modules: z.record(z.string(), z.boolean()).optional()`; no id list |
| `src/store/projectsSlice.ts:180`, `:787`, `:1129` | store copy, `setProjectModules`, `selectActiveProjectModules` |
| `components/project-types/ProjectTypeDraftService.ts:279-296` | `moduleStatesOf` iterates `MODULE_MANIFEST`; `withModuleState` returns the definition unchanged for an id not in the manifest |
| `components/project-types/ProjectTypeEditorForm.tsx:705-708` | one control per `MODULE_MANIFEST` entry, label `` `${entry.view?.label ?? entry.id} module` `` |
| `components/Modules/ModuleSwitchSection.tsx:130` | one switch row per `MODULE_MANIFEST` entry |

### Whether a fourth module with `defaultEnabled: false` and no `view` needs a change in any of them

A reading of the code, not a run. No site above fails to accept an entry with no `view`:

- `ModuleManifestEntry.view` is optional (`registry.ts:56`); `views()` and `enabledViews()` use `m.view ? [m.view] : []` (lines 132-134).
- `uiModuleRegistry` (`components/Modules/uiRegistry.ts:425`) is built from `UI_MODULE_VIEWS`; `UiModuleEntry.view` is not optional, so a module with no `view` has no UI entry and is absent from `useModuleViews` and from `CitationControlSlot`. It is present in `ModuleSwitchSection`, `ProjectTypeEditorForm` and `ProjectTypeDraftService`, which read `MODULE_MANIFEST`.
- `isModuleEnabled` with `defaultEnabled: false` and no own entry returns false; with an own `true` returns true (`registry.ts:92-101`).
- Two sites fall back to the id when `view` is missing: `ModuleSwitchSection.tsx:56` and `ProjectTypeEditorForm.tsx:708`. Those texts are recorded under (b). Whether they change is Task 14's.
- Not observed: a run with a fourth entry. `tests/unit/module-registry.test.ts`, `tests/unit/claims-module-manifest.test.ts` and `tests/unit/module-ui-registry.test.tsx` name the manifest or registries; they were not run and not read for a no-`view` case.

## (b) What `ModuleSwitchSection.tsx` shows today for an entry with no `view`

Source read: `components/Modules/ModuleSwitchSection.tsx`, line 56 (`const label = module.view?.label ?? module.id;`) and the JSX below it. Not rendered; read of the code. For an entry `{ id: "citations", indexSteps: [] }`, `label` is `"citations"`:

- Switch label: `Enable citations` (`Enable {label}`).
- Saved message (role `status`): `citations is now on.` or `citations is now off.`
- Failed message (role `alert`): `Could not turn citations on: <message> The switch shows your choice; it is not saved.` (`off` likewise).
- Section intro, independent of the entry: "Turn a module on or off for this project. Switching a module off hides its view and its editor controls; its data stays on disk and is there when you turn it back on."
- Project type editor for the same entry: control label `citations module` (`ProjectTypeEditorForm.tsx:708`).

The "after" is recorded by Task 14.

## (h) Can a citation be made in a Source body

Two parts: the editor path (read) and the core path (a run).

### Editor path (read)

- `components/WorkArea/EditView.tsx:469-475`: `annotationResourceId` is set when the open revision is canonical and `selectedResource.type` is `"text"` or `"source"`.
- `components/TipTapEditor.tsx:933-939`: `CitationControlSlot` renders when `annotationResourceId !== undefined && !readonly`.
- `components/Editor/Citations/CitationControlSlot.tsx:38-39`: a module's `citationControl` renders only while `useModuleEnabled(moduleId)` is true; with the Sources module off nothing renders.
- Not run: a browser. The editor control on a Source was not exercised.

### Core path (probe, run)

Probe file: `frontend/tests/unit/zz-task10-probe.test.ts`. It sat inside the repo tree because vitest collects only there; it was built from the head of `tests/unit/annotations-core.test.ts` and was deleted after the run (`git status --short` empty afterwards). It used a temp project under `os.tmpdir()` through `GETWRITE_PROJECTS_DIR`; `projects/` was not touched.

Command (from `frontend/`): `pnpm exec vitest run tests/unit/zz-task10-probe.test.ts --silent=false --reporter=verbose`. Result: 1 test passed. The probe made two `source` resources (citing, cited) and one `text` resource, then:

1. `addAnnotationCore(projectId, citing, { id, body: "", quote: "quick brown", target: { sourceId: <cited>, locator: { type: "page", value: "4" } } })` returned `{"id":"87f9d258-b876-4bcd-8521-774d6c0bbf7f","body":"","quote":"quick brown","target":{"sourceId":"71d3a4ab-97fa-4546-b885-d41b3fd8c86c","locator":{"type":"page","value":"4"}},"createdAt":"2026-11-15T00:16:45.337Z","updatedAt":"2026-11-15T00:16:45.337Z"}`. An empty body was accepted with a `target` present.
2. `listAnnotationsCore(projectId, citing)` returned the same single record.
3. `loadTextSections(projectRoot, [citing, textId], [...], (meta, content) => ({ id, type, hasContent }))` returned two sections, `type: "source"` and `type: "text"`, each `hasContent: true` (`src/lib/export/section-loader.ts:24-27` keeps `text` and `source`).
4. `listAnnotationsCore` on the text resource returned 0 records.

A first attempt failed with `InvalidAnnotationError: An annotation target locator must be an object.` because the probe passed a string. The locator is `{ type?: page|timestamp|paragraph|line, value: string 1..500 }` (`src/lib/models/annotation-validation.ts:113-136`). Recorded because Task 22 reads locators.

Existing test on the same path: `tests/unit/annotations-core.test.ts:621` ("annotation core on a Source (Feature 102, Task 32, FR-38)"). It was not run separately.

### What this shows and does not

- Observed: the core stores and lists a citation (an annotation with a `target`) on a `source` resource, through the same functions and the same `isAnnotatableType` rule (`annotations-core.ts:79-80`, `:154`) as for a text resource; the compile section loader includes a Source as a section.
- Not observed: the compile cores (`compile-core.ts`, PDF, DOCX) reading a Source's annotations; that path is built in Tasks 22, 24 and 43. "Read like any other resource's" is shown for the annotation read and the section loader, not for compile.
- Not observed: the editor control on a Source in a browser.
