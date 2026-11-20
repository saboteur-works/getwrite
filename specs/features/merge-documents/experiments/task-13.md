# Task 13: FR-1 (f), timing of a merge of 2, 10 and 50 documents

Measurement task. No production file, test, `package.json` or lockfile was edited. The probe (one throwaway vitest file and its config) ran from a scratch directory outside the repository and is not part of this change; probes are never committed. Source reading is labelled READ; everything else is an observed value.

## What these figures are

They are figures of composed primitives, not of the merge core, which does not exist yet. The probe calls the existing functions in the order a merge and an Undo would plausibly use them; it does not validate eligibility, move annotations or metadata, write a latest-operation record, or take the locks the real core will take. Task 44 re-measures with the real core on the packaged app. Task 14 should read these as a lower bound of the primitives' own cost, not as the cost of a merge.

## Environment and method

| Item | Command | Observed |
|---|---|---|
| node | `node --version` | v24.15.0 |
| pnpm | `pnpm --version` | 10.28.0 |
| commit | `git rev-parse --short HEAD` | ce509a98 |
| machine | one developer laptop, macOS, run inside the command sandbox | not otherwise characterised |
| harness | `pnpm exec vitest run --root <scratch>/probe --config <scratch>/probe/vitest.config.mjs` from `frontend/`, config `globals: true`, `environment: node`, no `setupFiles` | 1 test passed, 68.8 s wall for 9 runs |
| storage | default Node filesystem adapter; every call made inside `runForTenant(projectRoot, ...)` (`io.ts`) | |
| indexer environment | READ (`indexer-queue.ts`): under vitest `process.env.VITEST` is `true`, so no backlink watcher starts; `tests/setup.ts` (lock-order guard) was not loaded | |

### The project

Generated with the existing generator, unmodified:

```
node scripts/organizer-grid-fixture/generate.mjs --count 500 --out <scratch>/gen --seed 109
```

Seed 109 is the generator's default, passed explicitly. Printed JSON line (the `projectPath` value is a scratch path and is replaced here by `<scratch>/gen/<projectId>`):

```
{"projectPath":"<scratch>/gen/3531ec16-e79f-4803-88ea-43ce3987f8b3","projectId":"3531ec16-e79f-4803-88ea-43ce3987f8b3","count":500,"folders":20,"status":447,"subtype":454,"genre":500,"themes":500}
```

500 text resources, 20 folders. The generator's cards hold 20 to 79 words and it has no word-length option (READ, `generate.mjs`), so the probe rewrote documents itself.

### Per run

The probe ran 3 times for each of 2, 10 and 50 documents (9 runs). Each run:

1. copied the generated project to a fresh scratch directory (not timed);
2. took the first N resource ids in sorted order and rewrote, for each, `content.txt`, `content.tiptap.json` and the canonical `v-1` `content.bin` with a generated TipTap document of 5000 words (50 paragraphs of 100 words, words drawn from the generator's own word list by a fixed linear congruential sequence seeded by the document's position) (not timed). Sidecars were not rewritten for this, so each sidecar `wordCount` still held the generator's 20 to 79 value until the timed merge wrote the target's;
3. timed the four steps below with `process.hrtime.bigint()`.

The first of the N documents is the target; the other N-1 are absorbed. The merged text is the paragraphs of all N documents in id order.

| Step | Calls in the composed primitive |
|---|---|
| Merge | `createRevision` for each of the N documents (non-canonical, `metadata.preserve: true`, content read from disk), then `writeCanonicalContentWithoutLog` on the target's canonical revision with the merged document, then `mutateSidecar` for each of the N documents adding a `mergedMark` key |
| Awaited index update | `updateDocumentIndexes(projectRoot, ids)` (`split-index-update.ts`) over the N ids; every run returned `outcome: "updated"` |
| Undo | `createRevision` of the target's current text (preserved), `readRevision` of the target's snapshot, `writeCanonicalContentWithoutLog` of the snapshot text on the target, then `mutateSidecar` for each of the N documents deleting `mergedMark` |
| Awaited index update after Undo | `updateDocumentIndexes` over the same N ids; every run returned `outcome: "updated"` |

Between the write steps and the awaited index update the probe also timed `flushIndexer(600000)`, the drain of the queue. This is reported as its own column because of the note below.

Not measured: an encrypted project, a hosted tenant, several server instances, annotations or entities in the merged documents, carrying annotations, a latest-operation record write, more than 3 runs per size, a project of more than 500 documents.

## Observed timings

All values in milliseconds, one row per run.

| Documents | Run | Merge | Queue drain after merge | Awaited index update | Undo | Queue drain after Undo | Awaited index update after Undo |
|---|---|---|---|---|---|---|---|
| 2 | 1 | 10.8 | 550.2 | 135.8 | 5.5 | 526.2 | 129.3 |
| 2 | 2 | 5.4 | 525.4 | 128.9 | 4.9 | 524.9 | 134.8 |
| 2 | 3 | 6.0 | 526.4 | 135.5 | 4.5 | 525.4 | 130.6 |
| 10 | 1 | 19.8 | 1650.3 | 161.8 | 9.7 | 1600.6 | 145.0 |
| 10 | 2 | 19.6 | 1602.1 | 158.0 | 9.7 | 1726.2 | 153.9 |
| 10 | 3 | 22.3 | 1704.6 | 163.6 | 12.7 | 1725.9 | 160.3 |
| 50 | 1 | 106.6 | 8145.4 | 328.7 | 37.4 | 8503.7 | 233.9 |
| 50 | 2 | 92.4 | 7998.3 | 264.8 | 31.2 | 7400.3 | 210.8 |
| 50 | 3 | 85.7 | 7983.2 | 271.2 | 30.2 | 7051.3 | 212.9 |

Medians of the 3 runs (the rows above hold the spread; 3 runs is too few for more than a median and a range):

| Documents | Merge | Queue drain after merge | Awaited index update | Undo | Queue drain after Undo | Awaited index update after Undo |
|---|---|---|---|---|---|---|
| 2 | 6.0 (5.4 to 10.8) | 526.4 (525.4 to 550.2) | 135.5 (128.9 to 135.8) | 4.9 (4.5 to 5.5) | 525.4 (524.9 to 526.2) | 130.6 (129.3 to 134.8) |
| 10 | 19.8 (19.6 to 22.3) | 1650.3 (1602.1 to 1704.6) | 161.8 (158.0 to 163.6) | 9.7 (9.7 to 12.7) | 1725.9 (1600.6 to 1726.2) | 153.9 (145.0 to 160.3) |
| 50 | 92.4 (85.7 to 106.6) | 7998.3 (7983.2 to 8145.4) | 271.2 (264.8 to 328.7) | 31.2 (30.2 to 37.4) | 7400.3 (7051.3 to 8503.7) | 212.9 (210.8 to 233.9) |

Headline: for the 50-document set the write steps took about 92 ms (merge) and 31 ms (Undo) and the awaited index update about 271 ms and 213 ms; the queue drain that follows the writes took about 8.0 s and 7.4 s.

## Does time grow linearly with the number of documents

Observed, from the medians: the merge and Undo write steps and the awaited index update each rise with N by roughly constant steps per added document, between the three points measured. Three points cannot establish a shape; they are consistent with a linear rise and do not exclude another.

| Series | Median at 2 | Median at 10 | Median at 50 | Added ms per added document, 2 to 10 | Added ms per added document, 10 to 50 |
|---|---|---|---|---|---|
| Merge | 6.0 | 19.8 | 92.4 | 1.7 | 1.8 |
| Undo | 4.9 | 9.7 | 31.2 | 0.6 | 0.5 |
| Awaited index update | 135.5 | 161.8 | 271.2 | 3.3 | 2.7 |
| Awaited index update after Undo | 130.6 | 153.9 | 212.9 | 2.9 | 1.5 |
| Queue drain after merge | 526.4 | 1650.3 | 7998.3 | 140.5 | 158.7 |
| Queue drain after Undo | 525.4 | 1725.9 | 7400.3 | 150.1 | 141.9 |

The awaited index update has an intercept of about 125 to 130 ms at 2 documents. Task 4 (`specs/features/split-at-cursor/experiments/task-4.md`, time table) measured the whole-project backlinks scan alone at a median of 98.5 ms on a 500-document project, which the step in `updateDocumentIndexes` also performs (READ, `split-index-update.ts` header); that is the same project size as here. This probe did not time the steps of the update separately, so what the intercept consists of was not measured. Which of the writes, if any, is why the drain columns are non-zero was not tested either (see next section).

## An observation the later tasks need

- The queue drain after the writes is large against every other column: about 0.5 s for 2 documents and about 8 s for 50. Task 4 recorded that `persistResourceContent` schedules `enqueueIndex` with `setImmediate` outside the caller's await (its "Notes for later tasks"), and that one `enqueueIndex` took about 150 ms at 500 documents. The drain per document here, from the medians, is about 160 to 260 ms. This probe did not record how many queue tasks were pending, so the number of enqueued tasks and the share of the drain they account for are not established. The experiment that would settle it: record the queue length before the drain (or count `enqueueIndex` calls) for the same sets, and repeat with `writeCanonicalContentWithoutLog` replaced by a write that does not call `persistResourceContent`.
- The awaited index update in the table was timed after the drain, so it does not include any waiting for that background work. A merge that returns to the writer right after its writes would not wait for the drain; whether the real core awaits it is a design question for the real core, not something this probe decided.
- The merged document is N times 5000 words (250 000 words at N = 50). One write of that size is inside the "Merge" column; the probe did not time it alone.

## Figures for Task 14

Task 14 reads the cap from these timings. As observed on this machine, in this sandbox, with composed primitives and 3 runs each:

- merge writes at 50 documents: 86 to 107 ms;
- awaited index update at 50 documents: 265 to 329 ms;
- Undo writes at 50 documents: 30 to 37 ms; the awaited index update after it: 211 to 234 ms;
- the queue drain after the writes at 50 documents: 7.1 to 8.5 s.

No figure here is a limit, and the probe did not go above 50 documents, so nothing is measured about a cap above 50. Task 44 re-measures with the real core.

## Files created

- `specs/features/merge-documents/experiments/task-13.md` (this file)

## Behaviour

No behaviour change has been made. No test, typecheck or lint was run, because the task touches only a specification record.
