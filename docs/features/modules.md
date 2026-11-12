# Modules and the contribution seam (developer)

Feature 103, first cut. Spec: [specs/features/sources-module-seam.md](../../specs/features/sources-module-seam.md) (FR-1 to FR-14). Measurements: [experiments.md](../../specs/features/sources-module-seam/experiments.md). The modules built on it are Sources ([sources.md](sources.md)) and, from Feature 108, Claims ([claims.md](claims.md)).

A module is a first-party unit that adds interface or background work to the app and can be switched on or off per project. The registry is the single place a module declares what it adds. It is internal: modules are plain objects declared in this repository, collected at build time. It is not a plugin system.

## Rules

- Build time only. Nothing loads module code at runtime, and the project store and user data are never read for module code. `tests/unit/module-registry.test.ts` scans the registry files for a dynamic `import()`, a `require` and a store read.
- First-party only. There is no third-party module path and no permission model for modules.
- No React, JSX or JSON is reachable from `frontend/src/lib/core.ts`, because `core.ts` re-exports `./models` and is consumed by the CLI and the Electron import workers (`electron/tsconfig.worker.json` has no JSX and no JSON modules). So the registry is split in two: the model side imports no React, and the UI side imports React and must not be imported from `lib/models`, `core.ts`, the CLI or the workers. `tests/unit/core-import-graph.test.ts` pins this. See [ADR-016](../architecture/ADRs/adr-016-cli-extraction-and-deferred-core-package.md) for why `core.ts` is the boundary.

## Model registry

- `frontend/src/lib/models/modules/manifest.ts`: `MODULE_MANIFEST`, the modules this build ships. Two entries: `{ id: "sources", view: { id: "sources", label: "Sources" }, indexSteps: [] }` and `{ id: "claims", view: { id: "claims", label: "Claims" }, defaultEnabled: false, indexSteps: [] }` (Feature 108).
- `frontend/src/lib/models/modules/registry.ts`: `createModuleRegistry(modules)` (a duplicate id throws), `ModuleManifestEntry` (`id`, optional `view`, `indexSteps`, optional `defaultEnabled`), `ModuleIndexStep` (`{ id, run(projectRoot) }`), `isModuleEnabled(config, id, manifest?)`, and the registry's `views()`, `enabledViews(config)` and `indexSteps(config)`.
- The model-side entry has no field for resource types, Trash kinds, importers, permissions or project-type keys.

## UI registry

`frontend/components/Modules/uiRegistry.ts` (`UI_MODULE_VIEWS`, `uiModuleRegistry`, `createUiModuleRegistry`). Each `UiModuleEntry` has an `id` matching the manifest, a `view` slot and optional slots. The slot kinds as built (`UI_SLOT_KINDS`):

| Slot kind            | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Consumer                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `view`               | A project-scope Work Area tab: `id`, `label`, `render(context)`, optional `icon`, optional `alwaysEnabled`                                                                                                                                                                                                                                                                                                                                                                                | `ViewSwitcher` and `AppShell.tsx`, through `useModuleViews` / `useEnabledModuleViews` |
| `attachmentsSection` | The attachments panel for one Source (`render({ resource })`)                                                                                                                                                                                                                                                                                                                                                                                                                             | The Sources view, as a prop (the view does not import the registry)                   |
| `citationControl`    | The editor controls for the selected passage (`render({ editor, resourceId, onStored })`). The Sources module's slot renders **Cite selection** and **Mark as excerpt** (`MarkExcerptControl` shows only for a Source); the claims module's slot renders **Mark as claim** (`MarkClaimControl`, text resources only, works with Sources off). Both controls are wrapped in `ControlDisclosure.tsx` by `uiRegistry.ts` and start collapsed as buttons; `MarkExcerptControl` is not wrapped | The editor, through `CitationControlSlot.tsx`, rendered only while the module is on   |

Other pieces: `useModuleEnabled(moduleId)` reads the active project's flag; `ModulesContext.tsx` lets stories and tests override it.

A view tab for a module that is off is absent, not disabled (the slot feeds neither `disabledViews` nor `disabledReasons`). When the module is switched off with its view open, the shell falls back to a view enabled for the current selection, using its view-reset logic, and to the Data view when nothing is selected. `"sources"` and `"claims"` are members of the closed `ViewName` union (`lib/models/types.ts`), each pinned equal to the manifest's view id by a test. `AppShell.tsx` names `trash`, `sources` and `claims` in two conditions that render a module view, so a new module view id is added there too.

### Trash

The Trash tab is registered as a view slot with `alwaysEnabled: true` (id `trash`, `TrashView`): it is on whatever `config.modules` says, and `config.modules.trash` is not a switch the settings screen offers. It is the one existing view converted, as the generality check of the seam (FR-10). The other existing views (edit, organizer, data, diff, timeline, entityRoster, entityGraph) are unchanged and not in the registry.

## `config.modules`

- `ProjectConfig.modules?: Record<string, boolean>` (`types.ts`; `z.record(z.string(), z.boolean()).optional()` in `ProjectConfigSchema`). `config.features` is unchanged.
- An id this build does not know is kept on write, so a flag written by a newer build survives.
- An explicit entry wins: `true` is on and `false` is off. With no entry, the module's default applies (Feature 108). The default is its manifest entry's `defaultEnabled`: `false` makes the module off until the writer turns it on, and an entry that omits the field is on. Today only `claims` sets `defaultEnabled: false`. Sources, and an id this build does not know, are on when absent, as before; a flag written by a newer build for an unknown id still survives. This replaces "an absent entry means on" for the claims module only.
- One lookup, `moduleDefaultEnabled` in `registry.ts`, is used by `isModuleEnabled`, and every reader reaches the decision through `isModuleEnabled`: the registry's `enabledViews` and `indexSteps`, `useModuleEnabled`, `useModuleViews`, the Project Settings > Modules screen and the annotations panel's `useModuleSwitch`. `registry.ts` imports `MODULE_MANIFEST` as a value and `manifest.ts` imports the registry types only, so there is no runtime cycle (`core-import-graph.test.ts`).
- Nothing writes a `claims` entry automatically. A project type may declare entries that are written once at creation (see [project-types.md](project-types.md)). The Modules screen shows only on or off, not whether off is the default or the writer's choice.
- Switching a module off keeps its data and stops its background indexing. It does not delete anything.

## Switch write path

- Core `frontend/src/lib/models/module-config-core.ts`: `setModuleEnabledCore({ projectId, moduleId, enabled })`. Validates before any lock (module id format `^[a-z][a-z0-9-]{0,63}$`, boolean `enabled`, no other field; refusal texts in `MODULE_SWITCH_MESSAGES`), then a read-modify-write of `project.json` in `withMetaLock` through `updateProjectJson`. Only the one `config.modules` entry changes: no `updatedAt`, no `metadataRevision`. The id is checked for format only, not against the registry. Locked-access errors propagate.
- Route `PUT /api/project/modules` (`app/api/project/modules/route.ts`), in `withStorageContext`. Body `{ projectId, moduleId, enabled }`, returns `{ modules }`; validation errors are 400.
- Client `lib/api/modules.ts` `setModuleEnabled` on `createTransport`; native `store/transport/native-modules-backend.ts` + `.web-stub.ts`.
- UI: Project Settings > **Modules** tab, `ModuleSwitchSection.tsx`, one switch per manifest entry. A save replaces the project's stored `modules` map (`setProjectModules`); a failed save is shown and the switch keeps the writer's choice.
- Not limited on a paired device: the write overwrites one config entry and deletes no writer data.

## Index steps

A module may own derived-index steps (`indexSteps`). They run:

- once per save, at the end of `runTask` in `indexer-queue.ts` (`runModuleIndexSteps`), for modules enabled for the project. `config.modules` is read with `readModulesConfig` (a plain unlocked `project.json` read), and only when a registered module owns a step, so a save pays no extra read today. A locked project rethrows. Any other read failure skips the module steps with a logged error; it is not treated as "every module on".
- in `rebuildDerivedIndexes` (`lib/models/derived-index-rebuild.ts`), shared by `reindex` and the three importers, after the core indexes (inverted, backlinks, mentions, annotation bodies).

The Sources module owns no index (`indexSteps: []`). The step mechanism is exercised by a test-only registry (`__setIndexerModuleRegistryForTests`). Annotation indexing is core, not module-owned. Prose diagnostics are not rebuilt by the shared function (OQ-11, deferred).

## Arrangements hook (Feature 109)

A manifest entry may carry `arrangements?: readonly ModuleArrangementSeed[]` (`registry.ts`, model side): Organizer arrangements a new project starts with while the module is on. It is plain data, not a slot kind, so `uiRegistry.ts` is unchanged and `MODULE_SLOT_KINDS` is still `["view"]`. A seed is `{ name, source: { kind: "folder", folderName, scope }, rows, columns }`: it names its folder because no folder id exists before the project does, and there is no smart-folder variant. `createModuleRegistry(manifest).arrangements(config)` returns the seeds of enabled modules (the same `enabled()` rule as `indexSteps`, so `moduleDefaultEnabled` and an explicit `config.modules` entry both apply). `createProjectFromType` calls it after the type's own seeds, so on a duplicate name the type's arrangement wins. No shipped module sets it; only a test fixture does. The seed type imports `organizer-grid-types` with `import type` only (`core-import-graph.test.ts`). See [organizer-grid.md](./organizer-grid.md).

## Adding a module

1. Add a manifest entry in `manifest.ts` (no React, JSX or JSON imports). Set `defaultEnabled: false` if the module should be off for a project with no entry.
2. Add its UI entry in `uiRegistry.ts` with a view slot, and any other slot kind that has a real consumer. A new slot kind is added only with its consumer.
3. If it is a view, add its id to `ViewName`.
4. If it owns derived data, add an `indexSteps` entry and a test that runs it on and off.
5. Add per-feature routes: there is no generic module storage channel. Each keeps `withStorageContext`, path-free validation, paired-device checks where they apply, and the existing encryption and locking behaviour.

## What the first cut does not do

By spec (FR-11, FR-12, FR-14): load code at runtime; let a module add a resource type; add a Trash kind or purge step beyond a hook; move the existing views other than Trash, the seven flags or the four compile formats into the registry; let a project type switch modules on (as built in the first cut; Feature 108 later added the optional `modules` record to `ProjectTypeSchema`); extract the `@gw/core` package; add an importer contribution kind; add a permission model for modules; add a resource-type scope for custom fields (`appliesToTypes`); build a generic module storage channel.

Open: OQ-170, whether the first cut must switch editor schema extensions per project, is not decided. Nothing here depends on it: `AnnotationMark` stays registered unconditionally in `baseSchemaExtensions`.
