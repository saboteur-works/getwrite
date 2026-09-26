# Status Roll-up

The "By status" section of the Data view (Feature 60). User-facing description: [Data View](../user/views/data.md). The `status` field and `config.statuses` are documented in [metadata](data/metadata.md).

## Files

- `frontend/src/lib/status-rollup.ts` - `computeStatusRollup(resources, statuses)` returns rows: configured statuses in order, unknown values in first-seen order (label from `unknownStatusLabel`: "<value> (not in the current list)"), then a final `UNSET_STATUS_LABEL` ("No status") row.
- `frontend/components/WorkArea/StatusRollup.tsx` - renders a table; all user-visible strings live in `STATUS_ROLLUP_COPY`.
- `frontend/components/WorkArea/DataView.tsx` - mounts it in a `CollapsibleSection` titled "By status".

## Decisions

- Only `type === "text"` resources are counted, so the total may differ from Overview.
- Only `userMetadata.status` is read. `resource.statuses` is not counted.
- Word count uses the same source as DataView (`userMetadata.wordCount ?? wordCount ?? 0`), so it can read low for resources with older plain-text revisions. The stale note's wording is working copy pending user confirmation.
- `DataView` takes `statusRollupResources` and falls back to its own flat list if absent. `AppShell` passes `liveResources` (the full project list), deliberately not `queryResources`, so the roll-up does not follow smart-folder selection.
- Client-side only. It derives from data already in the store, so there is no API route, transport, native backend or web-stub, and Feature 48/50/51 response validation (FR-50) is not applicable.
- Out of scope: the query intrinsic `statuses` and the sidebar `status` are disjoint; this feature does not reconcile them.
