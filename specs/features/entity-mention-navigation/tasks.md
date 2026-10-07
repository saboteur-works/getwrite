# Tasks: Entity mention navigation

Source spec: `specs/features/entity-mention-navigation.md`. Granularity: story points (1/2/3/5/8).

Code read before writing this list (facts, not guesses): `frontend/src/lib/models/mentions-core.ts` (`EntityMentionedIn` type ~:72-78, `buildMentionedRow` ~:217-255 which already computes `snippets` from `record.offsets` at ~:238-246, `getEntityMentionedIn` ~:340-390); `frontend/src/lib/api/schemas.ts` (`EntityMentionedInSchema` ~:413-420, parallel to `mentionedIn` ~:423); `frontend/src/lib/api/mentions.ts` (the `MentionsTransport` interface and `httpMentionsTransport`/`createTransport` collapse, `getEntityMentionedIn` method); `frontend/src/store/transport/native-mentions-backend.ts` + `.web-stub.ts` (native parity pair this feature's offset field must also round-trip through); `frontend/components/Sidebar/EntityMentionsSection.tsx` (snippet rendering, `renderSnippetWithMatch`, `setSelectedResourceId`/`updateResource` dispatch, `useEntityMentions`); `frontend/components/TipTapEditor.tsx` (editor entry point FR-3/FR-4/FR-5/FR-8 hook into); `frontend/components/Editor/Extensions/EntityHighlightDecorationExtension.ts` (the persistent decoration extension FR-8 explicitly must NOT reuse); `frontend/src/lib/writing-log-signal.ts` and `frontend/src/lib/api/transport-validation.ts`'s `reportTransportValidationFailure` (the stable-deduplicated-toast-id pattern FR-9 mirrors); `frontend/src/lib/toast-service.ts` (`toastService.error` with an options/id parameter); `frontend/src/lib/models/word-count-goal-core.ts` (the exact read-modify-write-under-`withMetaLock`, delete-on-null, `InvalidWordCountGoalError`-shaped pattern FR-10's core must mirror, including `requireProjectRoot`/`InvalidProjectIdCoreError` reuse); `frontend/components/Layout/ProjectSettingsDialog.tsx` (`TAB_OPTIONS` ~:70-81, `"writing-goals"`/`"noise-words"` tabs as the two nearest precedents for adding `"entities"`); `frontend/components/Layout/WordCountGoalField.tsx` (the number-input/`inputMode="numeric"`/regex-validated/explicit-Save field convention FR-10's `MentionHighlightDurationField.tsx` must follow); `frontend/src/lib/models/schemas.ts` (`ProjectConfigSchema`, where `wordCountGoal`/`dailyWordGoal` already live as floor-only numeric fields, confirming FR-10's claim that this feature's field is the schema's first min-AND-max-bounded one).

Tasks are ordered so every dependency appears earlier in the list (a strict topological order), which groups the four independent starting lines — offset-type plumbing, the resolver, the highlight extension, and the settings schema field — before the tasks that build on each.

### Task 1: Thread mention offsets through `mentions-core.ts`'s `EntityMentionedIn` type
**What:** Adds a parallel `offsets: number[]` array (index-aligned with `snippets` and `ambiguousWith`) to the `EntityMentionedIn` type and populates it in `buildMentionedRow` from the same `record.offsets` already used to build `snippets`, and in `getEntityMentionedIn`'s `isMentioned: false` fallback row (empty `offsets: []` alongside the existing empty `snippets: []`).
**Files:** `frontend/src/lib/models/mentions-core.ts`, `frontend/tests/unit/mentionsCore.test.ts` (or nearest existing mentions-core test file)
**Done when:** a unit test confirms `getEntityMentionedIn`'s returned rows carry an `offsets` array of the same length as `snippets`, with `offsets[i]` equal to the character offset `snippets[i]` was built from (asserted against a fixture mention index with a known offset, not just length parity); a link-only row (`isMentioned: false`) has `offsets: []`; no change to `snippets`, `ambiguousWith`, or their existing ordering is introduced (an existing co-occurrence/mentions test asserting snippet order continues to pass unmodified).
**Depends on:** none
**Estimate:** 2
**Notes:** This is FR-1's entire scope. Do not touch `getEntityCooccurrence` or any other function in this file — `record.offsets` is read, never recomputed.
**Done:** [ ]

### Task 2: Add a plain-text-offset-to-ProseMirror-position resolver
**What:** Adds a pure function (e.g. `resolveOffsetToPosition(doc: ProseMirrorNode, offset: number): number | null`) exposed from `TipTapEditor.tsx` or a sibling module it re-exports through, walking the document's text nodes and accumulating character counts per node to convert a plain-text character offset into a valid ProseMirror position, returning `null` for an offset beyond the document's own plain-text length rather than throwing or clamping.
**Files:** `frontend/components/TipTapEditor.tsx` (or a new sibling module, e.g. `frontend/components/Editor/offset-resolver.ts`, if a pure function is cleaner to keep out of the component file — decide and record which), `frontend/tests/unit/offsetResolver.test.ts` (new, or nearest existing TipTapEditor unit test file)
**Done when:** a unit test confirms the resolver returns the correct ProseMirror position for an offset in a single-paragraph document, for an offset after a `hardBreak` node, and for an offset in the second of several block nodes (confirming node-boundary positions are correctly skipped over, not counted as plain-text characters) — i.e. the specific multi-node case FR-3 calls out; a test confirms an offset at or beyond the document's total plain-text length returns `null` rather than an out-of-range position or a thrown error; `pnpm typecheck` clean.
**Depends on:** none
**Estimate:** 3
**Notes:** This is FR-3's entire scope and has no dependency on Task 1 — it operates purely on a ProseMirror document and a number, with no mention-index or transport involvement, so it can be built and tested in parallel with Task 1 and the FR-10 settings line (Tasks 4, 7, 8, 9, 10).
**Done:** [ ]

### Task 3: Build the one-shot transient highlight decoration extension
**What:** Adds new, dedicated TipTap decoration infrastructure for a one-shot navigation flash — a fresh extension (e.g. `MentionJumpHighlightExtension.ts`, sibling to but explicitly NOT reusing or extending `EntityHighlightDecorationExtension.ts`) that applies a decoration over a given `{ from, to }` span and clears it automatically after a caller-supplied duration in milliseconds, with no polling/continuous recomputation — the decoration is set once and cleared once by a timer.
**Files:** `frontend/components/Editor/Extensions/MentionJumpHighlightExtension.ts` (new), `frontend/tests/unit/mentionJumpHighlightExtension.test.ts` (new)
**Done when:** a unit test confirms calling the extension's apply function with a span and a duration produces a decoration covering exactly that span, and that the decoration is gone from the editor state after the duration elapses (using a fake/mock timer, not a real `setTimeout` wait); a test or code-comment-backed assertion confirms this module imports nothing from `EntityHighlightDecorationExtension.ts` and vice versa, satisfying FR-8's explicit non-reuse requirement.
**Depends on:** none
**Estimate:** 3
**Notes:** This is half of FR-8's scope (the decoration mechanism itself); Task 12 wires the configured duration (FR-10, via Task 9) into this extension's caller rather than this task hardcoding 2 seconds anywhere permanent — this task's own tests may use a fixed duration for isolation, but the production call site (Task 12) is what reads the real value.
**Done:** [ ]

### Task 4: Settings schema field — `config.mentionHighlightDurationSeconds`
**What:** Adds an optional `mentionHighlightDurationSeconds` field to `ProjectConfigSchema` (`frontend/src/lib/models/schemas.ts`): an integer bounded 1-10 inclusive, with the schema itself enforcing both bounds (this codebase's first min-AND-max-bounded numeric config field, per the spec's own observation that `wordCountGoal`/`dailyWordGoal` are floor-only).
**Files:** `frontend/src/lib/models/schemas.ts`, `frontend/tests/unit/schemas.test.ts` (or nearest existing schema test file)
**Done when:** a test confirms `ProjectConfigSchema` accepts integers 1 and 10 (the inclusive bounds), rejects 0 and 11, rejects a non-integer (e.g. `2.5`), and accepts the field's absence; `pnpm typecheck` clean.
**Depends on:** none
**Estimate:** 1
**Notes:** Schema-level bounds only — this task does not add the core function's own validation (Task 7) or wire any reader/writer; it exists so Task 7's core can rely on a schema that already won't silently coerce an out-of-range value on a raw parse elsewhere in the codebase (e.g. project-load), even though Task 7 enforces the same bounds again at the write boundary per FR-10's explicit "reject, not clamp" requirement.
**Done:** [ ]

### Task 5: Carry the offset field through the HTTP response schema and native transport
**What:** Adds `offsets: z.array(z.number())` to `EntityMentionedInSchema` (`frontend/src/lib/api/schemas.ts`), confirms `frontend/src/lib/api/mentions.ts`'s `getEntityMentionedIn` (HTTP transport) and `frontend/src/store/transport/native-mentions-backend.ts` (native transport) both pass Task 1's `offsets` field through untouched end to end with no field-level mapping that could drop it, and updates `.web-stub.ts`'s throw-if-reached contract if its own type signature needs the new field to stay consistent.
**Files:** `frontend/src/lib/api/schemas.ts`, `frontend/src/lib/api/mentions.ts`, `frontend/src/store/transport/native-mentions-backend.ts`, `frontend/src/store/transport/native-mentions-backend.web-stub.ts` (type-only touch if needed), `frontend/tests/unit/mentionsTransport.test.ts` (or nearest existing transport test file), `frontend/tests/unit/native-mentions-backend.test.ts` (or nearest existing native-mentions-backend test file)
**Done when:** a schema-parse test confirms `EntityMentionedInSchema` accepts a response carrying `offsets` and rejects one with a length mismatch against `snippets` only if the schema is written to enforce that (record whichever is actually true — Zod array-length parity across sibling fields is not automatically enforced, so state plainly whether this task adds that cross-field check or leaves it unenforced, matching `ambiguousWith`'s own existing precedent); an HTTP-transport test confirms a fixture response's `offsets` field survives unchanged through `getEntityMentionedIn`; a native-backend test confirms the native transport returns the same `offsets` values as the HTTP transport for the same fixture (mirroring the existing native/web parity test pattern for this module); `pnpm typecheck` clean.
**Depends on:** 1
**Estimate:** 2
**Notes:** This is FR-2's entire scope. No new transport module is needed — this is an existing transport's existing response shape gaining one field, not a new endpoint.
**Done:** [ ]

### Task 6: Add the staleness check against the entity's name/aliases
**What:** Adds a function (e.g. `isOffsetStillAMention(doc: ProseMirrorNode, position: number, terms: string[]): boolean`) that checks the resolved position's surrounding text against the entity's own name and aliases using the same word-boundary/possessive/plural matching envelope `entity-detection.ts` already exposes (`ATTACHED_CHAR_CLASS`, `POSSESSIVE_OR_PLURAL_SUFFIX`, reused rather than reimplemented, mirroring `EntityMentionsSection.tsx`'s own existing reuse of these exports), returning `false` when none of the terms match at that position.
**Files:** `frontend/components/Editor/offset-resolver.ts` (or wherever Task 2 landed the resolver — co-located as a sibling function), `frontend/tests/unit/offsetResolver.test.ts` (extend)
**Done when:** a unit test confirms the check passes when the resolved position's nearby text still contains the entity's name or one of its aliases (including a possessive/plural form, matching the detection envelope's own existing test coverage), and fails when the surrounding text has changed such that none of the terms appear there any more (simulating a stale offset from an edited document); the function takes `terms: string[]` generically rather than being entity-aware itself, so it has no dependency on `mentions-core.ts` or any transport.
**Depends on:** 2
**Estimate:** 2
**Notes:** This is FR-9's resolution check — the toast/no-op behavior around it is Task 12's concern, not this task's. Reuses `entity-detection.ts`'s exported matching primitives; does not reimplement word-boundary/possessive/plural logic a second time.
**Done:** [ ]

### Task 7: `setMentionHighlightDurationCore` model core and HTTP route
**What:** Adds `frontend/src/lib/models/mention-highlight-duration-core.ts`, mirroring `word-count-goal-core.ts`'s `setWordCountGoalCore` exactly (`requireProjectRoot`, read-modify-write under `withMetaLock`, delete-on-`null`, never write `undefined`, `atomicWriteFile` with the same options), setting/clearing `config.mentionHighlightDurationSeconds`; rejects (does not clamp) a value that is not an integer or falls outside 1-10 inclusive by throwing a new `InvalidMentionHighlightDurationError` (sibling to `InvalidWordCountGoalError`); adds `PUT /api/project/mention-highlight-duration`, modelled on `app/api/project/word-count-goal/route.ts`.
**Files:** `frontend/src/lib/models/mention-highlight-duration-core.ts` (new), `frontend/app/api/project/mention-highlight-duration/route.ts` (new), `frontend/tests/unit/mention-highlight-duration-core.test.ts` (new), `frontend/tests/unit/mention-highlight-duration-route.test.ts` (new)
**Done when:** tests confirm `setMentionHighlightDurationCore(projectId, value)` with an integer 1-10 sets `config.mentionHighlightDurationSeconds`, touching no other config key; `null` deletes the key; a non-integer or an out-of-range integer (0, 11, 2.5) throws `InvalidMentionHighlightDurationError` rather than clamping or silently no-opping; an invalid `projectId` throws `InvalidProjectIdCoreError`; a locked or keyless project rethrows via the existing locked-access mechanism rather than degrading, mirroring `word-count-goal-core.test.ts`'s equivalent case; the route maps the core's validation error to 400 and lets locked-access errors propagate to `withStorageContext` (401/409); `pnpm typecheck` clean.
**Depends on:** 4
**Estimate:** 3
**Notes:** This is the bulk of FR-10's model/route half. Follow `word-count-goal-core.ts`/its route file nearly line for line — this feature's spec explicitly calls for the identical shape.
**Done:** [ ]

### Task 8: Client transport module and native backend parity for the duration setting
**What:** Adds `frontend/src/lib/api/mention-highlight-duration.ts` resolving through `createTransport` (HTTP implementation calling Task 7's route, degrade-vs-reject contract decided and recorded — mirroring `word-count-goal.ts`'s reject-on-failure posture since a silently-degraded duration read is indistinguishable from "never set" per this codebase's failure-visibility standard), plus `frontend/src/store/transport/native-mention-highlight-duration-backend.ts` (in-process, calling Task 7's core directly) and its `.web-stub.ts` counterpart, with the `next.config.mjs` `turbopack.resolveAlias` entry registered for the exact specifier used.
**Files:** `frontend/src/lib/api/mention-highlight-duration.ts` (new), `frontend/src/store/transport/native-mention-highlight-duration-backend.ts` (new), `frontend/src/store/transport/native-mention-highlight-duration-backend.web-stub.ts` (new), `frontend/next.config.mjs`, `frontend/tests/unit/mention-highlight-duration-transport.test.ts` (new), `frontend/tests/unit/native-mention-highlight-duration-backend.test.ts` (new), `frontend/tests/unit/native-mention-highlight-duration-backend-web-exclusion.test.ts` (new)
**Done when:** a test confirms the HTTP transport's set/get round-trips against Task 7's route; a test confirms the native backend calls Task 7's core directly and returns the same result as HTTP for the same fixture; the web-exclusion test confirms the web-stub throws if reached; `turbopack.resolveAlias` substitutes the web-stub for the exact import specifier used; `pnpm --filter getwrite-frontend build` (web target) completes with no `node:*`-only module reachable from the new transport module in its output.
**Depends on:** 7
**Estimate:** 3
**Notes:** This is the remainder of FR-10's transport half, following the entity-cooccurrence/word-count-goal native-parity precedent exactly, including the `resolveAlias`-omission failure mode those features' own tasks call out.
**Done:** [ ]

### Task 9: Read-side client API for the configured duration, consumed by the jump flow
**What:** Adds (or confirms, if Task 8's transport module already exposes a sufficient read method) a simple way for `EntityMentionsSection.tsx`'s click handler to read the current project's configured `mentionHighlightDurationSeconds`, falling back to 2 seconds when unset — this is the exact read Task 12 wires into the highlight call. Likely satisfied directly by Task 8's transport module's existing get method plus a small fallback wrapper; if so, this task is primarily a wiring/confirmation task, not new transport code — record which is true after reading Task 8's shipped interface.
**Files:** `frontend/src/lib/api/mention-highlight-duration.ts` (extend only if a read method or fallback wrapper is missing), `frontend/tests/unit/mention-highlight-duration-transport.test.ts` (extend if needed)
**Done when:** a test confirms a project with no configured value resolves to a 2-second fallback at the read site (not persisted to disk — the 2-second default is never written back as a value), and a project with a configured value (e.g. 5) resolves to that value; this is confirmed as the exact function Task 12 calls, with no duplicate fallback logic defined a second time elsewhere.
**Depends on:** 8
**Estimate:** 1
**Notes:** Deliberately small and likely to collapse into "already covered by Task 8, confirmed here" — do not invent new transport code if Task 8's shipped interface already supports this read.
**Done:** [ ]

### Task 10: "Entities" Project Settings tab and `MentionHighlightDurationField`
**What:** Adds a new `"entities"` tab (label "Entities") to `ProjectSettingsDialog.tsx`'s `TAB_OPTIONS`, placed alongside the existing Heading Styles/Body Text Styles/Default Revision Name/Manage Tags/Metadata/Writing Goals/Noise Words tabs per FR-10's ordering, containing exactly one field — `MentionHighlightDurationField.tsx`, a number input following `WordCountGoalField.tsx`'s free-text/`inputMode="numeric"`/regex-validated/explicit-Save convention (not a slider), prefilled with 2 when the project has never set a value, saving/clearing via Task 8's transport.
**Files:** `frontend/components/Layout/MentionHighlightDurationField.tsx` (new), `frontend/components/Layout/ProjectSettingsDialog.tsx` (`TAB_OPTIONS` and tab content), `frontend/tests/mentionHighlightDurationField.test.tsx` (new), existing `frontend/tests/projectSettingsDialog*.test.tsx` (extend, do not weaken)
**Done when:** a test confirms the field shows the current configured value or 2 when unset; a test confirms saving a value 1-10 persists via Task 8's transport; a test confirms a value outside 1-10 or non-integer shows an accessible validation error and does not save (client-side reject, not clamp, mirroring FR-10's core-level reject); a test confirms the new "Entities" tab renders in `TAB_OPTIONS` at the position the spec specifies and contains no other setting beyond this one field (explicitly not relocating the existing `entityKind`/`entityHighlighting`/relationship-type settings, per the spec's "Out of scope" note); existing dialog tests pass; `pnpm lint` no new errors.
**Depends on:** 8
**Estimate:** 3
**Notes:** This is the UI half of FR-10. Working-copy field label/helper text are this task's own design choice absent explicit copy in the spec — follow `WordCountGoalField.tsx`'s tone and flag the strings as working copy in this task's Notes once written, the same way Feature 61's Task 4 flagged its own copy.
**Done:** [ ]

### Task 11: Click handler — same-resource jump (FR-4, FR-6, FR-7)
**What:** Changes `EntityMentionsSection.tsx`'s mention-snippet rendering so each snippet is an activatable `<button>` (not a bare click handler on the `<p>`), and wires its click, for the case where the snippet's resource is already the selected resource, to resolve the snippet's offset (Task 2) against the live editor document, run the Task 6 staleness check, and — only when it passes — move the editor selection to the resolved position and scroll it into view (the Task 3 highlight itself is wired in Task 12, once the duration setting exists; this task may call it with a temporary fixed duration since Task 9 is not a dependency here, and must be revisited if the call site changes — record which is true). A row with no detected mentions (`isMentioned: false`) keeps its existing resource-name-only click behavior unchanged.
**Files:** `frontend/components/Sidebar/EntityMentionsSection.tsx`, `frontend/tests/component/EntityMentionsSection.test.tsx`
**Done when:** a test confirms each mention snippet renders as a `<button>` (or equivalent keyboard-operable element) rather than a non-interactive element with a click handler, satisfying FR-7; a test confirms clicking a snippet when its resource is already selected resolves the offset, passes the staleness check (mocked true), and moves the editor selection/scroll without dispatching `setSelectedResourceId`; a test confirms clicking an ambiguous snippet (one with a non-empty `ambiguousWith` entry) gets the identical jump behavior, with no special-casing branch for it; a test confirms a link-only row's resource-name button still only calls `setSelectedResourceId` and does nothing else, unchanged from its current behavior (FR-6); `pnpm --filter getwrite-frontend exec vitest run EntityMentionsSection` is green.
**Depends on:** 5, 2, 6
**Estimate:** 5
**Notes:** This is the bulk of FR-4, all of FR-6, and all of FR-7. The highlight call itself is stubbed/temporary here per the note above; Task 12 finalizes it once the real duration is wired.
**Done:** [ ]

### Task 12: Click handler — cross-resource jump, staleness toast, and final highlight wiring (FR-5, FR-8, FR-9)
**What:** Extends Task 11's click handler for the case where the snippet's resource is NOT the currently selected resource: dispatches `setSelectedResourceId` first, waits for that resource's content to finish loading into the editor, then performs the same resolve-staleness-check-and-jump sequence against the newly loaded document (never against the previous resource's document). Adds the FR-9 no-op-plus-toast path for a failed staleness check — a fixed message, a stable deduplicated toast id (mirroring `reportWritingLogSignal`/`reportTransportValidationFailure`'s pattern) via `toastService.error`, no raw document content in the message, no selection/scroll/highlight side effect on failure. Wires the Task 3 highlight extension's real call site to read the resolved mention-highlight duration (via Task 9's client API, falling back to 2 seconds when unset) rather than a hardcoded or temporary value.
**Files:** `frontend/components/Sidebar/EntityMentionsSection.tsx`, `frontend/tests/component/EntityMentionsSection.test.tsx`
**Done when:** a test confirms clicking a snippet for a non-selected resource dispatches `setSelectedResourceId`, waits for the new resource's content to load, and only then resolves/jumps against the newly loaded document (a test fixture that would fail if the jump fired against stale/previous document state); a test confirms a failed staleness check (Task 6 returns `false`) no-ops — no selection change, no scroll, no highlight call — and shows exactly one toast with a stable id even across two rapid repeated clicks (no stacked toasts); a test confirms the toast message contains no raw document/snippet text; a test confirms a successful jump calls the Task 3 highlight extension with the duration read from Task 9's client API (mocked), falling back to 2000ms when that read yields no configured value; `pnpm --filter getwrite-frontend exec vitest run EntityMentionsSection` is green.
**Depends on:** 3, 11, 9
**Estimate:** 5
**Notes:** This is FR-5's entire scope, FR-9's entire scope, and the remaining half of FR-8 (reading the real configured duration). This is the main convergence point for the offset-plumbing, resolver/staleness, highlight-extension, and settings-duration lines of work.
**Done:** [ ]

### Task 13: Storybook stories and a11y pass for `MentionHighlightDurationField`
**What:** Adds `MentionHighlightDurationField.stories.tsx` covering the unset/defaulted-to-2 state, a configured value, and the validation-error state, matching `WordCountGoalField.stories.tsx`'s conventions and opting in to `a11y: { test: "error" }`.
**Files:** `frontend/components/Layout/MentionHighlightDurationField.stories.tsx` (new), `frontend/tests/a11y/mentionHighlightDurationField.a11y.test.tsx` (new, if this codebase's convention keeps a11y tests separate from stories — check `WordCountGoalField`'s own a11y test location first and mirror it)
**Done when:** all three stories render without error and pass the `@storybook/addon-a11y` check with no new violations; `pnpm test-storybook` (run outside the sandbox, per this project's known sandbox limitation) passes for the new stories.
**Depends on:** 10
**Estimate:** 2
**Notes:** Storybook/Playwright story-test execution must be run outside the Bash sandbox (recurring project note) — do not attempt it inside this session's sandbox and file it as a defect if it fails only there.
**Done:** [ ]

### Task 14: Accessibility pass for the mention-snippet click targets
**What:** Adds or extends an a11y test confirming each mention-snippet button (Task 11) is keyboard-operable (reachable via Tab, activatable via Enter/Space) and that the transient highlight (Task 3/12) does not rely on color alone to convey state, consistent with `docs/standards/accessibility.md`.
**Files:** `frontend/tests/a11y/entityMentionsSection.a11y.test.tsx` (new, or nearest existing a11y test file for this component — grep before creating), `frontend/components/Sidebar/EntityMentionsSection.stories.tsx` (extend with a mention-snippet-focused story if one does not already cover it)
**Done when:** an axe-core check via `frontend/tests/a11y/helpers/axe.ts` reports zero violations for the snippet-button markup; a keyboard-interaction test confirms a snippet button receives focus via Tab and activates via both Enter and Space, mirroring this component's existing convention for its other interactive rows; a check (visual-contrast reasoning documented in the test or a code comment) confirms the highlight decoration is distinguishable without relying on color alone (e.g. paired with a border or other non-color cue), satisfying FR-7's accessibility-standard reference.
**Depends on:** 3, 11, 12
**Estimate:** 2
**Notes:** This is FR-7's remaining accessibility-verification scope beyond the `<button>` markup itself, which Task 11 already covers structurally.
**Done:** [ ]

### Task 15: Integration test — end-to-end click-to-jump across both same- and cross-resource cases
**What:** Adds an integration test against a fixture project with a multi-block-node resource and a declared entity mentioned in two different resources, exercising the full path: click a same-resource snippet and confirm the editor selection/highlight lands at the exact character offset recorded in the mention index (Task 1); click a cross-resource snippet and confirm the resource switch completes before the jump fires, landing correctly in the newly loaded document; and a staleness case where the fixture resource's content is mutated after the mention index was built, confirming the no-op-plus-toast path fires with no selection/scroll/highlight change.
**Files:** `frontend/tests/integration/entityMentionNavigation.test.ts` (new)
**Done when:** the test asserts all three scenarios above against the same fixture in one run and passes, including a byte-level or position-level assertion that the resolved ProseMirror position corresponds to the exact plain-text offset the mention index recorded for the matched scenario, not merely "some highlight appeared."
**Depends on:** 11, 12
**Estimate:** 5
**Notes:** This is the one test in the suite that exercises FR-3 through FR-5 and FR-9 together end to end, not just at the unit level of each resolver/handler piece.
**Done:** [ ]

### Task 16: Verify native (Android) parity for the full feature
**What:** Confirms the feature has no native-specific gap beyond what Tasks 5 and 8 already cover: `EntityMentionsSection.tsx`'s navigation code imports nothing platform-specific (grep-verified: no `node:*` import, no direct `fetch` bypassing `lib/api/mentions.ts`/`lib/api/mention-highlight-duration.ts`, no `runtime === "native"` branch), and the resolver/highlight/staleness logic (Tasks 2, 3, 6) is pure client-side code with no transport dependency at all, so it needs no native counterpart of its own.
**Files:** none (build/verification task; no source changes expected)
**Done when:** `pnpm --filter getwrite-frontend build:native` (or the project's documented native build equivalent) completes without error with Tasks 1-15's changes present, and does not newly bundle any `node:*`-only module; a check confirms `EntityMentionsSection.tsx` contains no direct `fetch` call and no native-runtime branch beyond what already exists for `getEntityMentionedIn`.
**Depends on:** 5, 8, 15
**Estimate:** 2
**Notes:** If a gap is found, file it back against Task 5 or 8 rather than patching ad hoc here, matching `specs/features/entity-cooccurrence/tasks.md`'s Task 9 convention.
**Done:** [ ]

### Task 17: Manual verification pass in the running app
**What:** Exercises the complete feature by hand in the running desktop/web app (and, if a device is available, Android) to confirm behavior the automated suite cannot fully assert.
**Files:** none (manual QA task; no source changes expected)
**Done when:** each of the following is confirmed by hand and recorded in the task's completion note, with disk/index ground truth read first and the UI checked against it: (1) clicking a mention snippet in the same resource lands the cursor/selection at the exact sentence the snippet came from, with a visible transient highlight that fades after the configured duration, per FR-4/FR-8; (2) clicking a mention snippet for a different resource switches resources and then lands correctly, per FR-5; (3) a link-only row's resource-name click still only opens the resource, with no highlight or jump, per FR-6; (4) every snippet is reachable and activatable via keyboard alone, per FR-7; (5) editing a resource's text so a previously-indexed offset no longer lands on the entity's name, then clicking that now-stale snippet, produces the no-op-plus-toast behavior with no raw document text in the toast, per FR-9; (6) the Project Settings "Entities" tab's duration field saves, persists across reopening the dialog (noting the same unrefreshed-until-reload caveat other settings fields carry, if applicable), and the configured value actually changes how long the highlight stays visible, per FR-10; (7) a project that has never set the duration shows 2 as the field's prefilled value and the highlight fades at 2 seconds by default; (8) if a device is available, repeat (1)-(4) with the device's network disabled to confirm true offline operation.
**Depends on:** 13, 14, 16
**Estimate:** 2
**Notes:** This is the manual-exercise task the automated suite cannot fully substitute for, mirroring every prior feature's final manual-verification task in this repo.
**Done:** [ ]

## Summary
- Total tasks: 17
- Total estimated effort: 46 points (1: 2, 2: 3, 3: 3, 4: 1, 5: 2, 6: 2, 7: 3, 8: 3, 9: 1, 10: 3, 11: 5, 12: 5, 13: 2, 14: 2, 15: 5, 16: 2, 17: 2)
- Critical path: Tasks 1 → 5 → 11 → 12 → 15 → 16 → 17, with Task 11 additionally gated on Tasks 2 → 6, and Task 12 additionally gated on Task 3 and the settings line (4 → 7 → 8 → 9). The settings line (4, 7, 8, 9, 10, 13) and the resolver/highlight line (2, 6, 3) can both proceed in parallel with the offset-plumbing line (1, 5) until they converge at Task 11 (needs 5, 2, 6) and Task 12 (needs 3, 11, 9).
- Risks: Task 12 is the convergence point for four independent lines of work (offset plumbing, resolver/staleness, the highlight extension, and the settings duration read) and is the highest-risk task for integration surprises — do not start it until Tasks 3, 9, and 11 are all genuinely done, not just believed done. Task 8 carries the same ADR-021 `node:*`-leak risk prior native-backend tasks in this codebase have hit (entity-cooccurrence Task 4, word-count-goals Task 3) if the `turbopack.resolveAlias` entry or web-stub is misconfigured. FR-10's settings line (Tasks 4, 7, 8, 9, 10, 13) is a large, mostly self-contained sub-feature that could in principle ship on its own schedule relative to the navigation line (1, 2, 5, 6, 11, 14, 15) — if scheduling pressure requires splitting the work, this is the natural seam, with Task 12 as the only hard join point.

## Parallelism
- Tasks 1, 2, 3, and 4 have no dependencies and can all start immediately in parallel (disjoint files: `mentions-core.ts`; `TipTapEditor.tsx`/resolver module; a new highlight-extension module; `schemas.ts`).
- Task 5 needs 1. Task 6 needs 2. Task 7 needs 4.
- Task 8 needs 7. Task 9 needs 8. Task 10 needs 8.
- Task 11 needs 5, 2, and 6 — the first convergence point for the offset-plumbing and resolver/staleness lines.
- Task 12 needs 3, 11, and 9 — the second and larger convergence point, joining all four lines.
- Task 13 needs 10 and can run alongside Task 12/14/15.
- Task 14 needs 3, 11, and 12. Task 15 needs 11 and 12.
- Task 16 needs 5, 8, and 15. Task 17 needs 13, 14, and 16.

## FR coverage
- FR-1: 1
- FR-2: 5
- FR-3: 2
- FR-4: 11, 15
- FR-5: 12, 15
- FR-6: 11
- FR-7: 11, 14
- FR-8: 3, 12
- FR-9: 6, 12, 15
- FR-10: 4, 7, 8, 9, 10, 13

## Open Questions

None. The source spec's "Open questions" section states "None identified," and this task list introduces no new ones — every functional requirement (FR-1 through FR-10) maps to at least one task above, and no task here depends on an unresolved product decision. Two scope notes worth the lead's attention, not blocking: (1) Task 9 may collapse entirely into "already covered by Task 8" once Task 8's actual shipped interface is seen — this is deliberately left as a confirm-or-extend task rather than assumed either way; (2) Task 10's field label/helper-text copy is this task's own working-copy choice, since the spec does not dictate exact UI strings for the new field the way some other features' specs have.
