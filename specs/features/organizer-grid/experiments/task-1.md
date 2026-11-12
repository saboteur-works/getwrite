# Task 1: FR-1 inventory (a), (b), (f), (g), (i)

Labels: OBSERVED = a value printed by a throwaway test or command run in this worktree (inside the command sandbox, jsdom or node under Vitest, fakes where named); READ = read in source, not run. A measurement is a fact; no cause is written as a cause here. Where a cause would be natural, the experiment that would separate it is named instead.

## Environment

- Node v24.15.0, Vitest v4.1.6, base commit `928f52b4` (`928f52b43d6e7656ebb679bc778b6611b8b01196`), branch `worktree-agent-ab9dd5a494d6f473c`, worktree `agent-ab9dd5a494d6f473c`, date 2026-11-11. Command sandbox on; no `next build`, no device, no browser.
- Probe files (throwaway, removed from the tree after the run; copies kept in the session scratchpad only): `frontend/tests/zzProbeA.test.tsx`, `frontend/tests/zzProbeB.test.tsx`, `frontend/tests/unit/zzProbeG.test.ts`, `frontend/tests/unit/zzProbeI.test.ts`. `git status --short` after removal printed nothing.
- Values were written with `process.stdout.write("PROBE_x ...")` because `console.log` is not shown by the repository's Vitest setup (observed: a first run with `console.log` printed nothing).

### Commands run

```
cd frontend && pnpm exec vitest run tests/zzProbeA.test.tsx           # (a)  1 test passed
cd frontend && pnpm exec vitest run tests/zzProbeB.test.tsx           # (b)  5 tests passed
cd frontend && pnpm exec vitest run tests/unit/zzProbeG.test.ts       # (g)  1 test passed
cd frontend && pnpm exec vitest run tests/unit/zzProbeI.test.ts       # (i)  1 test passed
grep -c "statuses\|relationshipTypes\|subtypes\|wordCountGoal\|modules" getwrite-config/templates/project-types/project-type.schema.json
grep -n "additionalProperties" getwrite-config/templates/project-types/project-type.schema.json
grep -rln "project-type.schema" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next
grep -rn "ajv" frontend/package.json cli/package.json electron/package.json package.json
```

An earlier run of probe A printed `ORGANIZER_ORDER []` because it selected cards by `[role="article"]` while the cards are `<article>` elements with `aria-labelledby`; the probe was corrected and re-run, and only the corrected output is recorded below. An earlier run of probe B failed on the same kind of selector wait; no behaviour was inferred from it.

## (a) Order the Organizer shows today against the order the tree shows

Probe: `zzProbeA.test.tsx`. One store: project `P`, parent folder `Parent` (orderIndex 0) holding, by `orderIndex`: `DocA` 0 (document), `Folder1` 1 (folder), `DocB` 2 (document), `Folder2` 3 (folder), `DocC` 4 (document). `OrganizerView` was rendered with `Parent` selected (`setSelectedResourceId`), `getFolderMetadata` and `fetchResourceExcerpts` mocked; card order was read from each `<article>`'s `aria-labelledby` title element in DOM order. The same store was then rendered through `ResourceTree`, the `Expand Parent` chevron clicked, and the `treeitem` texts read in DOM order.

OBSERVED:

```
ORGANIZER_ORDER ["Folder1","Folder2","DocA","DocB","DocC"]
TREE_ORDER      ["Parent","DocA","Folder1","DocB","Folder2","DocC"]
```

They differ. The Organizer lists both folders first and then the three documents; the tree lists the five children in `orderIndex` order, interleaved. Source reading that matches the observation (READ, not a cause established by an experiment): `OrganizerView.tsx` builds `[...childFolders, ...childResources]` each sorted by `orderIndex` (lines 240 to 252); `ResourceTree.tsx` `getChildren` sorts one list of folders and resources by `orderIndex` (lines 357 to 362).

Consequence for the task list (a reading of the spec's decisions, not a measurement): the default arrangement stays folders-first as OQ-5 settled, and the flattened source uses the tree's rule; this probe shows the two rules give different orders for one folder, so Task 5's tree-order test must be written against the tree's order (`DocA, Folder1, DocB, Folder2, DocC`), not the Organizer's.

## (b) Writes through the page's `updateResource`

Probe: `zzProbeB.test.tsx`. The real `app/(app)/page.tsx` was mounted with these stand-ins: `StartPage` (opens the project), `openProject` (two resources), `SharingLimitsContext` (exempt), and `AppShell` replaced by a component that records its props and renders its children, so the test calls the page's own `onChangeStatus` and `onChangeDynamicMetadata` handlers, which are the page's `handleChangeStatus` and `handleChangeDynamicMetadata` closures over `updateResource`. `updateSidecar` was mocked to forward to the real `updateSidecarCore` on an in-memory storage adapter (`createMemoryAdapter`, `setStorageAdapter`), and the stored sidecar was then read with the real `readSidecar`. Both handlers were called back to back inside one `act`, so both read the same render's `selectedProject`.

Stored sidecar fields shown below are `userMetadata`, `resourceSubtype`, `entityKind`, `aliases`, `wordCountGoal`. Starting sidecar of the document under test where it carries fields: `resourceSubtype: "Scene"`, `entityKind: "character"`, `aliases: ["Ally"]`, `wordCountGoal: 500`, `userMetadata: {}`.

### Two `updateResource` calls in one handler, one document

- b1, document is the globally selected resource. Calls: `onChangeStatus("Published", A)` then `onChangeDynamicMetadata({ mood: ["calm"] }, A)`.
  - OBSERVED payload 1 `userMetadata`: `{"status":"Published"}`. Payload 2 `userMetadata`: `{"mood":["calm"]}` (no `status` key).
  - OBSERVED stored sidecar afterwards: `{"userMetadata":{"mood":["calm"]},"resourceSubtype":"Scene","entityKind":"character","aliases":["Ally"],"wordCountGoal":500}`. Redux held the same.
  - Result: the stored sidecar does NOT keep both fields. `status` is absent; only the second call's field is stored. The four Redux-owned keys were kept.
- b1x, same two calls, document is not the globally selected one (A selected, calls for B, B's stored fields as above).
  - OBSERVED stored sidecar for B: `{"userMetadata":{"mood":["calm"]},"resourceSubtype":"Scene","entityKind":"character","aliases":["Ally"],"wordCountGoal":500}`. `status` absent here too.

What this measures and what it does not: it measures that two calls from one render's closure leave one of two `userMetadata` fields in the stored sidecar for this ordering (the mocked `updateSidecar` resolved in call order). It does not establish why, and it does not measure a real route or a real network order. The experiment that would separate "the second payload was built from the same closure" from other explanations is a variant with a re-render between the two calls (not run). Task 10's core (one write, named keys set inside `mutateSidecar`) is the spec's answer; this record only fixes the baseline that a drag cannot use two `updateResource` calls.

### A write for a card that is not the globally selected resource

The page overlays Redux values for `resourceSubtype`, `entityKind`, `aliases`, `wordCountGoal` (and `wordCount`) only when the resource is the globally selected one (`applyUpdate`, lines 556 to 586). Three runs, each with A selected and a status write for B, then one control with B selected:

- b2, B's stored sidecar and Redux copy changed elsewhere to `resourceSubtype "Profile"`, `entityKind "place"`, `aliases ["Town"]`, `wordCountGoal 900` (done in the probe by `updateSidecarCore` on B plus a Redux `updateResource` dispatch, as stand-ins for the sidebar's own writers; the real controls were not driven), while the page's local copy of B still held the loaded `Scene`, `character`, `["Ally"]`, `500`.
  - OBSERVED stored B before: `{"userMetadata":{},"resourceSubtype":"Profile","entityKind":"place","aliases":["Town"],"wordCountGoal":900}`.
  - OBSERVED payload: `userMetadata {"status":"Published"}` with `resourceSubtype "Scene"`, `entityKind "character"`, `aliases ["Ally"]`, `wordCountGoal 500`.
  - OBSERVED stored B after: `{"userMetadata":{"status":"Published"},"resourceSubtype":"Scene","entityKind":"character","aliases":["Ally"],"wordCountGoal":500}`.
  - Result: the write restored all four older values.
- b3, the four keys cleared elsewhere (`updateSidecarCore` with `clearKeys` for the four, and Redux set to `undefined`), page local copy of B still holding the loaded values.
  - OBSERVED stored B before: `{"userMetadata":{}}`.
  - OBSERVED payload carried `resourceSubtype "Scene"`, `entityKind "character"`, `aliases ["Ally"]`, `wordCountGoal 500`.
  - OBSERVED stored B after: `{"userMetadata":{"status":"Published"},"resourceSubtype":"Scene","entityKind":"character","aliases":["Ally"],"wordCountGoal":500}`.
  - Result: the write brought back all four cleared values.
- b4 (control), the same clearing as b3, but B is the globally selected resource.
  - OBSERVED stored B after: `{"userMetadata":{"status":"Published"}}`. The four keys stayed cleared.
- b1x (above) showed that when the page's local copy of a non-selected card equals the stored sidecar, the four keys are unchanged by a write.

Whether the restore or resurrection can happen in the running app depends on how a card's page-local copy gets out of step with the stored sidecar for a card that is not the selected one; the probe produced that state by hand and did not drive the sidebar or `SubtypeSection` for a non-selected resource. That is not measured. What is measured: when the page's local copy of a non-selected card is out of step, a `updateResource` write for it puts the stale values back (b2, b3). The task list's choice of a narrow field-write core (FR-7) is therefore not contradicted by anything observed here.

## (g) A new `project.json` config key through each path, as the code is before Task 24

Probe: `zzProbeG.test.ts` (node environment). Probe key `organizerArrangements` with a one-element array shaped like the spec's record; control keys: `modules` (declared in the schemas and in `buildStoredProject`, not in `normalizeProjectConfig`) and `zzUnknown` (declared nowhere). One probe per path; the printed value is whether the key is present in the output of that path.

OBSERVED:

| Path | Probe call | `organizerArrangements` present | Controls |
| --- | --- | --- | --- |
| `normalizeProjectConfig` | `normalizeProjectConfig(cfg)` | false | `modules` false, `zzUnknown` false |
| `buildStoredProject` | `buildStoredProject(project, [], [])` | false | `modules` true |
| Redux copy, `setProject` | `setProject(buildStoredProject(...))`, then read `state.projects.projects` | false | none |
| Redux copy, `setProjects` | `setProjects([{ project, folders: [], resources: [] }])` | false | none |
| `ProjectConfigSchema` parse | `ProjectConfigSchema.parse(cfg)` output | false | `modules` true |
| models `ProjectSchema` parse | `ModelProjectSchema.parse({ ..., config: cfg })` output `config` | false | none |
| api `ProjectSchema` parse | `ProjectSchema` from `lib/api/schemas.ts`, same input, output `config` | false | `modules` true |
| reopen, server read | real `project.json` on disk (key, `modules`, `zzUnknown` in `config`), `loadProjectCore(id)` returned `project.config` | true | `zzUnknown` true |
| reopen, disk after the load | `project.json` re-read after `loadProjectCore` (which runs `migrateProjectOnLoad`, `updateProjectJson`) | true | none |
| reopen, client parse | the `loadProjectCore` project through `JSON.parse(JSON.stringify(..))` and the api `ProjectSchema.parse` | false | none |
| reopen, Redux | that client-parsed project through `buildStoredProject` then `setProject` | false | none |
| `loadProjectConfig` | `loadProjectConfig(root)` on the same on-disk file | false | none |

Reading of the table: with the key absent from `normalizeProjectConfig`, both schemas' declared keys, `buildStoredProject` and the `StoredProject` type, the key did not survive any of the in-process copies; it survived only the server-side read of `project.json` and the on-disk file (the load's `updateProjectJson` write kept it). The `modules` control shows a key survives the schema parses and `buildStoredProject` once declared there, and shows `normalizeProjectConfig` dropping it (consistent with the comment in `project-creator.ts` lines 244 to 247). `loadProjectConfig` returns the `normalizeProjectConfig` output, so it carries the same absence.

Not measured: the HTTP route `POST /api/project` and the page's own open flow end to end (the chain above stands in for them with the same functions), the native backend, and whether declaring the key in each place makes every path pass (that is Task 24's test; this record is the "before" state). The experiment that would separate "which declaration each path needs" is Task 24's per-path test after the key is declared.

## (i) A project type carrying a key the schema does not know

Probe: `zzProbeI.test.ts` (node environment). Spec: `{ id: "probe-type", name: "Probe", folders: [{ name: "A" }], arrangements: [{ name: "x" }] }`; control without the key.

OBSERVED:

- `validateProjectType` of the spec without the key: `success=true`. With the key: `success=false`, one issue, path `[]`, message `This project type has a setting GetWrite does not recognise: arrangements.`
- `validateDraft` (the Project Type Manager's gate, `ProjectTypeDraftService.ts`): `valid=false`, same message.
- `resolveProjectTypes(false, true)` with `GETWRITE_SAVED_PROJECT_TYPES_DIR` set to a temporary directory holding `ok.json` (no unknown key) and `withkey.json` (the key): saved ids `["probe-type"]`, `unusable [{"fileName":"withkey.json","reason":"invalid"}]`, built-in ids `["article","blank","game_writing","novel","poetry_and_lyrics","serial"]`, 7 entries in all. The file with the key is not listed as a type and is reported as unusable with reason `invalid`.
- `createProjectFromType` with the spec object carrying the key: threw `Error: Invalid project-type spec object: {"_errors":["This project type has a setting GetWrite does not recognise: arrangements."]}`.
- Built-in listing, READ not run: `readBuiltInEntries` (`projectTypes.ts`) validates each built-in file with `validateProjectType` and skips an invalid one silently (comment and `catch` at the loop). I did not add a file to the built-in directory, so a built-in with an unknown key was not run.
- `getwrite-config/templates/project-types/project-type.schema.json`: `grep -n additionalProperties` printed one line, 113 (`"additionalProperties": false`, top level, READ in context). `grep -c "statuses\|relationshipTypes\|subtypes\|wordCountGoal\|modules"` on that file printed 0: it declares none of those keys. `grep -rln "project-type.schema"` printed only docs, `CHANGELOG.md`, `CLAUDE.md`, `frontend/components/project-types/ProjectTypeDraftService.ts` (a comment), five test files that exclude the file from template lists, and `specs/` files; none of them loads it as a validator. `grep -rn "ajv"` over the four `package.json` files printed nothing. So: no code path in the repository was found that validates a project type against `project-type.schema.json`, and nothing was run against it (no JSON Schema validator is installed; none was added). What rejects a type with an unknown key today is the Zod `ProjectTypeSchema` (`.strict()`), in the four places above.

Consequence (a reading, not a measurement): a type carrying a new `arrangements` key is refused everywhere the Zod schema is used until the key is declared (Task 33), which is what FR-17 already says; whether `project-type.schema.json` needs the key is answered by the grep as "nothing reads it", with the file's drift already recorded by Features 72 and 108.

## (f) The raw-comparison convention (READ, not run)

READ: the repository convention is a raw `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` comparison at the decision point, not the `resolveRuntime()` helper. The comment at `frontend/src/store/transport/create-transport.ts` lines 25 to 31 states it ("the raw, directly-inlinable ... comparison rather than `resolveRuntime()` ... an indirected function call defeats Next.js's build-time env inlining at this specific decision point"); the comparison appears at `create-transport.ts:49`, `frontend/src/lib/api/share-in.ts:24` and `frontend/src/hooks/useUserListAvailable.ts:23`. A grep of `frontend/src`, `components` and `app` for the variable name returned 58 lines of code and comments.

TO RUN in Task 41, not claimed here: from the main checkout, outside the sandbox, after `pnpm build:native` in `frontend/`, `grep -rl "NEXT_PUBLIC_GETWRITE_RUNTIME" frontend/out/_next/static | wc -l` expected to print 0 as Features 105, 107 and 108 recorded. `frontend/out` does not exist in this worktree (`ls frontend/out` failed with "No such file or directory"); no build was run.

## Not verified by this task

- Anything about a running app, a browser or a device. Probes B used a mocked `AppShell` and a mocked `updateSidecar` forwarding to the real `updateSidecarCore`; the HTTP sidecar route, `SubtypeSection` and the sidebar controls were not driven.
- The write order of two real requests (b1 used call order on a mocked transport).
- A built-in project type with an unknown key (read only).
- The `frontend/out` grep (Task 41), FR-1 (c) and (d) (Task 3), FR-1 (e) and (h) (Task 42).
- Whether a typecheck or lint of the (removed) probes passes: they were not kept, so neither was run on them. No file under `frontend/` is changed by this task.
