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
