# Word-count goals (developer)

Feature 61. Spec: [specs/features/word-count-goals.md](../../specs/features/word-count-goals.md).

Purpose

Two independent, optional, total-length word-count goals — one on the project, one on an individual text resource — with an in-app write path for both. The project-level `wordCountGoal` field already existed on `ProjectConfigSchema` (seedable from a project-type spec) before this feature, but the app had no way to set, change, or clear it short of hand-editing `project.json`; this feature adds that write path and introduces the new per-resource field. Both are distinct from Feature 59's `dailyWordGoal` (per-day, not total) and untouched by it.

## Project-wide goal

- Core: `frontend/src/lib/models/word-count-goal-core.ts` — `setWordCountGoalCore(projectId, goal)` sets (non-negative integer) or clears (`null`) `config.wordCountGoal` in `project.json`. It mirrors `writing-log-core.ts`'s `setDailyWordGoalCore` exactly: reads `project.json`, does a read-modify-write inside `withMetaLock`, deletes the config key on `null` rather than ever writing `undefined`, and uses `atomicWriteFile` with the same options. Touches no other config key. `InvalidWordCountGoalError` maps to HTTP 400; locked/keyless-project errors are not caught here and propagate up unchanged.
- Route: `frontend/app/api/project/word-count-goal/route.ts` — `PUT /api/project/word-count-goal`, body `{ projectId, wordCountGoal }` (`wordCountGoal` a non-negative integer or `null`). `projectId` is validated as a UUID; no client-supplied path is accepted. Locked-access errors are rethrown for `withStorageContext` to map to 401/409.
- Client transport: `frontend/src/lib/api/word-count-goal.ts` — `setWordCountGoal(projectId, goal)`, resolved through `createTransport`: HTTP on web/desktop (`httpWordCountGoalTransport`), an in-process backend (`frontend/src/store/transport/native-word-count-goal-backend.ts`, + `.web-stub.ts`) on native, both running the same core. The HTTP path validates its response body against `SetWordCountGoalResponseSchema` (`lib/api/schemas.ts`) and rejects (reporting through `reportTransportValidationFailure`) on a malformed body, network error, or non-2xx status — the save has by then already succeeded server-side, so the caller re-reads rather than trusting a fabricated value.
- UI: `frontend/components/Layout/WordCountGoalField.tsx`, rendered in the "Writing Goals" tab of Project Settings (`ProjectSettingsDialog.tsx`) directly below `DailyWordGoalField.tsx`. An empty input parses to `null` (clear); anything else must be a non-negative integer or the field shows `INVALID_MESSAGE` ("Enter a whole number of words, 0 or greater.") without calling the transport. Errors and the saved-confirmation message are conveyed by text and `role="alert"`/`role="status"`, never by color (STYLING.md: red is reserved for position/canonical-state indicators, never used here).

**Copy strings (working copy, not yet confirmed — check `WordCountGoalField.tsx` directly, as these may have changed since this doc was written):** heading "Project word-count goal"; label "Total word-count goal"; helper text "Total words you're aiming for across the whole project. Separate from the daily writing goal above. Leave empty for no goal."; button "Save word-count goal" / "Saving…"; saved messages "Project word-count goal saved." / "Project word-count goal cleared."

## Per-resource goal

- Schema: a new optional `wordCountGoal` field (non-negative integer) on `TextResourceSchema` (`frontend/src/lib/models/schemas.ts`) and the `TextResource` interface (`frontend/src/lib/models/types.ts`). Scoped to text resources only, mirroring `wordCount`'s own scoping.
- Transport: **no new transport module was needed.** This is the Task 3 finding this doc is here to record: the resource goal rides the _existing_ sidecar transport, `updateSidecar` (`frontend/src/lib/api/resources.ts`), because that transport's HTTP path never validated its response body for any field to begin with — it is fire-and-forget by design. Clearing goes through `updateSidecar`'s `clearKeys` parameter (`["wordCountGoal"]`), not an `undefined`-valued field in the body, since `JSON.stringify` drops an `undefined`-valued key before the request ever reaches the server (the same bug class Feature 61's own brief on `patchRevisionContent` names).
- UI: `frontend/components/Sidebar/WordCountGoalSection.tsx`, a `CollapsibleSection`-style "Word count goal" section rendered from `frontend/components/Sidebar/MetadataSidebar.tsx`, gated on `editableResource.type === "text"`. Patterned on `EntitySection.tsx`'s persist-with-`clearKeys` approach: `updateResource` optimistically updates Redux, then `updateSidecar` writes the sidecar. Validation (non-negative integer, or blank to clear) happens client-side before any request; an invalid value shows a `role="alert"` message and calls no transport.
- Progress: when a goal is set and greater than 0, the section renders `frontend/components/WorkArea/WordCountProgressBar.tsx` (`current`/`goal` props). The bar uses only `bg-gw-primary`/`bg-gw-chrome2` tokens — confirmed no red is used anywhere in its rendering.
- No aggregation: the resource goal does not appear in the Data view, the "By status" roll-up (Feature 60), or anywhere else outside that resource's own sidebar section. It is scoped purely to that one resource.

## Locked/keyless projects

Both goals fail closed on a locked or keyless encrypted project (`isLockedAccessError`, `locked-access.ts`) rather than degrading to zero or absent — confirmed by `frontend/tests/unit/word-count-goal-core.test.ts`, `frontend/tests/unit/word-count-goal-route.test.ts`, and the existing generic `frontend/tests/unit/resource-crud-core-locked-sidecar.test.ts` (which already covers `updateSidecarCore` for any field, including `wordCountGoal`, with no field-specific case needed for the resource goal).

## Progress display is never red

Per FR-3, progress toward either goal is never shown in red anywhere in the UI — a measured property of the current markup (`WordCountProgressBar.tsx`'s classes), not a claim about future styling.
