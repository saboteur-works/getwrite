# Task 14: the document cap of one merge (OQ-5, FR-1 (f))

Document cap: 25, 2026-11-19, the owner (recorded by the lead from the owner's word at Gate 5)

## What it rests on

The Task 13 timings in `experiments/task-13.md`, for 2, 10 and 50 documents of about 5000 words on a generated project of 500 documents:

| Documents | Merge writes | Awaited index update | Queue drain |
|---|---|---|---|
| 2 | 6.0 ms | 135.5 ms | 0.5 s |
| 10 | 19.8 ms | 161.8 ms | 1.7 s |
| 50 | 92.4 ms | 271.2 ms | 8.0 s |

These are figures of composed primitives, not of the merge core (which did not exist when they were taken), so they are a lower bound of the primitives' own cost and not the cost of a merge. Task 44 re-measures with the real core on the packaged app.

## Why 25

The lead recommended 25 and the owner chose it. The queue drain at 50 documents (about 8 s) has no established cause: no experiment has established one. 25 sits between the 10 and 50 documents measured, so it is inside the range for which the writes and the awaited index update were observed to be small, and it is half the size at which the drain was seen to reach 8 s. The value is not a derived limit; it is a choice. If Task 44 shows a drain or a merge time at 25 that the owner finds too long, the constant in `frontend/src/lib/models/merge-limits.ts` is the one place to change.

The spec's own bounds are unaffected: the target's 500-annotation limit (Task 19) and the 5000-id compile-exclusion list (not used by a merge, OQ-11) both sit well above 25 documents.

## Where the constant is used

`frontend/src/lib/models/merge-limits.ts` exports `MERGE_DOCUMENT_CAP` (25) and `isMergeDocumentCountWithinCap(count)`. Tasks 24, 32 and 33 import it. `describeMergeDocumentCap(limit)` in `merge-messages.ts` takes the limit as a parameter, so no placeholder cap exists in an already-landed module to replace.
