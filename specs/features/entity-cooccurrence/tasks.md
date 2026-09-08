# Tasks: Derived co-occurrence relationship data

Source spec: `specs/features/entity-cooccurrence.md`. Granularity: story points (1/2/3/5/8).

### Task 1: Add `getEntityCooccurrence` to `mentions-core.ts`
**What:** Adds a new exported function `getEntityCooccurrence(projectRoot: string): Promise<Record<string, EntityCooccurrenceEntry[]>>` (name and return shape are this task's own design choice, not dictated by the spec) to `frontend/src/lib/models/mentions-core.ts`, as a sibling of `getProjectMentionCounts` — not an extension of it or of `getEntityMentionedIn` (FR-1). It loads the mention index once via the existing `loadMentionIndex`, and derives co-occurring pairs by grouping `MentionRecord`s by `resourceId` (the raw index's own key) and, within each resource, pairing every two distinct entities mentioned there — with no second call to `loadMentionIndex` and no second index-reading code path. For each ordered result, an entity id maps to an array of `{ entityId, count, resourceIds }` entries: `count` is the number of resources the pair shares, and `resourceIds` lists them. Pairs are unordered and non-reflexive (FR-3): an entity is never paired with itself, and if A co-occurs with B, B's entry array includes A with the identical count and resource set. An entity absent from every pair is absent from the returned map entirely — no zero-entry key (FR-4). Only `MentionRecord`s (detected mentions) are read; `backlinks.json` is never loaded or merged (FR-2) — this is narrower than the merged Mention+Backlink set `getEntityMentionedIn` builds for display, and this function must not reuse or call that merge.
**Files:** frontend/src/lib/models/mentions-core.ts, frontend/tests/unit/mentionsCore.test.ts (or existing mentions-core test file)
**Done when:** a unit test against a fixture mention index confirms: (a) two entities mentioned in the same resource produce a symmetric pair (A's entry lists B with count 1 and that resource id, and vice versa); (b) two entities mentioned in two shared resources produce count 2 with both resource ids; (c) an entity mentioned only in resources no other declared entity is mentioned in is entirely absent from the returned map (FR-4); (d) an entity is never listed against itself (FR-3); (e) a resource with only one mentioned entity contributes no pair; (f) an empty/missing mention index returns `{}` rather than throwing. A separate test/comment confirms the function never imports or calls anything from `backlinks.ts` or `getEntityMentionedIn`.
**Depends on:** none
**Estimate:** 3
**Notes:** This is FR-1/FR-2/FR-3/FR-4's entire model-layer scope. Do not weight or filter by `MentionRecord.offsets` — OQ-1 (resolved) rules that out; co-occurrence is same-resource only.
**Done:** [x]

### Task 2: Add a project-scoped HTTP route exposing entity co-occurrence
**What:** Adds `GET /api/project/[project-id]/entity-cooccurrence`, modelled directly on `frontend/app/api/project/[project-id]/entity-mention-counts/route.ts`'s structure (resolve/validate `project-id` via `resolveProjectPath`, wrap in `withStorageContext`, delegate entirely to Task 1's `getEntityCooccurrence`, no business logic in the route itself).
**Files:** frontend/app/api/project/[project-id]/entity-cooccurrence/route.ts, frontend/tests/unit/entity-cooccurrence-route.test.ts
**Done when:** a GET request against a project with a built mention index returns a JSON object matching `getEntityCooccurrence`'s output shape; a request against an invalid/missing `project-id` returns the same fail-closed 4xx response `resolveProjectPath`/`validateProjectId` already produce for the entity-mention-counts route; a route test covers both cases, mirroring `entity-mention-counts-route.test.ts`'s structure.
**Depends on:** 1
**Estimate:** 2
**Notes:** This route exists only for the web/desktop transport (Task 3); the native transport (Task 4) calls `getEntityCooccurrence` in-process and never hits this route — same split as the entity-mention-counts route/native-backend pair.
**Done:** [x]

### Task 3: Add the client transport module for entity co-occurrence
**What:** Adds `frontend/src/lib/api/entity-cooccurrence.ts`, modelled directly on `frontend/src/lib/api/entity-mention-counts.ts`: an `EntityCooccurrenceTransport` interface with a single `getEntityCooccurrence(projectId): Promise<Record<string, EntityCooccurrenceEntry[]>>` method, an `httpEntityCooccurrenceTransport` implementation that fetches the Task 2 route and degrades to `{}` on any failure (network error, non-2xx, malformed body), and `resolveEntityCooccurrenceTransport` built on `createTransport`, with the native branch's dynamic-import specifier reserved as a literal string (`../../store/transport/native-entity-cooccurrence-backend`) for Task 4's `next.config.mjs` substitution.
**Files:** frontend/src/lib/api/entity-cooccurrence.ts, frontend/tests/unit/entity-cooccurrence-transport.test.ts
**Done when:** `getEntityCooccurrence` returns the parsed co-occurrence map on a 200 response and `{}` on a network error or non-2xx response, verified by a unit test mirroring `entity-mention-counts-transport.test.ts`; the module compiles with the native backend module not yet existing (dynamic import only, never statically resolved at this point).
**Depends on:** 2
**Estimate:** 2
**Notes:** none
**Done:** [x]

### Task 4: Add native transport parity for entity co-occurrence
**What:** Adds `frontend/src/store/transport/native-entity-cooccurrence-backend.ts` (in-process, calling Task 1's `getEntityCooccurrence` via `resolveProjectRoot`, mirroring `native-entity-mention-counts-backend.ts`'s structure — storage-context binding via `createNativeRunner`, and degrade-to-`{}` parity with the HTTP transport) and its `.web-stub.ts` counterpart (mirroring `native-entity-mention-counts-backend.web-stub.ts`'s throw-if-reached contract), and registers the substitution in `frontend/next.config.mjs`'s `turbopack.resolveAlias` for the exact literal specifier Task 3 reserved, following the existing block's own comment convention (see the entity-mention-counts and entity-alias-table entries immediately above where the new entry belongs). **This is the exact failure mode this codebase has hit before — a missing web-stub or missing `resolveAlias` entry ships `node:*` code into the web bundle — so this task's "Done when" explicitly checks for it.**
**Files:** frontend/src/store/transport/native-entity-cooccurrence-backend.ts, frontend/src/store/transport/native-entity-cooccurrence-backend.web-stub.ts, frontend/next.config.mjs, frontend/tests/unit/native-entity-cooccurrence-backend.test.ts, frontend/tests/unit/native-entity-cooccurrence-backend-web-exclusion.test.ts, frontend/tests/unit/entity-cooccurrence-native-web-parity.test.ts
**Done when:** `createNativeEntityCooccurrenceTransport` resolves the same shape as the HTTP transport for a fixture project's mention index, tested via `createNativeRunner`'s injectable `deps.fs` (mirroring `native-entity-mention-counts-backend.test.ts`'s pattern); the web-exclusion test mirrors `native-entity-mention-counts-backend-web-exclusion.test.ts`, confirming the web-stub throws if reached; the native/web parity test mirrors `entity-mention-counts-native-web-parity.test.ts`, confirming both transports return identical shapes for the same fixture; `next.config.mjs`'s `turbopack.resolveAlias` substitutes the web-stub for the exact import specifier used in Task 3; `pnpm --filter getwrite-frontend build` (web target) completes and its output/chunk manifest is inspected (grep, or the existing spot-check approach used for other ADR-021 native backends) for the absence of any `node:*`-only module reachable from `entity-cooccurrence.ts`.
**Depends on:** 3
**Estimate:** 3
**Notes:** This is FR-5 and half of FR-10. A web-only co-occurrence endpoint, or one that silently fails to degrade on native, would be a regression per the spec.
**Done:** [x]

### Task 5: Confirm alias-table name resolution is available to `EntityMentionsSection.tsx`
**What:** A short verification/wiring task, not a new data path: confirms `entityAliasTableSlice`'s cached `EntityAliasTable` (already populated project-wide per its own doc comment — refetched on project load, resource load, and a resolved sidecar save) is reachable from `EntityMentionsSection.tsx` via `useAppSelector(selectEntityAliasTable)` with no new fetch introduced, and that a lookup by `entityId` against `EntityAliasTable.entities` resolves the display name Task 6 needs. If the selector import or a minimal typed accessor does not already exist in a form `EntityMentionsSection.tsx` can use directly, this task adds only that minimal wiring (no new fetch, no new slice).
**Files:** frontend/components/Sidebar/EntityMentionsSection.tsx (import/selector wiring only), frontend/tests/component/EntityMentionsSection.test.tsx
**Done when:** a test confirms `EntityMentionsSection.tsx` resolves a co-occurring entity's display name from the Redux-cached alias table without triggering a new network call or dispatch beyond the existing `fetchEntityAliasTable` lifecycle; a test confirms an entity id absent from the alias table (e.g. a stale reference) falls back to the raw id rather than throwing or rendering blank.
**Depends on:** none
**Estimate:** 1
**Notes:** Safe to build in parallel with Tasks 1-4 (no file overlap with the model/transport layers) and before Task 6, which consumes this wiring.
**Done:** [x]

### Task 6: Render the "Also appears with" list in `EntityMentionsSection.tsx`
**What:** Adds a project-scoped fetch of Task 3's `getEntityCooccurrence` (on mount/project change, alongside the existing `getEntityMentionedIn` fetch, following that effect's cancellation-guard pattern) and renders an "Also appears with" text list for the selected entity — restricted to the selected entity's own id from the co-occurrence map returned by FR-1, never from `rows`' merged `isLinked`/`isMentioned` resource set (FR-2/FR-6). Each entry names the other entity (resolved via `entityAliasTableSlice`'s cached `EntityAliasTable.entities[entityId].name`, per Task 5's wiring) and its shared-resource count, rendered as a single line (e.g. "Also appears with: Priya (3), Marcus (1)"), ordered by count descending with ties broken alphabetically case-insensitively by name (FR-6, matching the roster's tie-break convention in `EntityRosterView.tsx`). When the selected entity has no co-occurrence entry, the list renders nothing at all — no heading, line, or empty-state text (FR-4, FR-7). The list is a `<ul>` with an `aria-label` distinct from the existing `entity-mentions-list` (e.g. `"entity-cooccurrence-list"`, following that attribute's naming convention) so it is reachable by screen reader and keyboard navigation (FR-9); as non-interactive plain text with no navigation, no button, link, or focus-management behavior is added. The list's styling MUST NOT reuse the "Linked"/"Mentioned" badge markup or classes (FR-8) — it renders as plain text, not a badge — so a reader cannot mistake an entry for an authored relationship.
**Files:** frontend/components/Sidebar/EntityMentionsSection.tsx, frontend/tests/component/EntityMentionsSection.test.tsx
**Done when:** a test with a fixture co-occurrence map confirms the list renders entries ordered by count descending with alphabetical tie-break (FR-6); a test confirms an entity with no co-occurrence entry renders no list, heading, or empty-state text at all (FR-7); a test confirms the list's `aria-label` differs from `"entity-mentions-list"` and is queryable independently of the existing mentions list (FR-9); a test confirms no rendered co-occurrence entry carries the "Linked" or "Mentioned" badge class/markup (FR-8); `pnpm --filter getwrite-frontend exec vitest run EntityMentionsSection` is green.
**Depends on:** 3, 5
**Estimate:** 3
**Notes:** This is FR-6/FR-7/FR-8/FR-9's entire scope.
**Done:** [x]

### Task 7: Storybook story and accessibility pass for the "Also appears with" list
**What:** Adds `EntityMentionsSection.stories.tsx` (this component has no existing stories file — this task creates the first one) covering: a selected entity with multiple co-occurring entities (exercising count-descending, alphabetical-tie-break ordering), a selected entity with exactly one co-occurring entity, and a selected entity with none (confirming no list/heading renders, per FR-7). Matches the Storybook conventions `docs/standards/storybook-implementation.md` and this codebase's sibling stories (e.g. `EntityCompileResourceList.stories.tsx`) establish, including mocking the component's data fetches (`getEntityMentionedIn`, Task 3's `getEntityCooccurrence`) and Redux-provided alias table rather than hitting real transports.
**Files:** frontend/components/Sidebar/EntityMentionsSection.stories.tsx
**Done when:** all three stories render without error in Storybook and pass the `@storybook/addon-a11y` check with no new violations, including the populated "Also appears with" list's list semantics and the no-entry case rendering nothing extraneous; the ordering story visibly demonstrates the count-descending/alphabetical-tie-break rule from its fixture data.
**Depends on:** 6
**Estimate:** 2
**Notes:** none
**Done:** [x]

### Task 8: Integration test — co-occurrence fidelity against a real fixture project
**What:** Adds an integration test against a fixture project with: two entities each mentioned in the same two resources (expected count 2), two entities each mentioned in only one shared resource (expected count 1), one entity mentioned only in resources no other declared entity appears in (expected: absent from any co-occurrence list, per FR-4), and one resource where one entity is only explicitly linked (`linkedFrom`, no detected mention) alongside another entity's detected mention (expected: this resource contributes no co-occurrence pair, per FR-2). Confirms `getEntityCooccurrence`'s output for this fixture matches by hand-computed expectation, and that `EntityMentionsSection.tsx`'s rendered "Also appears with" list for each entity matches that same computed output end to end.
**Files:** frontend/tests/integration/entity-cooccurrence.test.ts
**Done when:** the test asserts all properties above against the same fixture in one run and passes, including the link-only-resource exclusion case (FR-2) and the zero-co-occurrence omission case (FR-4).
**Depends on:** 1, 6
**Estimate:** 3
**Notes:** This is the one test in the suite that specifically exercises FR-2's Mention/Backlink non-conflation end to end, not just at the `mentions-core.ts` unit level.
**Done:** [x]

### Task 9: Verify native (Android) parity for entity co-occurrence
**What:** Confirms the co-occurrence feature has no native-specific gap beyond what Task 4 already covers: `EntityMentionsSection.tsx`'s co-occurrence rendering imports nothing platform-specific (grep-verified: no `node:*` import, no direct `fetch`/HTTP call bypassing `lib/api/entity-cooccurrence.ts`, no `runtime === "native"` branch), and the feature relies exclusively on Task 4's native co-occurrence backend and the already-native-parity alias-table transport.
**Files:** none (build/verification task; no source changes expected)
**Done when:** `pnpm --filter getwrite-frontend build:native` (or the project's documented native build equivalent) completes without error with Tasks 1-6's changes present, and does not newly bundle any `node:*`-only module; a check confirms `EntityMentionsSection.tsx` contains no direct `fetch` call and no native-runtime branch beyond what already exists for `getEntityMentionedIn`.
**Depends on:** 4, 6
**Estimate:** 2
**Notes:** This is FR-10's coverage. If a gap is found, file it back against Task 4 or 6 rather than patching ad hoc here, matching `specs/features/entity-roster/tasks.md`'s Task 11 convention.
**Done:** [x]

### Task 10: Manual verification pass in the running app
**What:** Exercises the complete feature by hand in the running desktop/web app (and, if a device is available, Android) to confirm behavior the automated suite cannot fully assert: visual appearance and wording of the "Also appears with" list, its absence when there is nothing to show, and true offline operation.
**Files:** none (manual QA task; no source changes expected)
**Done when:** each of the following is confirmed by hand and recorded in the task's completion note, with disk/index ground truth read first and the UI checked against it (not the reverse): (1) selecting a declared entity that shares a resource with at least one other declared entity shows an "Also appears with" line naming the other entit(ies) and correct counts, matching the mention index on disk, per FR-1/FR-6; (2) the ordering is count-descending with alphabetical tie-break, verified against at least one fixture with a genuine count tie, per FR-6; (3) selecting a declared entity that shares no resource with any other declared entity — reachable **even when this is the very first entity selected, with no other resource selected beforehand**, to specifically catch the reachability-without-prior-selection defect class the roster's own manual pass found — shows no "Also appears with" list, heading, or empty-state text at all, per FR-7; (4) the co-occurrence entries are visually plain text, never styled or labeled as the existing "Linked"/"Mentioned" badges, per FR-8; (5) the list is reachable via keyboard/screen-reader navigation as an accessible list distinct from the existing mentions list, checked with the browser's accessibility inspector or a screen reader, per FR-9; (6) an entity that is only explicitly linked (not mentioned) to a resource where another entity is mentioned does NOT appear in that other entity's "Also appears with" list, per FR-2 — this needs a fixture project built specifically for this case, since it is a negative assertion an incidental project is unlikely to exercise; (7) if a device is available, the "Also appears with" list loads correctly, with counts matching disk ground truth, with the device's network disabled, per FR-10.
**Depends on:** 7, 8, 9
**Estimate:** 1
**Verification record (2026-09-08):** Performed against a disposable QA
workspace (`getwrite-cli qa start`) holding one fixture project of 76
resources with 6 declared entities and 93 indexed mentions, copied from a real
project. Ground truth was computed from `meta/index/mentions.json` on disk
before the UI was opened, yielding 9 co-occurrence pairs.

Six of the seven criteria are confirmed; criterion (7) was not performed.

- (1) Confirmed. Devin Striker showed "Casey Thorne (25), Keller (16), Cecilia
  Gonzalez (12), Sheryl Bowers (3)", matching the on-disk pairs exactly.
- (2) Confirmed against a genuine tie. Cecilia Gonzalez showed "Devin Striker
  (12), Casey Thorne (8), Keller (8)" — the two entries tied at 8 ordered
  alphabetically.
- (3) Confirmed. "Episode 8 - Scene 3", a declared entity appearing in no
  co-occurrence pair, rendered no list, heading, or empty-state text. The
  reachability half was also satisfied: the first criterion was observed on
  the very first resource selected after opening the project, with no prior
  selection.
- (4) Confirmed visually. The co-occurrence line renders as plain dimmed text
  directly below the bordered "LINKED"/"MENTIONED" badge pills, not as a badge.
- (5) Confirmed via the accessibility tree: `list "entity-cooccurrence-list"`
  is present and distinct from both `entity-mentions-list` and
  `entities-mentioned-list`, and its entries are non-interactive `listitem`s.
- (6) Confirmed, and the fixture discriminated the two answers numerically.
  Cecilia Gonzalez is link-only (an authored backlink, no detected mention) in
  three resources that do mention Casey Thorne, Devin Striker and Keller. Had
  the co-occurrence been computed over the merged mentions-plus-backlinks set,
  her counts would have read Devin 15, Keller 11, Casey 10. The UI showed
  12/8/8 — the mentions-only numbers — so the link-only resources contributed
  nothing, per FR-2.
- (7) NOT performed. No Android device was connected during this session.
  Filed as POS `task_c43899d2`.

**Notes:** This is the manual-exercise task the automated suite cannot fully substitute for. Criterion (3)'s explicit "no resource selected first" phrasing exists because the entity roster's own manual pass found a reachability defect (the roster was unreachable with no resource selected) that no automated test caught, precisely because every automated test selected a resource before asserting anything — this criterion is written to actively hunt for that same class of defect here, not to assume it is absent.
**Done:** [ ]

## Summary
- Total tasks: 10
- Total estimated effort: 22 points
- Critical path: Tasks 1 → 2 → 3 → 4 → 6 → 8 → 10 (Task 5 runs in parallel with Tasks 1-4 and joins at Task 6; Task 7 and Task 9 join at Task 10)
- Risks: Task 4 (native co-occurrence transport) carries the same ADR-021 risk of a `node:*` import leaking into the web bundle if the `turbopack.resolveAlias` entry is misconfigured or the web-stub is omitted, as previously hit and documented for the entity-mention-counts and entity-alias-table backends — Task 4's done-when explicitly checks the build output rather than only unit-testing the transport function. Task 6 is the point where the FR-2 non-conflation rule (mentions only, no backlinks merge) is easiest to violate by accident, since the component already holds a merged `rows` set from `getEntityMentionedIn` sitting right next to the new co-occurrence data — Task 6 and Task 8 both explicitly assert the co-occurrence list is never derived from `rows`. Tasks 1-4 (co-occurrence plumbing) and Task 5 (alias-table wiring confirmation) touch disjoint files and can proceed concurrently; Task 6 is the first point they converge.

## Open Questions

None. The source feature spec's four open questions are all resolved, and this task list introduces no new ones: OQ-3's performance measurement is deferred to POS `task_f6153d5a` and is not repeated or smuggled into any task's "Done when" above as a performance assertion — no task in this list measures or claims a performance characteristic of the FR-1 derivation.
