import { afterEach, describe, expect, it } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import {
  runRepetition,
  type Mode,
  type PairId,
} from "../helpers/backlinksRaceConstructions";
import {
  collectRaceFailures,
  RACE_REPETITIONS,
  RACE_TEST_TIMEOUT_MS,
} from "../helpers/raceRepetitions";

/**
 * Feature 93, Task 18 (FR-18, AC-9): two overlapping backlinks writers on one
 * temp project must keep both changes, with the file parseable, in every one
 * of 20 repetitions. Each repetition is raced against a 5 s timer, so a hang
 * fails the test, not the suite.
 *
 * Gated mode forces "one writer holds a copy older than the other's save,
 * then saves last" (E-9). The gated tests are the primary assertions. b1 and b4 FAIL on the tree before Task 21 (E-9: 20 of 20 lost a change) and
 * pass once removeResourceFromBacklinks loads, changes and saves under one
 * withMetaLock. b4 forces the overlap at the backlinks.json LOAD only; the scan
 * (computeBacklinks) has already finished when it is forced. Gate 6 b6 forces
 * it at the scan. Natural variants (same-tick start) are
 * regression guards only (E-9 natural 0 of 20 for b3 and b4) and say nothing
 * about other timing.
 */
async function expectBothChangesKept(pair: PairId, mode: Mode): Promise<void> {
  const failures = await collectRaceFailures(
    `gw-backlinks-race-${pair}-${mode}-`,
    RACE_REPETITIONS,
    (root) => runRepetition(pair, mode, root),
  );
  expect(failures).toEqual([]);
}

describe("backlinks concurrent writers (F93 FR-18)", () => {
  afterEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  describe("gated: older copy saved last", () => {
    it(
      "b1: removeResourceFromBacklinks vs persistBacklinks keeps both changes",
      () => expectBothChangesKept("removeVsPersist", "gated"),
      RACE_TEST_TIMEOUT_MS,
    );
    it(
      "b4: removeResourceFromBacklinks held at its backlinks.json load vs runTask (scan already done) keeps both changes",
      () => expectBothChangesKept("removeVsRunTask", "gated"),
      RACE_TEST_TIMEOUT_MS,
    );
  });

  // KNOWN GAP (F93-4, E-9). A computeBacklinks result computed before another
  // writer and saved after it overwrites that writer's change. One locked
  // load/change/save inside removeResourceFromBacklinks (Task 21) does not
  // change which copy the recompute saves, and computeBacklinks followed by
  // persistBacklinks is not made atomic in this feature. E-9 measured 20 of 20
  // lost in gated mode for both. it.fails keeps the suite green while the test
  // documents the loss; when an atomic recompute exists, it.fails starts
  // failing and must become a plain it.
  describe("KNOWN GAP (F93-4, E-9): recompute computed before, saved after", () => {
    // b2: persistBacklinks locks the write only, so two load/change/persist
    // callers lose a key (E-9, 20 of 20 gated). Follow-up: move the importers
    // (scrivener, docx, plaintext), `reindex` and the persist callers onto
    // updateBacklinks, and make computeBacklinks atomic (F93-4). b3 and b5 are
    // the same follow-up (a recompute scanned before, saved after).
    it.fails(
      "b2: two persistBacklinks load/change/persist callers keep both keys",
      () => expectBothChangesKept("persistVsPersist", "gated"),
      RACE_TEST_TIMEOUT_MS,
    );
    it.fails(
      "b3: watcher body (computeBacklinks + persistBacklinks) vs runTask backlinks step keeps the link",
      () => expectBothChangesKept("watcherVsRunTask", "gated"),
      RACE_TEST_TIMEOUT_MS,
    );
    it.fails(
      "b5: removeResourceFromBacklinks vs computeBacklinks recompute keeps the removal",
      () => expectBothChangesKept("removeVsRecompute", "gated"),
      RACE_TEST_TIMEOUT_MS,
    );
  });

  // Gate 6 (F6). Removal lands while runTask's scan is held, before runTask
  // takes the backlinks lock. The scan listed X, so the index runTask stores
  // (a replacement of the index with the scan) holds X again.
  describe("KNOWN GAP (F93-4, Gate 6): removal between the scan and the lock", () => {
    it.fails(
      "b6: removeResourceFromBacklinks between runTask's computeBacklinks and its backlinks lock keeps the removal",
      () => expectBothChangesKept("removeDuringScan", "gated"),
      RACE_TEST_TIMEOUT_MS,
    );
  });

  describe("natural, same-tick start (regression guard, E-9 natural 0 of 20)", () => {
    it(
      "b3 guard: watcher body vs runTask backlinks step",
      () => expectBothChangesKept("watcherVsRunTask", "natural"),
      RACE_TEST_TIMEOUT_MS,
    );
    it(
      "b4 guard: removeResourceFromBacklinks vs runTask backlinks step",
      () => expectBothChangesKept("removeVsRunTask", "natural"),
      RACE_TEST_TIMEOUT_MS,
    );
  });
});
