# Experiments: Feature 93, stale saves and index races

Source spec: `specs/features/stale-saves-and-index-races.md`. Vocabulary: every entry is MEASURED (values observed in a run), READ, not run, or UNMEASURED (with the reason). No cause is written for any value. A non-reproduction is recorded with its counts and construction and is not evidence that the case is safe under other timing (FR-2).

## Environment record (Task 1)

All entries MEASURED unless stated; recorded 2026-10-24 on the unchanged tree.

| Item | Value |
| --- | --- |
| Date | Sat Oct 24 14:22:10 MDT 2026 (`date`) |
| Branch | `fix/stale-saves-and-index-races` (`git branch --show-current`) |
| HEAD | `90ea2c5a36632220438ecb22744842e08b5a458d` (`git rev-parse HEAD`) |
| `git status --short` | empty output (clean tree) |
| Node | v24.15.0 (`node -v`) |
| Vitest | 4.1.6, darwin-arm64, node-v24.15.0 (`pnpm exec vitest --version` from `frontend/`) |
| pnpm warning on every command | `WARN Issue while reading "/Users/jedaisaboteur/.npmrc". EPERM: operation not permitted` (sandboxed runs) |

`lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN`: no output, exit 1 (no listener on any of the three ports). Run twice: 2026-10-24 14:22 and again immediately before `pnpm test:e2e`; both empty.

## Baselines (Task 1)

All MEASURED, 2026-10-24, HEAD `90ea2c5a`, one run each unless stated.

| Command (cwd) | Result |
| --- | --- |
| `pnpm typecheck` (`frontend/`) | exit code 0 |
| `pnpm lint` (`frontend/`) | exit code 0; 392 problems: 0 errors, 392 warnings; "0 errors and 7 warnings potentially fixable with `--fix`" |
| `pnpm test:ci` (`frontend/`) | exit code 1. Test Files: 1 failed, 674 passed (675). Tests: 1 failed, 8217 passed, 2 expected fail, 1 skipped (8221). Duration 95.33s. Failure: `tests/component/EntityGraphSettingsPanel.test.tsx > EntityGraphSettingsPanel > persists a changed hop radius` (`AssertionError: expected "vi.fn()" to be called with arguments: [ 'p1', ... ]`). |
| `pnpm exec vitest run tests/component/EntityGraphSettingsPanel.test.tsx` (`frontend/`), 3 repetitions after the failing full run | 3 of 3 runs: Test Files 1 passed (1); Tests 10 passed (10). |
| `pnpm test:e2e` (`frontend/`, outside sandbox) | exit code 0; 230 passed, 1 skipped, 0 failed (1.5m). Failure names: none. |
| `pnpm knip` (repo root) | exit code 1. Findings by section: Unused files 49; Unused dependencies 1; Unused devDependencies 4; Unlisted dependencies 6; Unlisted binaries 4; Unused exports 160; Unused exported types 174; Duplicate exports 14. Sum of these eight sections: 412. Configuration hints: 6 (not counted in the 412). |
| `pnpm --filter getwrite-cli test` | Test Files 23 passed (23); Tests 153 passed (153); duration 266.58s. Output also contained `error: missing required argument 'source'` and `error: unknown option '--saved-types-dir'` lines; the run reported all tests passed. |
| `pnpm --filter getwrite-electron test` | Test Files 34 passed (34); Tests 528 passed (528); duration 2.50s. |

Stated figures in the task text (0 errors / 392 warnings; knip 412) match the observed values.

`git status --short` after all suites (before this file was created): empty output. No stray files appeared from the test runs.

## E-1 Stale `name` after rename, then stale whole-resource `updateSidecarCore`

MEASURED. Recorded 2026-10-24 14:36 MDT (Task 3), HEAD `c01bebea`, unchanged source. Script (not run by the suite): `scripts/e123-sidecar-stale-copy.test.ts`, config `scripts/vitest.e123.config.ts`. Command: `E123_RESULT_OUT=<scratchpad>/e123-result.json pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e123.config.ts` from `frontend/` (sandboxed, Vitest 4.1.6, Node v24.15.0). Temp directory: `/tmp/claude-501/f93-e123-wIu8gM` (mkdtemp under `$TMPDIR`; removed after the run). Result file: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/e123-result.json`. One run of the script (all three experiments in one run). Each repetition uses a fresh project and a real text resource; the client copy is the object `loadProjectCore` returns; the stale send is the page-save construction (`page.tsx` `applyUpdate`: the client copy with a `userMetadata.mood` edit and `wordCount` overlaid from the stored value) through `updateSidecarCore`. Rejected = a core call threw; unparseable = the sidecar file did not `JSON.parse` after the send.

Construction: client copy loaded; `renameResourceSidecarCore(..., "Renamed Chapter")` completes; stale send. 20 repetitions. Stored `name` after the send equalled the client copy's pre-rename value ("Chapter One") in 20 of 20 repetitions; equalled "Renamed Chapter" in 0 of 20. Unparseable 0, rejected 0.

## E-2 Stale `updatedAt` after a canonical save

MEASURED. Recorded 2026-10-24 14:36 MDT (Task 3), HEAD `c01bebea`, unchanged source. Script (not run by the suite): `scripts/e123-sidecar-stale-copy.test.ts`, config `scripts/vitest.e123.config.ts`. Command: `E123_RESULT_OUT=<scratchpad>/e123-result.json pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e123.config.ts` from `frontend/` (sandboxed, Vitest 4.1.6, Node v24.15.0). Temp directory: `/tmp/claude-501/f93-e123-wIu8gM` (mkdtemp under `$TMPDIR`; removed after the run). Result file: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/e123-result.json`. One run of the script (all three experiments in one run). Each repetition uses a fresh project and a real text resource; the client copy is the object `loadProjectCore` returns; the stale send is the page-save construction (`page.tsx` `applyUpdate`: the client copy with a `userMetadata.mood` edit and `wordCount` overlaid from the stored value) through `updateSidecarCore`. Rejected = a core call threw; unparseable = the sidecar file did not `JSON.parse` after the send.

Construction: canonical save (`updateRevisionInPlace`) and a 5 ms pause; client copy loaded (it carries `updatedAt`, absent from 0 of 100 copies); 5 ms pause; second canonical save; stale send. 100 repetitions. The second canonical save advanced the stored `updatedAt` past the client copy's in 100 of 100 repetitions. Stored `updatedAt` after the send equalled the older client value in 100 of 100 repetitions; equalled the value written by the second save in 0 of 100. Unparseable 0, rejected 0. History (carried, not assumed): Feature 92 OQ-9 recorded 100 of 100 on 2026-10-23 (`project-json-single-lock/experiments.md`, a differently built client copy with a 1970 `updatedAt`); this run is the current-`main` value.

## E-3 Stale `dismissedNoiseTerms` after `setNoiseTermDismissedCore`

MEASURED. Recorded 2026-10-24 14:36 MDT (Task 3), HEAD `c01bebea`, unchanged source. Script (not run by the suite): `scripts/e123-sidecar-stale-copy.test.ts`, config `scripts/vitest.e123.config.ts`. Command: `E123_RESULT_OUT=<scratchpad>/e123-result.json pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e123.config.ts` from `frontend/` (sandboxed, Vitest 4.1.6, Node v24.15.0). Temp directory: `/tmp/claude-501/f93-e123-wIu8gM` (mkdtemp under `$TMPDIR`; removed after the run). Result file: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/e123-result.json`. One run of the script (all three experiments in one run). Each repetition uses a fresh project and a real text resource; the client copy is the object `loadProjectCore` returns; the stale send is the page-save construction (`page.tsx` `applyUpdate`: the client copy with a `userMetadata.mood` edit and `wordCount` overlaid from the stored value) through `updateSidecarCore`. Rejected = a core call threw; unparseable = the sidecar file did not `JSON.parse` after the send.

Construction: `setNoiseTermDismissedCore("alpha")`; client copy loaded (`dismissedNoiseTerms` `["alpha"]`); `setNoiseTermDismissedCore("hello")` completes; stale send. 20 repetitions. Stored `dismissedNoiseTerms` after the send lacked "hello" in 20 of 20 repetitions; held "hello" in 0 of 20. Unparseable 0, rejected 0.

## E-4 Key inventory

Recorded 2026-10-24 (Task 2), HEAD `fbee9209`, unchanged source. Scripts (not run by the suite): `scripts/e4-key-inventory.test.ts` (node), `scripts/e4-sender-payloads.test.tsx` (jsdom), config `scripts/vitest.e4.config.ts`. Command, from `frontend/`: `E4_RESULT_OUT=<scratchpad>/e4-result.json E4_PAGE_COPY_OUT=<scratchpad>/e4-page-copy.json E4_PAGE_COPY_IN=<scratchpad>/e4-page-copy.json E4_SENDERS_OUT=<scratchpad>/e4-senders.json pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e4.config.ts`. Temp directory: `mkdtemp` under `$TMPDIR` (`/tmp/claude-501/f93-e4-XXXXXX`, removed after each run). Result files: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/e4-result.json`, `e4-senders.json`, `e4-page-copy.json`.

### E-4a Keys a stale whole-resource copy puts back (MEASURED)

Construction, per repetition, on a fresh temp project and a real text resource: `createResourceCore` (stored sidecar S0); `loadProjectCore` (the object the page holds, "page copy"); then `updateRevisionInPlace` (canonical save), `renameResourceSidecarCore` ("Renamed Chapter"), `updateSidecarCore` of `entityKind`, `aliases`, `wordCountGoal`, `resourceSubtype`, `setNoiseTermDismissedCore` (stored sidecar S1); then the page save construction (`page.tsx` `applyUpdate`: the page copy with a `userMetadata.mood` edit, `wordCount` and `resourceSubtype` overlaid from S1) sent through `updateSidecarCore` (stored sidecar S2). Two variants, 5 repetitions each (10 total); every field below was identical across the 5 repetitions of its variant unless the timestamp is named.

- Variant `fresh` (page copy loaded before any canonical save or dismissal): page copy has no `updatedAt` and no `dismissedNoiseTerms`. Keys changed by the send (S1 to S2): `name`, `plaintext`, `userMetadata`. Keys put back to the stale page-copy value: `name` ("Renamed Chapter" in S1, "Chapter One" in S2), 5 of 5.
- Variant `warm` (page copy loaded after one canonical save and one dismissal of "alpha"): page copy holds `updatedAt` and `dismissedNoiseTerms: ["alpha"]`. Keys changed by the send: `dismissedNoiseTerms`, `name`, `plaintext`, `updatedAt`, `userMetadata`. Keys put back to the stale page-copy value: `dismissedNoiseTerms` (S1 `["alpha","hello"]`, S2 `["alpha"]`), `name`, `updatedAt` (S2 equals the page copy's value; S1 later than it), 5 of 5.
- In both variants `wordCount`, `entityKind`, `aliases`, `wordCountGoal` and `resourceSubtype` were unchanged by the send (overlaid or absent from the copy); `orderIndex` and `folderId` unchanged.

### E-4b Keys the page resource copy carries (MEASURED, same runs)

- Stored sidecar S0 after `createResourceCore`, keys (9): `createdAt`, `folderId`, `id`, `name`, `orderIndex`, `slug`, `type`, `userMetadata`, `wordCount`.
- Page copy from `loadProjectCore` (`fresh`), keys (10): the nine above plus `plaintext` (lower-case p). `warm` copy (12): those ten plus `updatedAt` and `dismissedNoiseTerms`.
- Page copy keys not in S0: `plaintext` (both variants); `updatedAt`, `dismissedNoiseTerms` (`warm`).
- `plainText` (capital T), `tiptap`, `charCount`: absent from S0, from the page copy, from S1 and from S2 in 10 of 10 repetitions.
- `plaintext` is stored by today's `updateSidecarCore`: absent from S1, present in S2 as a string in 10 of 10 repetitions (the denylist drops only `wordCount` and `file`). After the allowlist change a save stops storing it (FR-20, accounted in the FR-20 section below).
- READ, not run: `loadProjectFromDisk` (`project-loader.ts`, the `resources` map) returns `{...sidecar, plaintext: plaintext ?? "", wordCount}`, overriding any stored `plaintext` with the value read from `content.txt` (or the tiptap file); `AppShell.tsx:530` reads `plaintext` from the Redux resource. The only `.plaintext` reader found in `src/`, `app/`, `components/` outside `project-loader.ts` is `AppShell.tsx:530` (grep, medium confidence).

### E-4c Keys each production sender sends (MEASURED)

Construction: the real `app/(app)/page.tsx` mounted as in `tests/page-stale-sidecar-save.test.tsx` (`StartPage`, `TipTapEditor`, `openProject`, `listProjects`, `updateSidecar` mocked), with `openProject` returning the `warm` page copy above as the project's single resource. One run, five edits in turn, each call to `updateSidecar` recorded (1 repetition per sender; a second run of the same script, with both files run together, passed again; its payloads were not diffed). Passenger keys are those in the payload that the edit did not set.

| Sender (file:line of the `updateSidecar` call) | Key the edit sets | Other keys in the payload (passengers) | `clearKeys` |
| --- | --- | --- | --- |
| `EntitySection.tsx:138` (entity kind input) | `entityKind` | `createdAt`, `dismissedNoiseTerms`, `folderId`, `id`, `name`, `orderIndex`, `plaintext`, `slug`, `type`, `updatedAt`, `userMetadata`, `wordCount` | none |
| `page.tsx:537` (custom field, `userMetadata.mood`) | `userMetadata` | same twelve as above (no `entityKind`) | none |
| `SubtypeSection.tsx:77` | `resourceSubtype` | none (payload is `{resourceSubtype}` only) | none (set); `["resourceSubtype"]` (clear, READ) |
| `WordCountGoalSection.tsx:75` (goal "500") | `wordCountGoal` | the twelve above plus `entityKind`, `resourceSubtype` | none (set); `["wordCountGoal"]` (clear, READ at `:104`) |
| `RemoveEntityControl.tsx:186` | none set (clears) | `createdAt`, `dismissedNoiseTerms`, `folderId`, `id`, `name`, `orderIndex`, `plaintext`, `resourceSubtype`, `slug`, `type`, `updatedAt`, `userMetadata`, `wordCount`, `wordCountGoal` (no `entityKind`, no `aliases`) | `["entityKind","aliases"]` |

READ, not run: alias edits (`EntitySection.tsx:211`, `commitAliases` at `:217`, `:222`, `:230`) send `{...resource, aliases}` through the same `persist`, so the passengers match the `EntitySection` row and the key set is `aliases`. All eight `updateResource(...)` calls in `page.tsx` (`:588`, `:595`, `:612`, `:622`, `:635`, `:642`, `:652`, `:662`) set only `userMetadata` keys.

### E-4 outcome

Keys any sender sets: `entityKind`, `aliases`, `wordCountGoal`, `resourceSubtype`, `userMetadata`, plus `clearKeys` naming `entityKind`, `aliases`, `wordCountGoal` or `resourceSubtype`. No sender sets a sixth key. Of the passengers, `name`, `updatedAt`, `dismissedNoiseTerms` (server-owned), `wordCount` (already dropped), `orderIndex`, `folderId` (already re-applied), `id`, `slug`, `type`, `createdAt` (identity keys) and `plaintext` are not set by any edit. No stop-and-report condition found.

## E-5 Features-route senders, two quick edits

Command (from `frontend/`, sandboxed): `E5_REPS=20 E5_RESULT_OUT=<scratchpad>/e5-result.json pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e5.config.ts`. Script: `specs/features/stale-saves-and-index-races/scripts/e5-features-route-senders.test.tsx` (config `vitest.e5.config.ts`; not run by the suite). Run 2026-10-24 14:39 MDT on `fix/stale-saves-and-index-races`, tree unchanged apart from the new `specs/` scripts, Vitest 4.1.6, Node v24.15.0. Temp directory: `/tmp/claude-501/f93-e5-quyw5q` (one fresh project directory per repetition, removed after the run). Result: 1 test passed, 6 cells of 20 repetitions.

Construction (MEASURED, all three senders): the real component mounted with the real store and the real `postFeatureConfig` HTTP transport; `fetch` replaced by a controlled-delay stub that builds a `NextRequest` and calls the real `POST` in `app/api/project/features/route.ts` (which runs `updateFeatureConfig`, then `updateProjectJson`) against a temp project. The first save is held while the second edit is made from the same mounted component, then the second request completes, then the first is released. Two hold points, each 20 repetitions per sender:
- `after-route`: the first request reaches the route and is written; its response is held until the second request has completed.
- `before-route`: the first request is held before it reaches the route; the second reaches the route first.

Edits: `RelationshipTypesSettings` add "Alpha" then add "Beta" (start: no persisted list, default vocabulary of 7). `ProjectFeatureToggles` tick Synopsis then Notes (start: `{entities: true}`). `OrganizerCardBodySettings` start `{source: "text-excerpt", excerptLength: 200}`, set the excerpt length to 300 then to 400.

"Holds both" is: relationship types, stored list is the 7 defaults plus Alpha and Beta; features, stored map has `entities`, `synopsis` and `notes` all true; organizer card body, stored block equals the second edit's block `{text-excerpt, 400}` (the block is replaced wholesale, so the second edit's block is the only one that includes both). "Store" is the client Redux project after all requests and responses settled.

| Sender (source line) | Hold point | Requests per rep | Reps whose stored block holds both | Reps whose client store holds both | Unparseable project.json | Non-2xx responses |
| --- | --- | --- | --- | --- | --- | --- |
| `RelationshipTypesSettings.tsx` `persist` `:67-82` | after-route | 2 (20 of 20) | 0 of 20 | 0 of 20 | 0 | 0 |
| same | before-route | 2 (20 of 20) | 0 of 20 | 0 of 20 | 0 | 0 |
| `ProjectFeatureToggles.tsx:100-125` | after-route | 2 (20 of 20) | 0 of 20 | 0 of 20 | 0 | 0 |
| same | before-route | 2 (20 of 20) | 0 of 20 | 0 of 20 | 0 | 0 |
| `OrganizerCardBodySettings.tsx:121` | after-route | 2 (20 of 20) | 20 of 20 | 0 of 20 | 0 | 0 |
| same | before-route | 2 (20 of 20) | 0 of 20 | 0 of 20 | 0 | 0 |

Observed final values (first repetition of each cell, from the result JSON). Relationship types, after-route: stored list is the 7 defaults plus "Beta" only; the second request body carried the 7 defaults plus "Beta" (no "Alpha"). Features, after-route: stored `{notes: true, entities: true}` (no `synopsis`); the second request body carried `{entities: true, notes: true}`. Features, before-route: stored `{synopsis: true, entities: true}`. Organizer, after-route: stored `{text-excerpt, 400}`, client store `{text-excerpt, 300}` (the first response mirrored last). Organizer, before-route: stored `{text-excerpt, 300}`; the second request carried 400.

`SubtypesSettings.tsx`: READ, not run. It carries `isSaving` (`:46`) and returns early or disables its controls while true (`:82`, `:105`, `:117`, `:149`, `:158`, `:167`, `:214`).

MEASURED limits of this construction: the stub holds a fetch, not the network; the hold points are two of the possible orderings; the organizer sender was driven by two edits to the excerpt-length field only (the length field is not rendered until the stored source is text-excerpt); the "holds both" definition for the organizer block is the one stated above. A non-reproduction is not evidence of safety under other timing (FR-2).

Verdicts per sender (primary hold point `after-route`; `before-route` stated beside it):
- `RelationshipTypesSettings`: reproduced a loss (stored block holds both in 0 of 20 at both hold points).
- `ProjectFeatureToggles`: reproduced a loss (stored block holds both in 0 of 20 at both hold points).
- `OrganizerCardBodySettings`: did not reproduce a loss at `after-route` (stored block is the second edit in 20 of 20; the client store ended on the first edit's block in 20 of 20); at `before-route` the stored block was the first edit's block in 20 of 20 (second edit not stored), a different ordering from the one the spec describes.

## E-6 Editor config, overlapping and older-copy saves

(empty; Task 5)

## E-7 Entity-graph settings, older-copy save

(empty; Task 5)

## E-8 Mention index writer races

(empty; Task 6)

## E-9 Backlinks writer races

(empty; Task 7)

## FR-3 callers of updateSidecarCore

READ, not run. Recorded 2026-10-24 (Task 2), HEAD `fbee9209`. Search: `grep -rnE "updateSidecarCore|updateSidecar\b|/sidecar"` over `frontend/app`, `components`, `src`, `lib`, `hooks`, `stories`, `scripts`, `cli/`, `electron/`, `android/` (excluding `node_modules`, `.next*`, build output, `tests/`). Medium confidence for a name-based grep; the CLI, Electron and Android trees returned no match for `updateSidecar` or a `/sidecar` route string.

Direct callers of `updateSidecarCore` (2 production, as at the 2026-10-24 finding F93-2):

| file:line | Role |
| --- | --- |
| `frontend/app/api/resource/[resource-id]/sidecar/route.ts:44` | `POST /api/resource/[resource-id]/sidecar` handler: passes `body.updatedResource` and `body.clearKeys` through unchanged |
| `frontend/src/store/transport/native-resource-backend.ts:129` | native in-process transport (`updateSidecar`, `:127`): passes `updatedResource` and `clearKeys` through |

Definition: `frontend/src/lib/models/resource-crud-core.ts:556`.

Callers of the transport (`updateSidecar` in `frontend/src/lib/api/resources.ts`: interface `:159`, web transport `:314`, wrapper `:585`), all production:

| file:line | What it sends (E-4c) |
| --- | --- |
| `frontend/app/(app)/page.tsx:537` | whole page copy; edits only `userMetadata` keys |
| `frontend/components/Sidebar/EntitySection.tsx:138` (`persist`; callers `:158`, `:211`) | whole Redux resource; edits `entityKind` or `aliases` |
| `frontend/components/Sidebar/WordCountGoalSection.tsx:75` (`persist`; callers `:104`, `:115`) | whole Redux resource; edits `wordCountGoal` |
| `frontend/components/Sidebar/SubtypeSection.tsx:77` | `{resourceSubtype}` or `{}` with `clearKeys` |
| `frontend/components/Sidebar/RemoveEntityControl.tsx:186` | whole Redux resource without `entityKind`/`aliases`, `clearKeys: ["entityKind","aliases"]` |

Test files naming `updateSidecarCore` or `updateSidecar` (not production; FR-20 covers the ones whose assertions change): 30 files under `frontend/tests/` per the first grep, including `tests/unit/resource-crud-core-sidecar-sink.test.ts`, `metadata-concurrent-writes.test.ts`, `resource-crud-core-entity-kind-omitted.test.ts`, `sidecar-concurrent-writes.test.ts`, `project-json-lock-pairs.test.ts`, `project-json-lock-deadlock.test.ts`.

Question AC-2 asks, answered from the table and from E-4c:
- Any caller that renames a resource through this path: none found. Every sender that sends a `name` carries the loaded or Redux copy's value as a passenger; no edit sets it. Rename has its own route (`renameResourceSidecarCore`).
- Any caller that sets `updatedAt`: none found (passenger only, in the `EntitySection`, `page.tsx`, `WordCountGoalSection` and `RemoveEntityControl` payloads).
- Any caller that sets `dismissedNoiseTerms`: none found (passenger only; dismissal goes through `setNoiseTermDismissed` / `setNoiseTermDismissedCore`, `EntitySection.tsx` `handleDismissNoiseTerm`).
- Any production code reading back a client-written `updatedAt`, `name` or `dismissedNoiseTerms` from a response of this route: none; the route returns `{ message: "Sidecar updated." }` only.

Result: the 2026-10-24 finding is confirmed (no caller relies on a to-be-dropped key; two production callers of the core). No blocker.

## FR-17 callers of the functions FR-15 and FR-16 change

(empty; Task 8)

## FR-20 test-edit list

Task 2 input (MEASURED, E-4b): a save through today's `updateSidecarCore` stores `plaintext` (lower-case) from the page copy in 10 of 10 repetitions; the allowlist stops storing it on the next save. `plainText`, `tiptap` and `charCount` were not carried by the page copy and were absent from every stored sidecar in the E-4 runs. Test edits: (empty; Tasks 8 and 12)
