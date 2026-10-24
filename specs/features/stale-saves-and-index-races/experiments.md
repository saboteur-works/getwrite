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

Command (from `frontend/`, sandboxed): `E67_RESULT_OUT=<scratchpad>/e67-result.json pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e67.config.ts` (add `E67_REPS=<n>` to change the 20 repetitions). Script (not run by the suite): `scripts/e67-editor-config-entity-graph.test.ts`, config `scripts/vitest.e67.config.ts`. Run 2026-10-24 14:41 MDT (Task 5), branch `fix/stale-saves-and-index-races`, HEAD `2edcfcae`, unchanged source, Vitest 4.1.6, Node v24.15.0. Temp directory: `/tmp/claude-501/f93-e67-PIXT48` (mkdtemp under `$TMPDIR`; one fresh project per repetition; removed after the run). Result file: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/e67-result.json`. One run of the script, 20 repetitions per construction. Real cores called directly; stored values read from `project.json`. Unparseable = `project.json` failed `JSON.parse` after the calls; rejected = a core call threw. All constructions: unparseable 0 of 20, rejected 0 of 20.

READ, not run: what each UI sender sends.
- `HeadingSettingsModal.tsx` `handleSave` (`:132-155`) calls `onSave(sanitizeEditorHeadingMap(draftHeadings))`; `AppShell.tsx` `handleSaveHeadingSettings` (`:956-976`) calls `saveHeadingSettings(dirId, headings)`; the HTTP transport (`lib/api/editor-config.ts:54-76`) posts `{ projectId, headings }`. Only the `headings` key is sent. The draft is initialised from `initialHeadings` (`AppShell.tsx:1187`, the Redux value) when the modal mounts. The Save button is disabled while `isSaving` (`:277-289`).
- `BodySettingsModal.tsx` `handleSave` (`:72-99`) calls `onSave(sanitizeEditorBody(draft) ?? {})`; `handleSaveBodySettings` (`AppShell.tsx:978-998`); transport posts `{ projectId, body }` (`editor-config.ts:79-101`). Only the `body` key is sent; Save disabled while `isSaving`.
- Both handlers dispatch `setEditorConfig` with the response's `editorConfig.headings` and `.body`. The same two modals are also mounted from `ProjectSettingsDialog.tsx:218-224` and `ShellModalCoordinator.tsx:362`, with the same `onSave` shapes (the props, not the handlers, were read there).
- `updateEditorConfigCore` (`editor-config-core.ts:96-125`) replaces `headings` or `body` only when the request carries it, inside the `updateProjectJson` mutate; the other key is taken from the stored value.

MEASURED constructions (20 repetitions each; initial stored `editorConfig` = `headings {h1:{fontSize:"40px"}}`, `body {fontSize:"15px"}`):
- 6a overlapping: `Promise.all` of `updateEditorConfigCore({headings: H1})` and `updateEditorConfigCore({body: B1})`. Stored config held both H1 and B1 in 20 of 20 repetitions; stored headings not H1 in 0 of 20; stored body not B1 in 0 of 20.
- 6b older copy, modal-shaped: copy of the stored `editorConfig` read; `{body: B1}` completes; then `{headings: H1}` (the headings key only). Stored body not B1 in 0 of 20; stored headings not H1 in 0 of 20.
- 6c older copy, whole-copy: as 6b, but the later send is `{headings: H1, body: <the older copy's body>}`. This is not a shape either modal sends (construction only). Stored body not B1 (equal to the older copy's body) in 20 of 20; stored headings not H1 in 0 of 20.

Limits: the same-key case (a modal opened before another save of the same key, then saved) was not measured as a revert, since the later send is the later write by contract; the overlap in 6a is two in-process calls, not two HTTP requests; one ordering per construction.

Closing lines:
- E-6 overlapping saves of `headings` and `body` (6a): did not reproduce (0 of 20 lost a change).
- E-6 older-copy save, shape the modals send (6b): did not reproduce (0 of 20 reverted).
- E-6 older-copy save, whole-copy shape (6c, not sent by any read sender): reverted in 20 of 20.

## E-7 Entity-graph settings, older-copy save

Command (from `frontend/`, sandboxed): `E67_RESULT_OUT=<scratchpad>/e67-result.json pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e67.config.ts` (add `E67_REPS=<n>` to change the 20 repetitions). Script (not run by the suite): `scripts/e67-editor-config-entity-graph.test.ts`, config `scripts/vitest.e67.config.ts`. Run 2026-10-24 14:41 MDT (Task 5), branch `fix/stale-saves-and-index-races`, HEAD `2edcfcae`, unchanged source, Vitest 4.1.6, Node v24.15.0. Temp directory: `/tmp/claude-501/f93-e67-PIXT48` (mkdtemp under `$TMPDIR`; one fresh project per repetition; removed after the run). Result file: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/e67-result.json`. One run of the script, 20 repetitions per construction. Real cores called directly; stored values read from `project.json`. Unparseable = `project.json` failed `JSON.parse` after the calls; rejected = a core call threw. All constructions: unparseable 0 of 20, rejected 0 of 20.

READ, not run: what the UI sender sends.
- `EntityGraphSettingsPanel.tsx` `persist` (`:128-157`) calls `setEntityGraphSettings(projectId, nextConnectionTypes, nextHopRadius)`: always both values. `handleToggleConnectionType` (`:159-173`) builds `next` from the panel's own `connectionTypes` state with one key added or removed and sends the parsed hop-radius draft; `handleHopRadiusChange` (`:175-186`) sends the panel's `connectionTypes` state with the parsed radius. The panel's state is loaded once, on first open (`:103-126`), and replaced from each save response. The toggles and the radius input are `disabled={!isLoaded || isSaving}` (`:218`, `:259`). `EntityRelationshipGraphView.tsx` keeps its own copy of both values (`:346-354`, loaded `:430-431`) and updates it from `onSettingsSaved` (`:574-581`).
- `setEntityGraphSettingsCore` (`entity-graph-settings-core.ts:116-143`) sets both `config.entityGraphConnectionTypes` and `config.entityGraphFocalHopRadius` from the request inside the `updateProjectJson` mutate, with no read of the stored values for either key. The route and `lib/api/entity-graph-settings.ts` pass the same three arguments (`entity-graph-settings.ts:146`; the route file was not read).

MEASURED constructions (20 repetitions each; initial project has no stored entity-graph keys):
- 7a older copy: copy S0 read with `getEntityGraphSettingsCore`; another save stores S1 = types `["authored","backlinks"]`, radius 3; then the panel-shaped send from S0 (S0 types plus `proximityMentions`, S0 radius) completes. Stored types differ from S1's in 20 of 20; stored radius differs from S1's in 20 of 20; either key reverted in 20 of 20.
- 7b overlapping: two panel-shaped sends from the same S0 started together, (S0 types plus `backlinks`, S0 radius) and (S0 types, radius 4). Stored types lacked `backlinks` in 20 of 20; stored radius was not 4 in 0 of 20; either lost in 20 of 20.

Limits: 7b is two in-process calls from one S0; the panel disables its controls while a save is in flight, so 7b is not a sequence the read panel produces from one mounted panel (not run against the component). 7a needs a second writer (another window, device, or the CLI/route) after the panel loaded.

Closing lines:
- E-7 older-copy save of `entityGraphConnectionTypes` and `entityGraphFocalHopRadius` (7a): reverted in 20 of 20 (either key; types 20 of 20, radius 20 of 20).
- E-7 overlapping sends (7b, construction only): either key lost in 20 of 20.

## E-8 Mention index writer races

Command (from `frontend/`, sandboxed): `E8_RESULT_OUT=<scratchpad>/e8-result.json pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e8.config.ts` (add `E8_REPS=<n>` to change the 20 repetitions). Scripts (not run by the suite): `scripts/e8-constructions.ts` (reusable constructions, exports `runRepetition(pair, mode, root)`, `PAIRS`, `Outcome`; Task 18 can import it), `scripts/e8-mention-index-races.test.ts` (driver), `scripts/vitest.e8.config.ts`. Run 2026-10-24 14:44 MDT (Task 6), branch `fix/stale-saves-and-index-races`, HEAD `e70b3396`, unchanged source, Vitest 4.1.6, Node v24.15.0. Temp directory: `/tmp/claude-501/f93-e8-rLGDLl` (mkdtemp under `$TMPDIR`; one fresh project per repetition; removed after the run). Result file: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/e8-result.json`. One run, 20 repetitions per pair per start mode (160 repetitions). Real functions are called: `removeResourceFromMentionIndex`, `enqueueIndex` (the only entry to `runTask`, which is not exported), `enqueueEntityRescan` (the only entry to `rescanEntityAcrossProject`, which runs outside the FIFO, `indexer-queue.ts:450-469`, OQ-6), `loadMentionIndex` + `persistMentionIndex`. The real filesystem adapter is installed with `setStorageAdapter`; no source is changed. Each repetition is raced against a 20 s timer; unparseable = `meta/index/mentions.json` failed `JSON.parse` after both writers settled; rejected = a writer's promise rejected; lost = an expected change absent from the stored file. All 160 repetitions: unparseable 0, rejected 0, hung 0.

Layout per repetition: two entity resources (`ent-aldric` "Aldric", `ent-brynn` "Brynn", each with an `entityKind` sidecar) and plain resources with `content.txt` and a sidecar; the index file is seeded before the writers start.

Start modes:
- natural: both writers started in the same tick (`Promise.all`), the `inverted-index.test.ts` precedent.
- gated: the storage adapter's `readFile` holds every read of `meta/index/mentions.json` until two reads have arrived (1.5 s release if the second never comes), so both writers hold an index loaded before either saved. The gate saw 2 reads in every gated repetition (minimum 2 of 2).

Pairs and expected final index:
1. `removeResourceFromMentionIndex(res-x)` against `runTask` for `res-y`. Seed: `res-x` has an Aldric record; `res-x`'s folder is absent (as after a trash move); `res-y` text mentions Brynn. Expected: `res-x` key gone and `res-y` has a Brynn record.
2. `removeResourceFromMentionIndex(res-x)` against `rescanEntityAcrossProject(ent-aldric)`. Seed as above; `res-z` text mentions Aldric. Expected: `res-x` gone and `res-z` has an Aldric record.
3. `rescanEntityAcrossProject(ent-aldric)` against `runTask` for `res-y`. Seed: empty index; `res-z` mentions Aldric, `res-y` mentions Brynn. Expected: `res-z` Aldric record and `res-y` Brynn record.
4. Two `persistMentionIndex` callers, each in the load, change, persist shape `runTask`, the importers and `reindex` use, adding `key-1` and `key-2`. Expected: both keys.
5. `runTask` against `runTask`: SKIPPED. The queue drains one task at a time (`indexer-queue.ts:329-334`), so two tasks cannot overlap.

MEASURED, repetitions that lost at least one expected change (of 20), with which change was missing (a repetition can lose one change; the by-change counts add to the total):

| Pair | natural | gated |
| --- | --- | --- |
| 1 remove vs runTask | 0 of 20 | 20 of 20 (res-y record missing 15, res-x removal missing 5) |
| 2 remove vs rescan | 1 of 20 (res-x removal missing 1) | 20 of 20 (res-x removal missing 20) |
| 3 rescan vs runTask | 0 of 20 | 20 of 20 (res-y record missing 20) |
| 4 persist vs persist | 20 of 20 (key-1 missing 14, key-2 missing 6) | 20 of 20 (key-1 missing 2, key-2 missing 18) |

Limits: the gated mode forces the order "both loaded, then both saved" with the adapter; it shows what the writers do in that order, not how often production reaches it. In natural mode pairs 1 and 3 have a long run-up in `runTask` (index, backlinks) before its mention step, which the same-tick start does not align; 0 of 20 there is a count for that construction only and is not evidence that the pairs are safe under other timing (FR-2). Pair 4 is a construction of the load, change, persist shape, not a run of an importer or `reindex`.

Closing lines:
- `removeResourceFromMentionIndex` against `runTask`'s mention step: reproduced a loss (gated 20 of 20; natural 0 of 20).
- `removeResourceFromMentionIndex` against `rescanEntityAcrossProject`: reproduced a loss (gated 20 of 20; natural 1 of 20).
- `rescanEntityAcrossProject` against `runTask`: reproduced a loss (gated 20 of 20; natural 0 of 20).
- Two `persistMentionIndex` callers: reproduced a loss (gated 20 of 20; natural 20 of 20).
- `runTask` against `runTask`: skipped.

## E-9 Backlinks writer races

Command (from `frontend/`, sandboxed): `E9_RESULT_OUT=<scratchpad>/e9-result.json pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e9.config.ts` (add `E9_REPS=<n>` to change the 20 repetitions). Scripts (not run by the suite): `scripts/e9-constructions.ts` (reusable constructions, exports `runRepetition(pair, mode, root)`, `PAIRS`, `Outcome`; Tasks 18 and 21 can import it), `scripts/e9-backlinks-races.test.ts` (driver), `scripts/vitest.e9.config.ts`. Run 2026-10-24 14:47 MDT (Task 7), branch `fix/stale-saves-and-index-races`, HEAD `7189166f`, unchanged source, Vitest 4.1.6, Node v24.15.0. Temp directory: `/tmp/claude-501/f93-e9-uKkJGK` (mkdtemp under `$TMPDIR`; one fresh project per repetition; removed after the run). Result file: `/private/tmp/claude-501/-Users-jedaisaboteur-Repositories-getwrite/823016bf-e4d6-40dc-80e0-e17d7324f2cb/scratchpad/e9-result.json`. One run, 20 repetitions per pair per start mode (200 repetitions; a 2-repetition smoke run preceded it and is not counted). Real functions are called: `removeResourceFromBacklinks`, `persistBacklinks`, `computeBacklinks`, `loadBacklinks`, `enqueueIndex` (the only entry to `runTask`, which is not exported). The watcher is not started (`ensureBacklinkWatcher` skips under the test runner, `indexer-queue.ts:74`); the watcher callback body (`backlinks-watcher.ts:46-62`) is reproduced as `runForTenant(computeBacklinks, persistBacklinks)`. The real filesystem adapter is installed with `setStorageAdapter`; no source is changed. Each repetition is raced against a 20 s timer; unparseable = `meta/backlinks.json` failed `JSON.parse` after both writers settled; rejected = a writer's promise rejected; lost = an expected change absent from the stored file. All 200 repetitions: unparseable 0, rejected 0, hung 0.

Resource ids are UUIDs (X `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`, Y `bbbbbbbb-...`, Z `cccccccc-...`) because `computeBacklinks` finds links by UUID in text. "X removal" means the stored file has no `X` key and no array holds `X`.

Start modes:
- natural: both writers started in the same tick (`Promise.all`).
- gated, load pairs (1, 2, 4): the adapter's `readFile` of `meta/backlinks.json` reads the file at once and withholds the result from the caller until the gate opens (the other writer has finished; for pair 2 until two reads have arrived; 1.5 s release otherwise). The caller therefore holds a copy loaded before the other writer saved. Gate counts: pair 1 gated, reads seen min 1, snapshot equal to the seed file min 1 (20 of 20); pair 2 gated, reads seen min 2, snapshot equal to the seed min 2; pair 4 gated, reads seen min 1, seed snapshot min 1.
- gated, compute pairs (3, 5): the construction runs `computeBacklinks` to completion, lets the other writer run to completion, then calls `persistBacklinks` with the older result (the watcher's and `runTask`'s compute-then-persist shape). No adapter gate.

Pairs and expected final index:
1. `removeResourceFromBacklinks(X)` against `persistBacklinks` of an index holding `Y -> Z`. Seed: X (folder absent, as after a trash move) and Y refer to each other. Expected: X removed and `Y -> Z` present.
2. Two `persistBacklinks` callers, each in the load, change, persist shape (`loadBacklinks`, add `key-1` / `key-2`, `persistBacklinks`). Expected: both keys. (A pair of whole-index computed saves is pair 3.)
3. The watcher body (`computeBacklinks` then `persistBacklinks`) against `runTask` (`enqueueIndex`) for Y, where Y gains a link to Z after the watcher compute has started (natural) or finished (gated). Expected: `Y -> Z`.
4. `removeResourceFromBacklinks(X)` against `runTask` for Y, where Y already links to Z when both start. Seed: X in the index, folder absent. Expected: X removed and `Y -> Z`.
5. Added construction (not one of the four asked for): a `computeBacklinks` recompute (the compute step of `runTask` and the watcher) whose snapshot lists X, against X's folder being deleted and `removeResourceFromBacklinks(X)`, with the recompute saving after the removal in the gated mode. Expected: X removed.

MEASURED, repetitions that lost at least one expected change (of 20), with which change was missing (a repetition can lose one change; the by-change counts add to the total):

| Pair | natural | gated |
| --- | --- | --- |
| 1 remove vs persist | 20 of 20 (`Y -> Z` missing 20) | 20 of 20 (`Y -> Z` missing 20) |
| 2 persist vs persist | 20 of 20 (key-1 missing 13, key-2 missing 7) | 20 of 20 (key-1 missing 15, key-2 missing 5) |
| 3 watcher persist vs runTask | 0 of 20 | 20 of 20 (`Y -> Z` missing 20) |
| 4 remove vs runTask | 0 of 20 | 20 of 20 (`Y -> Z` missing 20) |
| 5 remove vs recompute (added) | 20 of 20 (X removal missing 20) | 20 of 20 (X removal missing 20) |

Limits: the gated modes force the order "older copy, then saved last"; they show what the writers do in that order, not how often production reaches it. The natural 0 of 20 for pairs 3 and 4 is a count for that construction only (in pair 3 the change is written after both writers start, in pair 4 before; `runTask` has a long run-up, index step, before its backlinks step) and is not evidence that the pairs are safe under other timing (FR-2). The natural 20 of 20 in pair 1 shows the ordering the same-tick start produced in this construction. Pair 2 is a construction of the load, change, persist shape, not a run of a production caller. The watcher itself was not run (see above).

Observation on locking: in pairs 1, 2 and 4 the lost change is in a copy loaded before another save; a single `withMetaLock` around one writer's load, change and save would have that writer load after the other's save in these constructions. In pairs 3 and 5 the older copy is the result of `computeBacklinks` (a read of every resource) saved by `persistBacklinks` afterwards; in the gated runs that order produced the loss (pair 3: `Y -> Z` missing 20 of 20; pair 5: X removal missing 20 of 20), and a lock around `removeResourceFromBacklinks`'s load, change and save alone does not change which copy the recompute saves. A lock held across `computeBacklinks` and `persistBacklinks` together was not tried. This matches the case Task 7 and F93-4 describe (a recompute overlapping a removal); it is recorded as an observation.

Closing lines:
- `removeResourceFromBacklinks` against `persistBacklinks`: reproduced a loss (natural 20 of 20; gated 20 of 20).
- `persistBacklinks` against `persistBacklinks`: reproduced a loss (natural 20 of 20; gated 20 of 20).
- The watcher's `persistBacklinks` against `runTask`'s backlinks step: reproduced a loss (gated 20 of 20; natural 0 of 20).
- `removeResourceFromBacklinks` against `runTask`: reproduced a loss (gated 20 of 20; natural 0 of 20).
- Added: `removeResourceFromBacklinks` against a `computeBacklinks` recompute: reproduced a loss (natural 20 of 20; gated 20 of 20); not closed by locking the removal's load, change and save alone, as observed above.

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

Label: READ, not run. Date 2026-10-24. Branch `fix/stale-saves-and-index-races`. Method: `grep -rnE` for the seven names, `withMetaLock`, `enqueueIndex`, `enqueueEntityRescan`, `softDeleteResource`, `purgeResource`, `restoreResource`, the three `rebuildIndexes`/importer entry points, over `frontend/`, `cli/`, `electron/` (`.ts`/`.tsx`, tests excluded); then each callee chain and each `withMetaLock` holder body read. Name grep is medium confidence; the holder check below was done by reading imports and bodies, not by name alone.

Facts about the callees themselves (relevant to un-nesting):
- `persistMentionIndex` takes `withMetaLock(projectRoot)` around the write only (`mention-index.ts:65`); the load is outside it. `removeResourceFromMentionIndex` (`mention-index.ts:100-108`) loads outside any lock, then calls `persistMentionIndex`.
- `persistBacklinks` takes `withMetaLock(projectRoot)` around the write only (`backlinks.ts:248`). `removeResourceFromBacklinks` (`backlinks.ts:276-286`) loads outside any lock, then calls `persistBacklinks`. `computeBacklinks` takes no lock.
- `meta-locks.ts:14-41` chains each call after the stored tail; an outer `withMetaLock` whose `fn` calls `persistMentionIndex` or `persistBacklinks` (directly or through the two `remove*` functions) is a nested call on the same key. Today no outer holder does (table below).

Writer call sites (project root = same root in every row). "Holds": withMetaLock held by the caller or a function above it, for the same root.

| Writer | Caller (file:line) | Holds `withMetaLock`? |
|---|---|---|
| `removeResourceFromBacklinks` | `trash.ts:334` in `softDeleteResource` | no |
| `removeResourceFromMentionIndex` | `trash.ts:335` in `softDeleteResource` | no |
| `removeResourceFromBacklinks` | `trash.ts:1279` in `purgeResourceSteps.removeIndexEntries` | no |
| `removeResourceFromMentionIndex` | `trash.ts:1280` in `purgeResourceSteps.removeIndexEntries` | no |
| `persistBacklinks` | `indexer-queue.ts:274` in `runTask` (backlinks step) | no |
| `persistMentionIndex` | `indexer-queue.ts:298` in `runTask` (mention step) | no |
| `persistMentionIndex` / `rescanEntityAcrossProject` | `indexer-queue.ts:427` in `rescanEntityAcrossProject`; the function is called only at `indexer-queue.ts:460` in `enqueueEntityRescan`, inside `runForTenant` | no |
| `persistBacklinks` | `backlinks-watcher.ts:53` in the debounced timer in `startBacklinkWatcher`, inside `runForTenant` | no |
| `persistBacklinks` | `scrivener/import-scrivener-project.ts:784` in `rebuildIndexes` | no |
| `persistMentionIndex` | `scrivener/import-scrivener-project.ts:814` in `rebuildIndexes` | no |
| `persistBacklinks` | `plaintext/import-plaintext-project.ts:524` in `rebuildIndexes` | no |
| `persistMentionIndex` | `plaintext/import-plaintext-project.ts:554` in `rebuildIndexes` | no |
| `persistBacklinks` | `docx/import-docx-project.ts:834` in `rebuildIndexes` | no |
| `persistMentionIndex` | `docx/import-docx-project.ts:864` in `rebuildIndexes` | no |
| `persistBacklinks` | `cli/src/commands/reindex.ts:111`, inside `runForTenant` | no |
| `persistMentionIndex` | `cli/src/commands/reindex.ts:152`, inside `runForTenant` | no |

Callers' callers (chain up to the entry point; "no" means no `withMetaLock` on the chain):
- `softDeleteResource` (`trash.ts:320`): called at `resource-crud-core.ts:379` (`deleteResourceCore`; callers `app/api/resource/[resource-id]/route.ts:43`, `.../delete/route.ts:36`, `store/transport/native-resource-backend.ts:117`) and at `trash.ts:625` (`softDeleteFolder`; callers `resource-crud-core.ts:715` `softDeleteFolderCore`, then `app/api/folder/[folder-id]/delete/route.ts:43`, `native-resource-backend.ts:123`). No `withMetaLock` in `deleteResourceCore`, `softDeleteFolder` or their callers. Result: no.
- `purgeResourceSteps.removeIndexEntries`: called only through `purgeResource` (`trash.ts:1347`, step list at `:1355`); `purgeResource` called from `trash.ts:1436` (folder purge) and `trash-core.ts:152` (`purgeOneCore`; callers `trash-core.ts:193`, `native-trash-backend.ts:141`). No `withMetaLock` on the chain. Result: no.
- `runTask` (`indexer-queue.ts:246`): called only at `indexer-queue.ts:334` in `processQueue`, which `enqueueIndex` starts with `void processQueue()` (`:361`). `enqueueIndex` callers: `sidecar.ts:224` (inside `setImmediate` in `enqueueAfterSidecarWrite`, itself called at `sidecar.ts:270` and `:296` after `runSidecarWrite` returned, so outside `withMetaLock`), `tiptap-utils.ts:29` (inside `setImmediate`), `revision-manager.ts:65` (`void`, not awaited; holds the revision-content `acquireLock`, not `withMetaLock`), `inverted-index.ts:257` (`void`, in `reindexMissingResources`, outside `updateIndex`'s lock), `trash.ts:973` (`await`, in `restoreResource`; no `withMetaLock` in `trash.ts`). Result: no.
- `enqueueEntityRescan`: sole caller `sidecar.ts:229`, same `setImmediate` callback as above, so outside `withMetaLock`. Result: no.
- `rebuildIndexes` (three importers): called at `scrivener/import-scrivener-project.ts:512`, `plaintext/import-plaintext-project.ts:463`, `docx/import-docx-project.ts:775`, each inside the importer's write phase; importers called from `cli/src/commands/project.ts:206`, `:283`, `:329`, `electron/worker/scrivener-import-worker.ts:43`, `electron/worker/docx-import-worker.ts:46`. No `withMetaLock`, `acquireLock` or `withFileLock` token in `scrivener/`, `plaintext/`, `docx/`, `cli/`, `electron/` sources. The scrivener importer wraps its write phase in `withIndexingSuspended` (`import-scrivener-project.ts:304`), which sets `isStopped` so `enqueueIndex` returns at once; it takes no lock. Result: no.
- `startBacklinkWatcher`: started by `ensureBacklinkWatcher` (`indexer-queue.ts:65-79`), called at `indexer-queue.ts:357` in `enqueueIndex`; skipped under VITEST/NODE_ENV=test (`:75`). Result: no.
- `reindex` (`cli/src/commands/reindex.ts`): `runForTenant` wrapper only. Result: no.

`withMetaLock` holders (every call site in `frontend/`, bodies read for calls into the writers or `trash.ts`/`indexer-queue.ts`): `project-noise-words-core.ts:119`, `entity-graph-kind-styles.ts:168`, `entity-graph-settings-core.ts:126`, `resource-crud-core.ts:880` (folder reorder; body reads and writes `folder.json` only), `sidecar.ts:179` (`runSidecarWrite`; `mutate` callbacks must call no lock, and index enqueue happens after it returns), `inverted-index.ts:104` (`updateIndex`; body is `loadIndex`, `change`, `saveIndex`), `resource-templates.ts:133`, `:598`, `:736`, `:786` (file reads/writes), `mention-highlight-duration-core.ts:61`, `diagnostics-index.ts:83`, `saved-queries.ts:109`, `:127`, `writing-log-core.ts:180`, `writing-log.ts:149`, `previews.ts:42`, `entity-relationships.ts:171`, `:206`, `:233`, `global-noise-words.ts:159`, `entity-graph-positions.ts:125`, `:168`, `word-count-goal-core.ts:53`, `crypto/name-index.ts:166`, plus `mention-index.ts:65` and `backlinks.ts:248` (the callees' own write locks). Import lines checked: none of these files other than `resource-crud-core.ts` (imports `trash`, not called inside its lock) and the two dynamic `import("./indexer-queue")` in `sidecar.ts:221` and `inverted-index.ts:249` import `trash`, `backlinks`, `mention-index` or `indexer-queue`.

Result: no caller of the seven writers was found holding `withMetaLock` for the same project root, directly or through a callee. Flagged for un-nesting in Task 20 or 21: none found. Observations for Tasks 20 and 21 (facts, not flags): the writers' own `persistMentionIndex` (`mention-index.ts:65`) and `persistBacklinks` (`backlinks.ts:248`) already take `withMetaLock`, so a new outer lock around `removeResourceFromMentionIndex`, `removeResourceFromBacklinks`, `rescanEntityAcrossProject` or `runTask`'s two steps that still calls those two `persist*` functions would be a nested call. `trash.ts:973` awaits `enqueueIndex` (queue drain, polled every 50 ms); no lock is held there today. Not covered: dynamic dispatch through `native-*-backend.ts` `run(...)` wrappers was read at the call lines only; tests and `projects/` not searched.

## FR-20 test-edit list

Task 2 input (MEASURED, E-4b): a save through today's `updateSidecarCore` stores `plaintext` (lower-case) from the page copy in 10 of 10 repetitions; the allowlist stops storing it on the next save. `plainText`, `tiptap` and `charCount` were not carried by the page copy and were absent from every stored sidecar in the E-4 runs. Test edits (Task 12, 2026-10-24). Each edited test depended on a key `updateSidecarCore` now ignores; the assertion was rewritten onto an allowlisted key. Stated as observed, no cause.

`frontend/tests/unit/resource-crud-core-sidecar-sink.test.ts`:
- "merges over the stored value, drops wordCount, keeps orderIndex and folderId" (renamed "merges allowlisted keys over the stored value, drops wordCount and name, keeps orderIndex and folderId"): sent `name: "New"`; now sends `entityKind` and expects the stored `name` "Old" unchanged. Reason: `name` ignored.
- "keeps the stored media file name when an update sends another": sent `name: "Pic 2"`; now sends `wordCountGoal: 100` and expects `name` "Pic" and `file` "original.png" unchanged. Reason: `name` ignored.
- "keeps both changes when two updates of different keys run at once": sent 20 custom keys `field${i}`; now five concurrent updates, one per allowlisted key (`userMetadata` sent once, it is replaced wholesale), expecting all five stored. Reason: unlisted keys ignored. Intent kept (concurrent updates keep each other's change).
- "keeps a concurrent update's change when renaming at once": sent `note`; now sends `wordCountGoal: 7`. Reason: `note` ignored.

`frontend/tests/unit/resource-sidecar-route.test.ts`:
- "resolves projectId to the on-disk project and updates the sidecar": sent `status`; now `wordCountGoal: 300`. Reason: `status` ignored.
- "behaves exactly as a pure merge when clearKeys is omitted": sent `status`; now `wordCountGoal: 300`. Reason: `status` ignored.

Further tests the full suite showed red (found by `pnpm test:ci`, 12 failed before these edits), same reason:
- `frontend/tests/unit/sidecar-concurrent-writes.test.ts`, the 9 tests "sidecar read-modify-writes at once (FR-22)" (all pairs with the metadata save): the metadata writer set `marker` (seed `marker: "before"`, checked `marker === "after"`); now `wordCountGoal` 1 to 2. Reason: `marker` ignored.
- `frontend/tests/unit/helpers/single-writer-scenarios.ts` scenarios "E revision bump through updateSidecarCore", "E revision bump, project.json absent", "E revision bump, unparseable project.json" (sent `marker`; now `wordCountGoal: 1`) and "S1 updateSidecarCore" (sent `name: "Renamed", extra: 1`; now `wordCountGoal: 1`). The recorded baseline `frontend/tests/fixtures/project-json-lock/single-writer-baseline.json` was edited by hand for those four entries (the sidecar byte string: `marker: "after"` to `wordCountGoal: 1`; S1 `name` "Renamed" to "Scene" and `extra: 1` to `wordCountGoal: 1`). It was not regenerated from the unchanged tree; a single key was used so the unchanged tree's merge writes the same bytes. Test consumer: `project-json-lock-failures.test.ts` "single writer on an idle project (FR-13, FR-23)" (4 of its parametrised cases).

Not edited (pass without an ignored key or FR-23 dependence): `metadata-concurrent-writes.test.ts`, `resource-crud-core-entity-kind-omitted.test.ts`, the `:213` test in the sink file (the Task 9/11 tests already cover FR-23).

E-4 consequence (MEASURED in E-4b, restated): the page resource copy carries `plaintext` (lower-case), which the unchanged `updateSidecarCore` stored in 10 of 10 repetitions; the allowlist does not store it, so a stored sidecar that holds `plaintext` loses it on its next save. `plainText`, `tiptap` and `charCount` were absent from the page copy and from every stored sidecar in the E-4 runs. No test in the suite was found to depend on `plaintext`.

Verification (from `frontend/`, 2026-10-24): `pnpm typecheck` exit 0; `pnpm lint` 0 errors / 392 warnings; `pnpm exec vitest run` on the sink, route, metadata-concurrent-writes, entity-kind-omitted, sidecar-concurrent-writes and project-json-lock-failures files: 6 files, 117 passed; `pnpm test:ci`: 675 files passed, 8240 passed, 0 failed, 2 expected fail, 1 skipped (baseline: 1 failed, 8217 passed; the baseline flaky EntityGraphSettingsPanel test did not fail in this run).

## Sidecar after (Task 13)

MEASURED. Recorded 2026-10-24 (Task 13), HEAD `588ba025`, working tree with the Task 10-12 changes. Command, nine times in a row, from `frontend/` (sandboxed, Vitest 4.1.6, Node v24.15.0): `pnpm exec vitest run tests/unit/resource-crud-core-sidecar-sink.test.ts`. Test: describe "updateSidecarCore allowlist (Feature 93 Task 9)" in that file. Each test uses its own temp project directory created and removed by the test's `withProject` helper.

The rename test (`(b) a stale whole-resource save after a rename leaves the new name, 20 of 20`) and the canonical-save test (`(b) a stale whole-resource save after a canonical save leaves the newer updatedAt, 100 of 100`) assert `kept === 20` and `kept === 100` (`expect(kept).toBe(20)`, `expect(kept).toBe(100)`). Both passed in each of the nine runs, so the newer value was kept in 20 of 20 and 100 of 100 repetitions in every run. The per-repetition counts were not printed by the runner; they are inferred from the passing assertions.

| Run | Started | Test files | Tests | Duration |
|---|---|---|---|---|
| 1 | 15:03:35 MDT | 1 passed / 0 failed | 33 passed / 0 failed / 0 skipped | 3.28s |
| 2 | 15:03:40 MDT | 1 passed / 0 failed | 33 passed / 0 failed / 0 skipped | 3.25s |
| 3 | 15:03:44 MDT | 1 passed / 0 failed | 33 passed / 0 failed / 0 skipped | 2.87s |
| 4 | 15:03:47 MDT | 1 passed / 0 failed | 33 passed / 0 failed / 0 skipped | 3.29s |
| 5 | 15:03:51 MDT | 1 passed / 0 failed | 33 passed / 0 failed / 0 skipped | 3.16s |
| 6 | 15:03:55 MDT | 1 passed / 0 failed | 33 passed / 0 failed / 0 skipped | 3.16s |
| 7 | 15:03:59 MDT | 1 passed / 0 failed | 33 passed / 0 failed / 0 skipped | 3.16s |
| 8 | 15:04:03 MDT | 1 passed / 0 failed | 33 passed / 0 failed / 0 skipped | 3.00s |
| 9 | 15:04:06 MDT | 1 passed / 0 failed | 33 passed / 0 failed / 0 skipped | 2.96s |

Nine of nine runs passed; 0 failed tests in any run.

### Before and after, side by side

| Experiment | Before (Task 3, one run, HEAD `c01bebea`) | After (Task 13, nine runs, HEAD `588ba025`) |
|---|---|---|
| E-1 stale `name` after rename, then stale whole-resource `updateSidecarCore` | stored `name` equalled the pre-rename value in 20 of 20; the renamed value in 0 of 20; unparseable 0, rejected 0 | rename test kept the newer `name` in 20 of 20, in each of 9 runs (assertion `kept === 20` passed 9 of 9) |
| E-2 stale `updatedAt` after a canonical save | stored `updatedAt` equalled the older client value in 100 of 100; the second save's value in 0 of 100; unparseable 0, rejected 0 | canonical-save test kept the newer `updatedAt` in 100 of 100, in each of 9 runs (assertion `kept === 100` passed 9 of 9) |
| E-3 stale `dismissedNoiseTerms` after `setNoiseTermDismissedCore` | stored list lacked "hello" in 20 of 20; held it in 0 of 20; unparseable 0, rejected 0 | the Task 9 file has no repetition-counted test of the E-3 construction (dismiss, load copy, dismiss another term, stale send). It has the table row `(a) ignores a client dismissedNoiseTerms: stored value unchanged and the call succeeds`, which passed in 9 of 9 runs (single call, no repetitions). The E-3 construction was not re-run after the change. |

Unparseable and rejected counts are not measured in the Task 13 runs (the Task 9 tests do not count them); the runs recorded no failing test.

### E-1..E-3 re-run after the allowlist change (MEASURED, orchestrator, 2026-10-24 15:04 MDT)

Command, from `frontend/`: `E123_RESULT_OUT=<scratchpad>/e123-after.json pnpm exec vitest run --config ../specs/features/stale-saves-and-index-races/scripts/vitest.e123.config.ts`. Run after the Part A allowlist change. E-1: stored `name` equals the renamed value in 20 of 20 (stale 0, unparseable 0, rejected 0). E-2: stored `updatedAt` newer in 100 of 100 (stale 0, unparseable 0, rejected 0). E-3: stored list holds "hello" in 20 of 20 (stale 0, unparseable 0, rejected 0). This closes the caveat above that the E-3 construction was not re-run.

## Task 15 gate decision (E-5, RelationshipTypesSettings)

Gate: MET. The E-5 section records a reproduced loss for `RelationshipTypesSettings` (stored block holds both edits in 0 of 20 at both hold points), so Task 15 is gated in (FR-12, FR-13, AC-7). The commit names E-5.

Files changed: `frontend/components/preferences/RelationshipTypesSettings.tsx` (`isSaving` state set around `persist`; `handleAdd`, `handleRemove`, `handleMove` return early while saving; move/remove/Add buttons disabled while saving; section has `aria-labelledby` and `aria-busy`), `frontend/tests/component/RelationshipTypesSettings.test.tsx` (new describe "in-flight guard (Feature 93, E-5)"). No story or decorator change: the component needs no new context. The route and transport contract are unchanged.

MEASURED (TDD): on the unchanged tree the new 20-repetition test and the busy-state test failed (2 failed, 10 passed; the failed-save test passed). After the change all 12 tests in the file pass. The 20-repetition test (first save held after the route has written it, second edit attempted by clicking Add, pressing Enter and clicking Remove while pending, then the first released, then the second edit sent) asserted in each of 20 repetitions that only 1 request was sent while pending, that the client store held the first edit before the second was sent, and that the final stored list and client-store list held both edits: 20 of 20. A failed first save (HTTP 500) showed the error toast and re-enabled the controls. Construction limit: this component test uses a fetch stub with a held response, not the real route; the real-route E-5 script was not re-run in this task.

## Task 16 gate decisions (E-5, ProjectFeatureToggles and OrganizerCardBodySettings)

`ProjectFeatureToggles`: gate MET. The E-5 section records a reproduced loss (stored map holds both edits in 0 of 20 at `after-route` and 0 of 20 at `before-route`; client store holds both in 0 of 20 at both). Gated in; the commit names E-5.

`OrganizerCardBodySettings`: gate MET by the orchestrator's reading of the E-5 counts, recorded here so the owner can see the call. Counts from E-5: at `after-route` the stored block was the second edit's block in 20 of 20, and the client store ended on the first edit's block in 20 of 20; at `before-route` the stored block was the first edit's block in 0 of 20 holding the second edit (second edit absent from the stored block in 20 of 20). The reading treats a final stored block that lacks one of the two edits at one hold point (`before-route`, 0 of 20 holding both), plus a client store that disagreed with the stored block at the other (`after-route`, 20 of 20), as a reproduced lost edit. The E-5 verdict line for this sender ("did not reproduce a loss at `after-route`") is left as written; the reading above is the basis for gating in. The commit names E-5.

Files changed: `frontend/components/preferences/ProjectFeatureToggles.tsx` (`isSaving` around `handleToggle`; early return while saving; checkboxes disabled; section `aria-labelledby` and `aria-busy`), `frontend/components/preferences/OrganizerCardBodySettings.tsx` (`persist` now awaits the thunk with `unwrap`, sets `isSaving`, shows an error toast on failure and returns the length draft to the persisted value; `handleSourceChange` and `handleExcerptChange` return early while saving; select and length input disabled; section `aria-labelledby` and `aria-busy`), `frontend/tests/projectFeatureToggles.test.tsx` and `frontend/tests/organizerCardBodySettings.test.tsx` (new describe "in-flight guard (Feature 93, E-5)" in each). Neither component gained a context requirement, so no story or decorator change. Route and transport contract unchanged. Before this change `OrganizerCardBodySettings` showed no error on a failed save; the toast is new behaviour required by FR-12.

MEASURED (TDD): on the unchanged tree the new tests failed (ProjectFeatureToggles: 2 failed of 16, the failed-save test already passed; OrganizerCardBodySettings: 3 failed of 14). After the change all 39 tests across `projectFeatureToggles.test.tsx`, `organizerCardBodySettings.test.tsx` and `entityFeatureToggles.test.tsx` pass. Each 20-repetition test (first save held after the fake route stored it; second edit attempted while pending; first released; second sent) asserted in every repetition that 1 request was sent while pending, that the client store held the first edit before the second was sent, and that the final stored block and client store held both edits (features: `{entities, synopsis, notes}`; organizer: `{text-excerpt, 400}` after `{text-excerpt, 300}`): 20 of 20 each. A failed save (HTTP 500) showed the error toast and re-enabled the controls. Construction limit: fetch stub with a held response, not the real route; the real-route E-5 script was not re-run. Observed side effect of the guard on the organizer length input: it is disabled while a save is in flight, and edits attempted during that window are dropped (not queued).

## Task 17 gate decisions (E-6, E-7)

E-6 (editor config): gate NOT met for the shapes the modals send. Counts from E-6: overlapping `headings` and `body` saves (6a) lost a change in 0 of 20; older-copy save in the modal shape, `{headings}` only or `{body}` only (6b), reverted in 0 of 20. N/A, unchanged: `editor-config-core.ts` is untouched. The whole-copy shape `{headings, body}` (6c) reverted `body` in 20 of 20; this is recorded as a measured observation of a shape that, by the READ senders in E-6, neither `HeadingSettingsModal` nor `BodySettingsModal` sends. No code was changed for it. Per FR-2 this is not evidence that the case is safe under other timing or other senders.

E-7 (entity-graph settings): gate MET (7a: either key reverted in 20 of 20; types 20 of 20, radius 20 of 20). Decision: no code change, follow-up recorded (AC-8). READ, this task (not run): `app/api/project/entity-graph-settings/route.ts` `handlePut` returns 400 unless the body carries both `entityGraphConnectionTypes` (array of strings) and `entityGraphFocalHopRadius` (number), then calls `setEntityGraphSettingsCore(projectId, connectionTypes, hopRadius)`; `setEntityGraphSettingsCore` (`entity-graph-settings-core.ts:116-143`) assigns both keys inside the `updateProjectJson` mutate from the request. `EntityGraphSettingsPanel.tsx` `persist` always sends both values from its own loaded state (loaded once, `:103-126`; toggles send the panel's types plus the parsed radius, `:159-186`). Because every request carries full values for both keys, a key-level merge inside the mutate has nothing to compare: it cannot tell a key the sender changed from a key it only carried along from its older copy, so it cannot keep the stored value of the unchanged key without changed-key information or a version from the sender. Supplying either changes the request contract (route, `lib/api/entity-graph-settings.ts`, native backend, panel), which this task must not do. Not attempted; no code written or run for it.

Follow-up (for the owner): make the panel send only the key it changed (route accepting either key, the core replacing only a present key, as `updateEditorConfigCore` does for `headings` and `body`), or add a version check to the PUT. Either is a contract change and needs an owner decision.

Source files changed by Task 17: none.
