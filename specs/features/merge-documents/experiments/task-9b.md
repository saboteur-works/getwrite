# Task 9b: sample project generator, same-seed run differed once

Test tooling only (POS `task_23e9c7df`). All generated projects were written under the OS temp directory; no real project was used; `package.json` and the lockfiles are untouched.

## Measurement that started it

In one full `pnpm test:ci` run, `sample-project-generator.test.ts` > "gives the same ids and text for the same seed" failed once: `meta/index/diagnostics.json` of one run lacked entries (about 245 lines for a document id) that the other had. Run alone, the file passed 3 of 3 times.

## Experiments

Probe: a temporary stderr line timing `await shutdownIndexer()` in `scripts/sample-project/driver.ts` (removed afterwards), and a count of keys in each run's `meta/index/diagnostics.json`. Seed 7. Load: 24 busy-loop `node` processes on a machine where `os.cpus().length` is 12.

| Condition | `shutdownIndexer()` wall time | diagnostics.json entries |
|---|---|---|
| No load, 2 runs | 3125 ms, 2801 ms | 72, 72 (one file read per run) |
| No extra load effective (first load attempt did not start; `sysctl` was refused), 3 runs | 2976, 2801, 2600 ms | 72, 72, 72 |
| 24 busy loops, 3 runs | 5020, 5005, 5022 ms | 42, 41, 44 |

So with the unmodified driver, three of three loaded runs ended with 41 to 44 of 72 diagnostics entries, and the drain time sat at 5000 ms plus polling slack. Unloaded, the drain takes about 2.6 to 3.1 s.

## Cause

Established by the experiment above plus the code in `frontend/src/lib/models/indexer-queue.ts`: `shutdownIndexer(timeoutMs = 5000)` calls `flushIndexer(timeoutMs)`, which resolves without error when the timeout expires even though the queue is not empty. The driver then ran `rebuildDerivedIndexes`, wrote its output and called `process.exit(0)`, so the queued per-document tasks still waiting (each one loads and rewrites the whole diagnostics index, in sequence) never ran. `rebuildDerivedIndexes` does not rebuild diagnostics (its module header says so), so nothing refilled the entries. The 50-document timing folder of Task 10 (50 documents of about 5000 words) lengthened the queue from a few seconds' drain to about 3 s unloaded, close enough to the 5 s default that load pushes it over. The original hypothesis (queued writes in flight under load) was right in kind; the specific mechanism is the silent timeout, not a race.

Which run in the failing `test:ci` lost entries, and what the load was at that moment, were not observed; the loaded runs above reproduce the same symptom (fewer entries, drain time at the timeout).

## Fix

`scripts/sample-project/driver.ts`: `shutdownIndexer(INDEXER_DRAIN_TIMEOUT_MS)` with a 10 minute bound, far above any real drain, with a comment naming the reason. The comparison in the test is unchanged: `diagnostics.json` stays in it, because its content is a function of the document text only (`dialogueRatio`, `averageSentenceLength`, `topRepeatedWords`, `heuristicVersion`) and is deterministic.

Regression check added to `frontend/tests/unit/sample-project-generator.test.ts`: "has a diagnostics entry for every document the saves queued for indexing" requires an entry for each of the 50 timing documents, so a truncated drain fails on its own without needing two runs to disagree.

## After the fix

| Condition | generator wall time | diagnostics.json entries |
|---|---|---|
| 24 busy loops, 3 runs | 8.64 s, 8.67 s, 9.13 s | 72, 72, 72 |

Under the same load the old driver stopped the drain at 5 s; the fixed driver ran about 8 s and kept all 72 entries. The new regression test was not run against the old driver; that the new test fails without the fix is not demonstrated.

## Checks

- `pnpm typecheck` (frontend): no error.
- `pnpm lint` (frontend): 0 errors, 459 warnings (same count as before).
- Both sample-project test files together (46 tests, including the new one), 5 runs with 24 busy-loop processes running: 5 of 5 passed (46 of 46 each).
