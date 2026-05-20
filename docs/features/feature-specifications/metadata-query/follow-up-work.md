# Metadata Query — Follow-up Work

## Task 2: Intrinsic field registry (completed 2026-05-19)

### BacklinkIndex direction discrepancy

`09-current-state.md` describes `BacklinkIndex` as `(target id → source ids)`,
but the actual implementation in `backlinks.ts` (confirmed by unit tests) stores
`sourceId → [targetIds]` (forward links, not inverse).

The `query-intrinsics.ts` implementation follows the actual code:
- `linksTo`: direct lookup `index[resource.id]`
- `linkedFrom`: O(n) scan inverting the index at read time

**Why deferred:** The inversion is correct and tests pass. Fixing the doc comment
in `09-current-state.md` is a docs-only change with no urgency.
**Recommended action:** Update `09-current-state.md` § Backlinks to say
`sourceId → [targetIds]` (forward-link index). Consider also adding a persistent
inverted index (targetId → sourceIds) if `linkedFrom` query performance becomes
a concern at large project sizes.

### `folderId` ResourceRef name is always empty

The `folderId` intrinsic returns `{ id: folderId, name: "" }` because the folder
name is not available on the `ResourceBase` record alone. The evaluator only needs
the `id` for predicate comparisons, so this is correct for evaluation. The chip UI
will need to resolve the name separately (e.g., from the Redux resources store)
for display purposes.

---

## Task 23: SchemaManager migration preview — updateFieldOptions (completed 2026-05-20)

### schemaManager.test.tsx needs update for new commitOptions behavior

The existing test "dispatches updateMetadataFieldOptions on textarea blur" (line 584)
uses `"Fantasy\nHorror\n"` as the new option value for a field that previously had
`["Fantasy", "Sci-Fi"]`. This removes "Sci-Fi", which now triggers the
`OptionsRemovalPreview` modal instead of dispatching `updateMetadataFieldOptions` directly.

The test was already failing before Task 23 due to a pre-existing `DialogTitle` context
error (SchemaManager uses `DialogTitle` from Radix which must be wrapped in a `Dialog`).
That wrapping is missing from the test setup.

**Why deferred:** The entire `schemaManager.test.tsx` suite (57 tests) is already failing
for the pre-existing DialogTitle/Dialog context issue. Fixing it requires wrapping
the test render in a Dialog provider.

**Recommended action:** Fix the test setup to wrap renders in a Dialog context, then
update the "dispatches updateMetadataFieldOptions" test to use a scenario where no
options are removed (e.g., `"Fantasy\nSci-Fi\nHorror\n"` — adding Horror without
removing anything), and add a separate test for the options-removal preview path that
verifies `OptionsRemovalPreview` is rendered when options are removed.

---

## Task 24: SchemaManager deprecate-vs-clear on removeField (completed 2026-05-20)

### Affected-resource count not shown in DeprecateOrClearDialog

The spec mockup shows the count of affected sidecars in the Clear option description (e.g., "Remove the field key from all 23 sidecars"). The current implementation omits this count.

**Why deferred:** Showing the count requires an async API call (`fetchFieldValues`) before the dialog opens, which adds complexity. The "Done when" criteria does not require the count. The dialog still conveys the destructive nature of Clear without it.

**Recommended action:** When the trash icon is clicked on a field, call `fetchFieldValues(projectPath, fieldKey)` to count non-null values (i.e., `entry.count` for any key that isn't `MISSING_VALUE_KEY`). Pass this count to `DeprecateOrClearDialog` as an optional `affectedCount?: number` prop and render it in the Clear description.

### schemaManager.test.tsx — deprecate/clear dialog not covered

The existing `schemaManager.test.tsx` suite is blocked by the pre-existing `DialogTitle`/`Dialog` context issue (see Task 23 follow-up). The new `DeprecateOrClearDialog` is not yet covered by component tests.

**Recommended action:** Once the DialogTitle issue is fixed, add tests that:
1. Click the trash icon on an unlocked field and verify `DeprecateOrClearDialog` renders.
2. Select "Deprecate" and confirm — verify `deprecateMetadataField` is dispatched.
3. Select "Clear" and confirm — verify `clearMetadataField` is dispatched.
4. Click Cancel — verify neither thunk is dispatched.
