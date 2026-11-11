# Task 1: FR-1 inventory (a) to (g)

Feature 108 (claim ledger). Spec: `specs/features/claim-ledger.md`, FR-1. Everything below is a measurement or a reading, labelled. No cause is written as a cause. Paths are relative to the repo root unless they start with `frontend/`.

## Environment

- Node v24.15.0 (`node -v`), Vitest v4.1.6, run from `frontend/` in the worktree `.claude/worktrees/agent-a42097359ddea1809`, base commit `7c66c6fd` (branch `worktree-agent-a42097359ddea1809`).
- Run inside the command sandbox. `node_modules` present. No build (`next build`, `build:native`) was run; none works in a worktree.
- Probes were throwaway. Copies of the two vitest probes (with `.txt` suffix) and the other probe files are in the session scratchpad `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/f23d67b0-4986-41c8-9d32-176755fd0f75/scratchpad/`; they were removed from `frontend/tests/unit/` after the run.
- The Electron and CLI typechecks are not required by this task (its Files are specs only) and were not run.

## (a) Readers of `config.modules` and calls of the module-enablement functions (production code)

Method: `grep -rnE` over `frontend/{app,components,src}` excluding tests and stories, then read each hit. Whether each "assumes absent means on" is a reading of the code (not a run).

| # | file:line | what it does | absent entry |
|---|-----------|--------------|--------------|
| 1 | `frontend/src/lib/models/modules/registry.ts:46-54` `isModuleEnabled` | the one rule: absent or no `modules` map returns `true`; only explicit `false` is off (`modules[id] !== false`) | on (hard-coded `return true`, line 51) |
| 2 | `registry.ts:78-79` `enabled()` inside `createModuleRegistry`, used by `enabledViews` (line 84) and `indexSteps` (line 86) | filters manifest entries through `isModuleEnabled` | on (via 1) |
| 3 | `frontend/components/Modules/useModuleEnabled.ts:15-19` | `isModuleEnabled({ modules: override ?? stored }, moduleId)`; store read via `selectActiveProjectModules` | on (via 1) |
| 4 | `frontend/components/Modules/useEnabledModuleViews.ts:23-35` `useModuleViews` | `m.view.alwaysEnabled \|\| isModuleEnabled({ modules }, m.id)` (line 30) over `uiModuleRegistry.modules`; returns `{ registered, enabled }` | on (via 1) |
| 5 | `frontend/src/lib/models/derived-index-rebuild.ts:60` `DEFAULT_REGISTRY = createModuleRegistry(MODULE_MANIFEST)`; `:270-275` calls `registry.indexSteps(config)` after `readModulesConfig` (`:77-92`) | rebuild path; config read only when a registered module owns an index step | on (via 2); `readModulesConfig` returns `undefined` for a missing file, no `config`, or non-object `config` |
| 6 | `frontend/src/lib/models/indexer-queue.ts:50` registry, `:272-278` `runModuleIndexSteps` calls `moduleRegistry.indexSteps(await readModulesConfig(projectRoot))` | per-save index steps; skipped when no module owns a step (`:272`) | on (via 2) |
| 7 | `frontend/components/Modules/ModuleSwitchSection.tsx:41` `useModuleEnabled(module.id)`; `:127` maps `MODULE_MANIFEST`; `:63` dispatches `setProjectModules` | the Project Settings > Modules screen; switch checked state is `isWriterChoiceOn ?? isStoredEnabled` (`:46`) | on (via 3) |
| 8 | `frontend/components/Editor/Citations/CitationControlSlot.tsx:38` `useModuleEnabled(moduleId)` in `Gate` | gates each module's citation control | on (via 3) |
| 9 | `frontend/components/Layout/AppShell.tsx:358` `useModuleViews()`; `:556-557` `isOff` (registered and not enabled); `:1509` `moduleViews.enabled.map(...)` for the view switcher; `:1771` `moduleViews.enabled.find(...)` | the shell's view gating | on (via 4) |
| 10 | `frontend/src/store/projectsSlice.ts:176` copies `project.config?.modules` into the entry; `:773-780` `setProjectModules`; `:1118-1122` `selectActiveProjectModules` | raw map storage and selector; its comment says "absent ... means the module is on" (`:108-109`, `:1112-1114`) | no decision made here; passes `undefined` through |
| 11 | `frontend/src/lib/models/module-config-core.ts:102-115` `setModuleEnabledCore` | write path only; builds `{ ...existing, [moduleId]: isEnabled }`; no default involved | not a reader of the rule |
| 12 | `frontend/src/lib/api/modules.ts:42,85`, `frontend/src/lib/models/schemas.ts:388`, `frontend/src/lib/api/schemas.ts:218`, `types.ts:156` | schemas and transport for the map `Record<string, boolean>` (`modules` optional) | no decision made here |

Not callers in production code: `useModuleViews` is consumed only by `AppShell.tsx` (hit 9). `registry.enabledViews` has no production caller outside tests (grep found only its definition at `registry.ts:62,84`). `registry.indexSteps` is called at hits 5 and 6 only.

Observation relevant to later tasks (reading, not run): `AppShell.tsx:1603` and `:1770` hard-code `view === "trash" || view === "sources"` when rendering a module view, and `frontend/src/lib/models/types.ts:254-265` lists `ViewName` literals, ending with `"sources"`. A claims view id would need both places to be extended (Tasks 4 and 25 own those files). Nothing was changed here.

All twelve places reach the absent-entry decision through the single function at `registry.ts:46` (hits 1, then 2, 3, 4); hits 5 to 9 reach it through 2, 3 or 4. That is a reading of the call graph from the grep output above.

## (b) Can `registry.ts` read `MODULE_MANIFEST` (or a default from it) without a cycle or a React/JSX/JSON import reachable from `core.ts`?

Measured:

1. `pnpm exec vitest run --project node tests/unit/core-import-graph.test.ts tests/unit/module-registry.test.ts` on the unchanged tree: 2 files passed, 30 tests passed. That test walks runtime imports from `core.ts` and from `registry.ts`, `manifest.ts`, `derived-index-rebuild.ts`.
2. Imports as they are today (`grep -n "^import"` reading): `registry.ts` has one import, `import type { ProjectConfig } from "../types"`; `manifest.ts` has one import, `import type { ModuleManifestEntry } from "./registry"`. Both are type-only, so neither produces a runtime edge today.
3. Throwaway probe, scratchpad `b-probe/` (run with `node b-probe/run.ts`, Node's native type stripping, explicit `.ts` specifiers): a copy of the registry shape with a value import `import { MODULE_MANIFEST } from "./manifest.ts"` and a lookup `MODULE_MANIFEST.find(...)?.defaultEnabled ?? true`, plus a manifest copy that keeps `import type ... from "./registry.ts"`, with a `claims` entry `defaultEnabled: false`. Output: `loaded; manifest entries: 2 | sources absent: true | claims absent: false | unknown absent: true | claims explicit true: true`. The two modules loaded and evaluated with registry importing manifest at runtime and manifest importing registry type-only.
4. What the probe does not show: it used stand-in copies, not the real files, and did not run `core-import-graph` against the modified real `registry.ts`. The cycle-freeness of the real files after Task 3's edit is therefore something Task 3 must re-check by running that test after its change.

Result for the question as asked: in the probe, a value import from `registry.ts` to `manifest.ts` produced no runtime cycle, because the reverse import in `manifest.ts` is type-only. On this evidence Task 3 does not need to create `module-defaults.ts`, provided `manifest.ts` keeps importing from `registry.ts` with `import type` only. One caveat from reading `core-import-graph.test.ts`: its walker does not follow `import type` and flags only react, `.tsx`/`.jsx`, `.json` and `components/Modules/` specifiers, so it would not catch a cycle either way; the cycle check above is from the probe, not from that test.

## (c) A field added to a stored annotation, through each path

Probe: `frontend/tests/unit/task1-fr1c-probe.test.ts` (removed after the run; copy at scratchpad `task1-fr1c-probe.test.ts.txt`). Command: `PROBE_OUT=<scratchpad>/task1-c.txt pnpm exec vitest run --project node tests/unit/task1-fr1c-probe.test.ts` (1 test passed). It seeds a stored annotation `{ id, body, quote, claim: { status: "unsourced" }, createdAt, updatedAt }` into a real sidecar (as a newer build would have stored it), then runs each path against real files. The field name `claim` and its value are the probe's choice. Observed:

| path | result |
|------|--------|
| sidecar file after `writeSidecar` | survived |
| `listAnnotationsCore` | survived |
| client response parse, `httpAnnotationsTransport.list` (fetch stubbed to return the stored record) | **dropped** |
| client response parse, `httpAnnotationsTransport.update` (one-annotation response) | **dropped** |
| `updateAnnotationCore` (returned value and re-read from disk) | survived |
| `reattachAnnotationCore` (returned value and re-read from disk) | survived |
| `remapAnnotationIds` | survived |
| `validateNewAnnotation` with a `claim` key | **refused**: `An annotation can't have a "claim" field.` |
| `addAnnotationCore` with a `claim` key | **refused**, same message |
| `annotation-paste` copy into a second resource (real editor, real cores; result `{ ok: true }`, 1 annotation stored in the target) | **dropped** (the pasted copy has no `claim`) |

Reading that matches the observations (not a separate measurement): `AnnotationResponseSchema` in `frontend/src/lib/api/annotations.ts:57-64` declares `id, body, quote, target, createdAt, updatedAt` and no other key, and `annotation-paste.ts:223-228` passes `body`, `quote` and `target` only. The probe observed the drops; it did not run a variant with the schema or paste code changed, so the observation says which paths drop the field and not what would make them keep it.

Not covered by this probe: Trash restore, copy resource, duplicate (outside the FR-1(c) list; Task 26 pins them). "An older build's `validateNewAnnotation`" was observed as the current build's `validateNewAnnotation` and `addAnnotationCore`, which is the code that an older build would run for a client that sends the field on add; no older build was run.

Consequence recorded for Tasks 14 and 15 as the spec's note says: the client parse and `annotation-paste` drop an unknown field and the add boundary refuses one.

## (d) Project types carrying a key the schema does not know

Probe: `frontend/tests/unit/task1-fr1d-probe.test.ts` (removed after the run; copy at scratchpad `task1-fr1d-probe.test.ts.txt`). Temp built-in directory (`GETWRITE_PROJECT_TYPES_DIR`) and saved directory (`GETWRITE_SAVED_PROJECT_TYPES_DIR`), each holding a valid type and a type with `modules: { claims: true }`. Observed:

- `resolveProjectTypes(false, true)` entries: `built-in:b-known, saved:probe-type`. The built-in file with the unknown key is absent from `entries` and from `unusable` (it is skipped silently; `readBuiltInEntries` in `frontend/src/lib/projectTypes.ts` only pushes on a successful `validateProjectType`). The saved file with the unknown key is reported: `unusable: [{"fileName":"s.json","reason":"invalid"}]`.
- `validateProjectType({ ...valid, modules: { claims: true } })`: refused with `This project type has a setting GetWrite does not recognise: modules.` (path `[]`). `ProjectTypeSchema` is `.strict()` (`frontend/src/lib/models/schemas.ts`, near line 995 to 1015). `frontend/src/lib/models/project-types-static.ts` is documented (header comment) as validating with the same `validateProjectType` and skipping failures; that is a reading, the probe did not import the static registry.
- `ProjectTypeListResponseSchema.safeParse` (client parse of the Manager list in `frontend/src/lib/api/schemas.ts:1008`) with one entry carrying the unknown key and one valid entry: the whole response is refused (`path: ["entries", 0, "spec"], code: "unrecognized_keys"`), not just that entry. The Manager page's load of the list through this schema was not run as a component; the schema result is what was observed.
- `getwrite-config/templates/project-types/project-type.schema.json`: `"additionalProperties": false` at the top level (line 113). `grep -c "statuses\|relationshipTypes\|subtypes\|wordCountGoal"` on that file returns 0: the JSON schema does not declare four keys the Zod schema accepts today. A reading of `grep -rln "project-type.schema"`: referenced by `frontend/components/project-types/ProjectTypeDraftService.ts` (comment text only at line 16 and 219, "the project-type schema" in prose), tests that exclude the file from the template list (`builtin-templates.test.ts:22`, `project-type-validation.test.ts:414,727`), the template README and docs; I did not find code that validates against the JSON file. Not run: no validator was executed against it.

## (e) Scan of every text resource's sidecar

Probe: scratchpad `scan-probe.mjs`, plain `node:fs` (not the app's `readSidecar`, so no per-file lock and no storage adapter), run read-only against the main checkout's `projects/` directory (the only project store found; the worktree has none). Reads each `meta/resource-*.meta.json`, `JSON.parse`, tests for a non-empty `annotations` array; skips encrypted projects (none of the listed rows reported as encrypted in the head of the output that was read). It counts all resource sidecars, not only text resources.

Largest project: 76 resource sidecars, read and parsed in 18.2 ms, 0 with annotations, 0 failed. Next: 28 sidecars in 5.9 ms; 20 in 4.4 ms. One run each (no repetition, so no spread); cold or warm cache state not controlled. These projects have no annotations, so the figure says nothing about a project with many claims, and 76 sidecars is far from a large manuscript. Measured through the app's own read path (locks, the annotation index): "not measured".

## (f) `NEXT_PUBLIC_GETWRITE_RUNTIME` inlining

READ, not run: the repository convention is a raw `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` comparison at the decision point, not `resolveRuntime()` (comment at `frontend/src/store/transport/create-transport.ts:25-31`; the same raw comparison appears in `frontend/src/lib/api/share-in.ts:24` and `frontend/src/hooks/useUserListAvailable.ts:23`). The `frontend/out/_next/static` grep (0 occurrences of the raw comparison in client output) is **to be run in Task 28**. It was not run here and nothing is claimed about the output.

## (g) What `CitationControlSlot` renders

Read (`frontend/components/Editor/Citations/CitationControlSlot.tsx:46-60`): it maps over `uiModuleRegistry.modules` and, for every entry that has a `citationControl`, renders a `Gate` (`:23-40`) that renders `slot.render(...)` when `useModuleEnabled(moduleId)` is true. So it renders the control of every enabled module that declares one, not only the Sources entry. Today only the Sources entry declares `citationControl` (`frontend/components/Modules/uiRegistry.ts:149-166`). It is mounted once, in `frontend/components/TipTapEditor.tsx:935`, when `annotationResourceId !== undefined && !readonly`, and in `frontend/stories/Editor/CitationControl.stories.tsx:60`. This is a reading; no test or render was run in this task. Per the spec note, because the slot is generic, Task 25 does not need to extend it for this reason.

## Commands run (all from `frontend/` unless noted)

- `node -v`; commit read from the worktree HEAD (`7c66c6fd`).
- `grep`/`sed` reads listed above.
- `pnpm exec vitest run --project node tests/unit/core-import-graph.test.ts tests/unit/module-registry.test.ts`: 2 files, 30 tests, passed.
- `pnpm exec vitest run --project node tests/unit/task1-fr1c-probe.test.ts` (throwaway): passed, output as in (c).
- `node <scratchpad>/b-probe/run.ts`: output as in (b).
- `pnpm exec vitest run --project node tests/unit/task1-fr1d-probe.test.ts` (throwaway): passed, output as in (d).
- `node <scratchpad>/scan-probe.mjs <repo>/projects`: output as in (e).
