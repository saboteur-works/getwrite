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
