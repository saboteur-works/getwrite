# Feature: In-app word-count goals (project and resource)

## Overview

A writer can already have a total-length word-count goal stored on a project (`wordCountGoal` on `ProjectConfig`), and progress against it is already shown in the Data view, but nothing in the app lets a writer set, change, or clear that goal — it can only be edited by hand in `project.json` or seeded from a project-type spec. This feature adds the missing write path for the existing project goal and introduces a new, optional per-resource word-count goal, so a writer can track progress toward a total length at both the project and the individual-resource level without leaving the app.

Parent: `specs/product/getwrite.md` FR-47, FR-50, US-20; `specs/product/getwrite.features.md` Feature 61.

## Goals

- A writer can set, change, and clear a project's word-count goal from inside the app.
- A writer can set, change, and clear an optional word-count goal on an individual resource.
- Progress against both goals is visible without being indicated in red.
- The new write paths behave identically on web/desktop and native.

## Non-goals

- No change to how `wordCountGoal` is seeded from a project-type spec at project creation.
- No new AI-assisted goal suggestions.
- No change to Feature 59's daily writing goal (`dailyWordGoal`) or its display.
- No change to Feature 60's status roll-up.
- No backfill or migration of existing `project.json` files that already carry `wordCountGoal`.

## User stories

- US-1: As a writer on deadline, I want to set a word-count goal for my project from inside the app so that I can track progress without editing `project.json` by hand. [US-20]
- US-2: As a writer on deadline, I want to set a word-count goal for an individual resource so that I can track progress on that resource specifically. [US-20]

## Functional requirements

- FR-1: A writer MUST be able to set, change, and clear a project's `wordCountGoal` from inside the app, via a second field in the existing "Writing Goals" tab of Project Settings (`ProjectSettingsDialog.tsx`), alongside `DailyWordGoalField`, reusing its layout (Card, label, `Input`, save button, `role="alert"` error, `role="status"` saved message). Clearing MUST follow `DailyWordGoalField`/`setDailyWordGoalCore`'s existing pattern exactly: an empty input parses to `null` (distinct from `undefined`, which is invalid input), and `null` deletes the `wordCountGoal` key from project config, so progress display and the Data view treat the project as goal-less again. [US-1]
- FR-2: A writer MUST be able to set, change, and clear an optional word-count goal on a text resource, via a new `CollapsibleSection` titled "Word count goal" in `MetadataSidebar.tsx`, patterned on `EntitySection.tsx`'s persist-with-`clearKeys` approach: clearing deletes the field through the sidecar's `clearKeys` mechanism rather than sending an `undefined`-valued field in the body (which `JSON.stringify` drops before the request is sent). The goal MUST be stored as a new field on that resource's sidecar, validated in `schemas.ts` as a non-negative integer or absent/null with no upper bound (matching `wordCountGoal`'s existing `z.number().int().nonnegative().optional()` and `dailyWordGoal`'s runtime check), and MUST apply to text resources only, mirroring `wordCount`'s own scoping (`TextResourceSchema`-only, and the existing `type === "text"` gating in stub-resources and the status roll-up). [US-2]
- FR-3: Progress display for both the project goal and the resource goal MUST NOT be indicated in red. The resource goal's progress MUST be shown inside its own "Word count goal" sidebar section (co-located with its setter), reusing `WordCountProgressBar` (`current`/`goal` props, no project coupling) — not the editor footer, not the resource-tree row. [US-1] [US-2]
- FR-4: Every new client transport this feature adds (project goal write, resource goal read/write) MUST resolve through `createTransport` with a native backend, a web-stub, and HTTP response-body validation, per FR-50 (owned by Feature 59), mirroring `lib/api/writing-log.ts`'s contract exactly: every method MUST reject on network error, non-2xx response, or a malformed response body (validated via a new Zod schema in `lib/api/schemas.ts`, reported through `reportTransportValidationFailure`) rather than degrade a failed read to zero or absent. [US-1] [US-2]
- FR-5: The resource goal field MUST be optional; a resource with no goal set MUST behave identically to today (no goal, no progress comparison shown). The resource goal MUST NOT aggregate anywhere (no Data view or status-roll-up surface); it stays purely per-resource, consistent with the Non-goals section walling off Feature 60. [US-2]
- FR-6: A locked or keyless (encrypted) project MUST fail closed on any read or write of either goal, via `isLockedAccessError` (`locked-access.ts`), rather than degrading to an empty or zero value. [US-1] [US-2]

## Open questions

Resolved at Gate 3 by the user ("take your recommendations"), 2026-09-27:

- OQ-1: The project goal control is a second field in the existing "Writing Goals" tab of Project Settings (`ProjectSettingsDialog.tsx`), alongside `DailyWordGoalField`, reusing its layout (Card, label, `Input`, save button, `role="alert"` error, `role="status"` saved message). Working-copy strings (not yet user-confirmed): heading "Project word-count goal"; label "Total word-count goal"; helper text "Total words you're aiming for across the whole project. Separate from the daily writing goal above. Leave empty for no goal." — Impact: FR-1
- OQ-2: The per-resource goal control is a new `CollapsibleSection` titled "Word count goal" in `MetadataSidebar.tsx`, patterned on `EntitySection.tsx`'s persist-with-`clearKeys` approach. — Impact: FR-2
- OQ-3: Per-resource progress is shown inside that same sidebar section (co-located with its own setter), reusing `WordCountProgressBar` (`current`/`goal` props, no project coupling) — not the editor footer, not the resource-tree row. — Impact: FR-2, FR-3
- OQ-4: The per-resource goal does NOT aggregate anywhere (no Data view or status-roll-up surface); it stays purely per-resource, consistent with the existing Non-goals section walling off Feature 60. — Impact: FR-2
- OQ-5: Clearing mirrors `DailyWordGoalField`/`setDailyWordGoalCore` exactly: an empty input parses to `null` (distinct from `undefined`, which is invalid input); `null` means delete the config key (project goal) or delete via the sidecar's `clearKeys` mechanism (resource goal), never an `undefined`-valued field in the body, since `JSON.stringify` drops it. — Impact: FR-1, FR-2
- OQ-6: Both goals validate as a non-negative integer or absent/null, matching `wordCountGoal`'s existing schema and `dailyWordGoal`'s runtime check; no upper bound (matches both existing goal fields). — Impact: FR-1, FR-2
- OQ-7: The resource goal applies to text resources only, mirroring `wordCount`'s own scoping (`TextResourceSchema`-only, and the existing `type === "text"` gating in stub-resources and the status roll-up). — Impact: FR-2
- OQ-8: Both new transports mirror `lib/api/writing-log.ts`'s contract exactly: every method rejects on network error, non-2xx response, or a malformed response body (validated via a new Zod schema in `lib/api/schemas.ts`, reported through `reportTransportValidationFailure`); a failed read is never degraded to zero/absent. — Impact: FR-4
- OQ-9: Confirmed to reproduce identically for `wordCountGoal` (the `AppShell.tsx:1124`-style unrefreshed local project state). This is out of scope for this feature, already reflected in the spec's Out of scope (deferred) section, and tracked as the pre-existing `daily-writing-log.md` OQ-17 issue, not duplicated as a new tracked item. — Impact: FR-1

## Out of scope (deferred)

- Daily writing goal (`dailyWordGoal`, Feature 59, already shipped).
- Status roll-up (Feature 60).
- Prose diagnostics (Feature 62).
- Resolving the pre-existing `AppShell` stale-config-copy issue noted in OQ-9 (tracked, not owned, by this feature).
