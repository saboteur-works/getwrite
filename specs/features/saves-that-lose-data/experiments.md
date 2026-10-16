# Feature 87 experiments

Measurements are recorded as observed values with the test that produced them. A cause is written only where an experiment separated it from the alternatives.

## Part B: D-26 / D-29 (Task 3)

### Environment record

Command run before any process start: `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` (outside the sandbox).
Output: empty (no listener on 7340, 3000 or 6006; exit status 1). This experiment started no server and no other process; it is a vitest run.

### Method

Test: `frontend/tests/f87-status-wordcount-experiment.test.tsx`, test name "F87 Task 3 experiment: Status choice after a 10-word canonical save". Run with
`pnpm --filter getwrite-frontend exec vitest run tests/f87-status-wordcount-experiment.test.tsx --silent=false --reporter=verbose`.

- Storage: in-memory adapter (`createMemoryAdapter`), project root `/ws/<uuid>`; nothing on disk.
- A text resource sidecar with `wordCount: 0` and a zero-word initial canonical revision (`writeInitialCanonicalRevision`).
- The real `app/(app)/page.tsx` mounted with the real `AppShell` and `MetadataSidebar`; `openProject` returns the resource as loaded at that moment (`wordCount: 0`, `plaintext: ""`), standing in for `project-loader.ts`. `TipTapEditor` and `StartPage` are replaced.
- `updateSidecar` is not a no-op mock: it forwards to the real `updateSidecarCore` on the same adapter, so the stored sidecar is observed.
- The canonical save is the real `updateRevisionInPlace` with a 10-word document ("one two three four five six seven eight nine ten"), called after the page had loaded the resource.
- The Status is chosen with `fireEvent.change` on the `status` select, value "Published".

### Observed values

(a) Sidecar `wordCount` after the canonical save of 10 words: `10`
    (`F87 (a) sidecar wordCount after canonical save: 10`)
(b) `wordCount` in the payload `updateResource` sent for the Status choice: `0`
    (`F87 (b) payload wordCount for Status choice: 0`; payload keys observed: `folderId,id,name,orderIndex,plaintext,type,userMetadata,wordCount`; `userMetadata` observed `{"status":"Published"}`)
(c) Sidecar `wordCount` after the Status change: `0`
    (`F87 (c) sidecar wordCount after Status change: 0`)

The Redux/page copy of the resource was not re-read in this experiment; (b) is the page's payload.

### updatedAt: server-derived and client-sent (by reading, plus one observation)

- Server-derived: `frontend/src/lib/models/revision-core.ts:479` (`const updatedAt = new Date().toISOString()`), written into the sidecar at lines 481-491 by the canonical save.
- Client-sent path by reading: `frontend/src/lib/models/project-loader.ts` (return object, `...sidecar`) puts every sidecar key, `updatedAt` included, on the loaded resource; `frontend/app/(app)/page.tsx` `updateResource` sends `applyUpdate(resource)` whole to `updateSidecar`; `frontend/src/lib/models/resource-crud-core.ts:467-469` merges `...update` over the existing sidecar, so a sent `updatedAt` replaces the stored one. This is a reading.
- Observed in this run: the payload had no `updatedAt` key (the sidecar the page loaded had none, because the fixture sidecar was written without one and was read before the canonical save), and the stored `updatedAt` was identical before and after the Status change (`2026-10-15T22:30:16.255Z`). So client-sent `updatedAt` was NOT exercised by this experiment; whether a stale `updatedAt` is stored after a Status change when the loaded sidecar already carried one was not measured.

### Verdict

Hypothesis not disproved: payload carried a stale wordCount and the stored value followed it. Specifically: (a) shows the sidecar held 10 after the canonical save; (b) shows the Status payload carried 0; (c) shows the sidecar held 0 after the Status change. (a)-(c) together separate "the payload carried 0 and the stored value became 0" from "the payload carried 10 and the stored value was still 0"; they do not separate why the page's copy held 0.

## Part C: D-36 (Task 8)

### Environment record

Command run before any process start: `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` (outside the sandbox).
Output: empty (no listener on 7340, 3000 or 6006; exit status 1). This experiment started no server and no other process; it is a vitest run.

### Method

Test file: `frontend/tests/unit/f87-pov-delete-experiment.test.ts`, describe "F87 Task 8 experiment: pov in the reference-key list". Run with
`pnpm --filter getwrite-frontend exec vitest run tests/unit/f87-pov-delete-experiment.test.ts --silent=false --reporter=verbose` (6 passed; the test asserts nothing about the values, it prints `F87C ...` lines).

- Storage: a throwaway folder per case under `os.tmpdir()` with prefix `gw-f87c-`; each path is asserted to start with that prefix before use; removed in `afterAll`. The real filesystem adapter is used, not the memory adapter. Nothing under `projects/` or the app data folders was touched.
- Each case: a `project.json` with `config: {}` (no `metadataSchema`); a target text resource named "Mara"; another text resource whose sidecar `userMetadata.pov` is `{id: <target id>, name: "Mara"}`. Resources are written with `createTextResource`/`writeResourceToFile`, then the other sidecar is rewritten with the `pov` value. For the folder site the target sits in a folder.
- Phase "never-edited": `project.json` untouched. Phase "after-one-schema-edit": one `addGroup` call (group id `custom-group`, one text field `extra`) which persists `config.metadataSchema`; `pov` was not named in that edit.
- Sites run: `deleteResourceCore` (resource-crud-core.ts), `softDeleteFolder` (trash.ts, folder containing the target), and the `POST /api/resource/[resource-id]/delete` route handler.
- "Key list" is observed by applying, to the output of `getSchema(projectRoot)`, the same filter each site applies in its source (`resource-ref` + `multi-resource-ref` for the first two; `resource-ref` only for the route); the test file reproduces that filter, it does not read the sites' internal variable. The outcome (the other resource's `userMetadata.pov` read from its sidecar on disk after the deletion) comes from the real site call. Redux was not involved.

### Observed values

| phase | site | `config.metadataSchema` in project.json | key list | `pov` in key list | other resource `userMetadata.pov` on disk after delete |
|---|---|---|---|---|---|
| never-edited | deleteResourceCore | absent (false) | `[]` | false | `{"id":"<target id>","name":"Mara"}` |
| never-edited | softDeleteFolder | absent (false) | `[]` | false | `{"id":"<target id>","name":"Mara"}` |
| never-edited | delete route | absent (false) | `[]` | false | `{"id":"<target id>","name":"Mara"}` |
| after one schema edit | deleteResourceCore | present (true) | `["pov"]` | true | `{"id":null,"name":"Mara"}` |
| after one schema edit | softDeleteFolder | present (true) | `["pov"]` | true | `{"id":null,"name":"Mara"}` |
| after one schema edit | delete route | present (true) | `["pov"]` | true | `{"id":null,"name":"Mara"}` |

Not measured here: why the persisted schema after the edit contains `pov` (the observation is only that `getSchema` returned it after `addGroup` and not before); `multi-resource-ref` behaviour; restore.

### Verdict

Hypothesis not disproved: for a never-edited project, `getSchema` returned no `resource-ref` keys at all (key list `[]`, `pov` absent) at all three sites and the other resource's `pov` was left as `{"id":<target id>,"name":"Mara"}`; after one schema edit that persisted `config.metadataSchema`, `pov` was in the key list at all three sites and was cleared to `{"id":null,"name":"Mara"}`. The earlier sidecar read was not contradicted.

## Final suites (Task 14)

Logs of each run: `specs/features/saves-that-lose-data/logs-final/` (`test-ci.log`, `typecheck.log`, `lint.log`, `knip.log`, `e2e.log`, `storybook.log`). The sandbox refused writes under `/tmp/getwrite-f87/` (`mkdir: Operation not permitted`), so logs went to the feature folder.

### Part outcomes

| Part | Outcome | Record |
|---|---|---|
| A (D-9, Tasks 1-2) | landed | failing-test record: commit 39bb957b (T1); fix: 4061e4e3 (T2) |
| B (D-26/D-29, Tasks 3-7) | landed (hypothesis not disproved, see "Part B" verdict above) | experiment b4b4b0d0 (T3); then 08fb61ee (T4), e4f42998 (T5), 0fb91d70 (T6), 22ceb7c4 (T7) |
| C (D-36, Tasks 8-11) | landed (hypothesis not disproved, see "Part C" verdict above) | experiment 6ee4611a (T8); failing tests cce1f33e (T9); 6da9264a (T10); 7835b071 (T11) |
| D (D-3/D-39, Tasks 12-13) | landed | failing tests 83f5039e (T12); fix f9f54a20 (T13) |

No part halted.

### Port state

Before Storybook (outside the sandbox): `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` printed nothing (exit 1).
Storybook started with `pnpm storybook` (background job). Process tree recorded with `ps -axo pid,ppid,command`: 25557 (pnpm), 25559, 25563, 25582, 25586, 25608 (storybook dispatcher, listening on 6006), and esbuild children 25614, 25798, 25799. Stopped with `kill` by those nine pids only; `ps -p` on them afterwards listed none. `lsof` on the three ports afterwards printed nothing (exit 1). Other processes seen in `ps` (an `@playwright/mcp` server, a TypeScript typings installer) were not started by this task and were not touched.

### Results against baseline

| Suite | Run | Result | Baseline (Feature 81, reported, not re-run) |
|---|---|---|---|
| `pnpm test:ci` (frontend) | run | exit 0; 610 files passed; 6501 passed / 1 skipped (6502) | 6468 passed / 1 skipped |
| `pnpm typecheck` (frontend) | run | exit 0 | not stated |
| `pnpm lint` (frontend) | run | exit 1; 400 problems: 2 errors, 398 warnings (initial run); after the two lint fixes, 0 errors, 398 warnings; after replacing the three `as any[]` casts in `StartPage.tsx`, 0 errors, 393 warnings (`eslint components/Start/StartPage.tsx` reports 0 warnings, was 5) | 0 errors / 395 warnings |
| `pnpm knip` (repo root) | run | exit 1; output recorded below | no clean baseline |
| `pnpm test:e2e` (Storybook on 6006) | run | exit 0; 212 passed, 2 flaky (passed on retry), 1 skipped | 214 passed / 1 skipped |

- test:ci: +33 passed over the reported baseline. That figure is a difference of totals; it was not itemised per test file here. The commits changed or added tests in `StartPage.test.tsx`, `metadata-schema.test.ts`, `project-editor-config-route.test.ts`, `project-loader.test.ts`, `resource-delete-route.test.ts`, `trash-folder-cascade.test.ts`, `trash-ref-record.test.ts`, `resource-crud-core-entity-graph-position.test.ts`, `native-editor-config-backend.test.ts` and the two experiment test files.
- lint: the 2 errors are in files this feature added. (1) `frontend/tests/f87-status-wordcount-experiment.test.tsx:91:5`, `react-hooks/rules-of-hooks` ("React Hook "React.useEffect" is called in function "default" that is neither a React function component nor a custom React Hook function"). (2) `frontend/tests/unit/f87-pov-delete-experiment.test.ts:91:9`, `@typescript-eslint/naming-convention` (variable `schemaPresent` needs a prefix is/has/should/can/did/will). Not fixed here. The warning delta (+3 over the reported 395) was not itemised per file; which of the 398 are in files this feature touched was not counted.
- e2e: 212 passed + 2 flaky = 214 tests ended passing, 1 skipped, matching the reported 214 / 1 in total only when the flaky pair is counted as passed. The two flaky tests (each failed once and passed on retry): `e2e/start-page.e2e.spec.ts:96` "start page open project button fires onOpen with the project directory id" and `e2e/start-to-editor-flow.e2e.spec.ts:97` "API failure surfaces an error and keeps the user on the start page". Whether they are flaky on the baseline was not measured; no cause is stated. `StartPage.tsx` was touched by Task 13, and these two tests are Start Page tests.

Lead measurement, 2026-10-15, on branch HEAD a6bb3c5d: `pnpm exec playwright test e2e/start-page.e2e.spec.ts:96 e2e/start-to-editor-flow.e2e.spec.ts:97 --repeat-each=20 --retries=0` passed 40 of 40 (Playwright's own static Storybook on 6006, free before and after). The two tests did not fail in isolation; their failure inside the full suite was not reproduced and was not measured on main.

### knip (no clean baseline)

Output: `logs-final/knip.log` (exit 1). Sections: Unused files 49, Unused dependencies 1, Unused devDependencies 4, Unlisted dependencies 6, Unlisted binaries 4, Unused exports 166, Unused exported types 170, Duplicate exports 14, Configuration hints 6.

Findings naming a file this feature touched (touched list from `git diff --name-only 987ba17e..HEAD`, `logs-final/touched.txt`):
- `frontend/src/lib/models/editor-config-core.ts:60:17` unused export `resolveEditorConfigProjectRootOrThrow`.
- `frontend/src/lib/models/metadata-schema.ts:1123:16` duplicate/unused `default` export.

Both exports exist at `987ba17e` (checked with `git show 987ba17e:<path>`), so neither was introduced by this feature. No knip finding names the other touched source files, or the added test helper `frontend/tests/unit/helpers/f87-reference-delete-fixture.ts`. Every other finding is in a file this feature did not touch.

### electron and cli

Not run. `git diff --stat -- electron cli` is empty (working tree) and no commit in `987ba17e..HEAD` touches `electron/` or `cli/`. Whether touched `frontend/src/lib/models` code is imported by electron or cli (the `@gw/core` alias) was not checked, so "shared code" is not ruled out by this section; the suites are recorded as not run, not as passing.

### Touched files (`git diff --stat 987ba17e..HEAD`, before this section)

21 files, 1348 insertions, 70 deletions: `frontend/app/(app)/page.tsx`, `frontend/app/api/resource/[resource-id]/delete/route.ts`, `frontend/components/Start/StartPage.tsx`, `frontend/src/lib/models/{editor-config-core,metadata-schema,resource-crud-core,trash}.ts`, eleven files under `frontend/tests/`, `specs/features/saves-that-lose-data/{experiments,tasks}.md`.

### Tree state

`git status --short` at the end showed only `?? specs/features/saves-that-lose-data/logs-final/` (this task's logs); nothing outside `frontend/` and `specs/features/saves-that-lose-data/`; no edit under `docs/user/`.

### Pointer (OQ-7)

The handbook warnings these fixes may make stale go to the scribe as a follow-up; not reviewed here.

## Stage 6.5: the Feature 81 scripts re-run on this branch (lead, 2026-10-15)

Build: `pnpm build` in `frontend/` at `bb54c2ce`, `.next/static` copied into the standalone tree. Each script is the one that recorded the defect in `specs/features/user-handbook/verification.md`, run unchanged from `specs/features/user-handbook/scripts/` against the built standalone server, with a throwaway projects folder and a free port. Ports 7340, 3000 and 6006 had no listener before and after every run; each script stopped only its own server pid. Logs: `logs-exercise/`. Web build only; the desktop app was not run.

| Defect | Script | Feature 81 observation | Observed now |
|---|---|---|---|
| D-9 | `task4-sec2b.mjs` | after a Body Text Styles save, `headings` was `{}` | `headings` kept h1 60px; editor H1 60px and dialog 60 after reload |
| D-26 | `task5-q6.mjs` | stored `wordCount` 0 after a Status choice | Scene A 10 and Scene B 5 after the Status choice |
| D-29 | `task6-d2.mjs` | By status showed 0 words until a reload | 10 words before and after reload; a hand-set sidecar `wordCount` of 777 still loads as 4 |
| D-36 | `task7-tr1.mjs` | built-in Point of View kept its link after the target was deleted | `pov` on disk `{"id":null,"name":"Mara"}` after delete; re-linked on restore |
| D-3/D-39 | `task8-c2.mjs` | Start Page dialog listed 1 of 2 | both dialogs list Inner Doc and Root Doc, "COMPILE (2)"; the compiled file holds both |

`task7-tr2.mjs` (custom Ref re-link and the not-restored notice) gave the same kind of results as in Feature 81.

## Review follow-ups

### Item 2: the Task 6 `savedWordCount` overlay in `page.tsx` `applyUpdate`

Measurement (2026-10-15): the `savedWordCount` block (the `typeof savedWordCount === "number"` assignment of `next.wordCount`) was removed temporarily, then restored exactly. With it removed, `tests/f87-status-wordcount-experiment.test.tsx` and `tests/page-stale-sidecar-save.test.tsx` gave 2 failed, 6 passed (the Task 4 recording test and `page-stale-sidecar-save.test.tsx` passed):

- `D-26: Status choice after a 10-word canonical save > sends and stores the saved wordCount (10) when Status is chosen` failed at `expect(payload.wordCount).toBe(10)` (received 0). This asserts the `updateSidecar` request payload. The next assertion, on the stored sidecar (`stored?.wordCount`), was not reached, so it was not measured in this run.
- `D-26/D-29: By status over the Redux resource list > reports the 10 saved words for the resource after a canonical save and a Status choice` failed at `expect(published?.words).toBe(10)` (received 0). This asserts the roll-up computed from the Redux resource list after the Status choice (Redux state).

Not separated by an experiment: whether the stored sidecar value changes with the overlay removed, since the test stopped at the payload assertion first. `updateSidecarCore` drops a client-sent `wordCount` (Task 5). The `page.tsx` comment was reworded to state only the above.

### Start Page compile placement

Start Page compile placement: compile request body (`compileBody` in StartPage.tsx) carries only id, name and type per resource, so no test asserts `folderId` or `plainText` on the compile input; placement is asserted by dialog row indentation.

### FR-17 / OQ-4 revision: all-or-nothing reference-key helper

Measurement (2026-10-15): three tests were added before the change (`metadata-schema.test.ts` "a persisted schema lacking pov yields no pov key"; `trash-ref-record.test.ts` and `trash-folder-cascade.test.ts` "persisted schema without a pov field ... left unchanged", using a new `schema-without-pov` fixture state that writes a persisted schema with no `pov` field). Against the per-key merge all three failed: keys were `['ref','pov']` instead of `['ref']`; `deleteResourceCore` left `pov` as `{ id: null, name: 'Mara' }` instead of unchanged; `softDeleteFolder` left `pov.id` null. After `getEffectiveResourceRefFieldKeys` was changed to use `DEFAULT_METADATA_SCHEMA` only when no schema is persisted, otherwise the persisted fields alone, all three passed. `f87-pov-delete-experiment.test.ts` F87C lines: never-edited `keys=[]`/`povInKeys=false` in the printed project state with `otherPovAfterDelete={"id":null,"name":"Mara"}` at all three sites; after-one-schema-edit `keys=["pov"]` with the same cleared result at all three sites. Full suite 6505 passed / 1 skipped.

### After the review follow-ups (lead, 2026-10-15)

At `b5e29d96`, after the review follow-ups changed `StartPage.tsx` and the helper, the build was rebuilt and `task7-tr1.mjs` and `task8-c2.mjs` were re-run the same way (logs `logs-exercise/*-b5e29d96.txt`). TR-10: `pov` on disk `{"id":null,"name":"Mara"}` after delete, re-linked on restore. C-02: both dialogs list Inner Doc and Root Doc; the compiled file holds both. Ports 7340, 3000 and 6006 had no listener before and after. Full `pnpm test:e2e` at the same commit (Playwright's own static Storybook on 6006, free before and after): 214 passed, 1 skipped, exit 0; no test needed a retry.
