import { afterEach, describe, expect, it } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import {
  runRepetition,
  type Mode,
  type PairId,
} from "../helpers/mentionIndexRaceConstructions";
import {
  collectRaceFailures,
  RACE_REPETITIONS,
  RACE_TEST_TIMEOUT_MS,
} from "../helpers/raceRepetitions";

/**
 * Feature 93, Task 18 (FR-18, AC-9): two overlapping mention-index writers on
 * one temp project must keep both changes, with the file parseable, in every
 * one of 20 repetitions. Each repetition is raced against a 5 s timer, so a
 * hang fails the test, not the suite.
 *
 * "gated" mode holds each read of meta/index/mentions.json until both writers
 * have loaded (E-8), so both hold a copy older than the other's save. The
 * gated tests are the primary assertions; on the tree before Task 20 they
 * FAIL (E-8: gated 20 of 20 lost a change for each pair) and are expected to
 * pass once the writers load, change and save under one withMetaLock.
 * "natural" mode starts both writers in the same tick; those variants are
 * regression guards only (E-8: natural 0 of 20 lost a change before Task 20)
 * and say nothing about other timing.
 */
async function expectBothChangesKept(pair: PairId, mode: Mode): Promise<void> {
  const failures = await collectRaceFailures(
    `gw-mention-race-${pair}-${mode}-`,
    RACE_REPETITIONS,
    (root) => runRepetition(pair, mode, root),
  );
  expect(failures).toEqual([]);
}

describe("mention index concurrent writers (F93 FR-18)", () => {
  afterEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  describe("gated: both writers hold a copy loaded before either saved", () => {
    it(
      "m1: removeResourceFromMentionIndex vs runTask mention step keeps both changes",
      () => expectBothChangesKept("removeVsRunTask", "gated"),
      RACE_TEST_TIMEOUT_MS,
    );
    it(
      "m2: removeResourceFromMentionIndex vs rescanEntityAcrossProject keeps both changes",
      () => expectBothChangesKept("removeVsRescan", "gated"),
      RACE_TEST_TIMEOUT_MS,
    );
    it(
      "m3: rescanEntityAcrossProject vs runTask mention step keeps both changes",
      () => expectBothChangesKept("rescanVsRunTask", "gated"),
      RACE_TEST_TIMEOUT_MS,
    );
  });

  // KNOWN GAP (Feature 93, E-8). Two callers that each loadMentionIndex, change
  // the copy and persistMentionIndex still lose one change: persistMentionIndex
  // locks the write only. E-8 measured 20 of 20 lost in gated mode. Follow-up:
  // move the importers (scrivener, docx, plaintext), `reindex` and the persist
  // callers onto updateMentionIndex. it.fails keeps the suite green while the
  // test documents the loss; when the callers are moved it starts failing and
  // must become a plain it.
  describe("KNOWN GAP (E-8): load/change/persistMentionIndex callers", () => {
    it.fails(
      "m4: two persistMentionIndex load/change/persist callers keep both keys",
      () => expectBothChangesKept("persistVsPersist", "gated"),
      RACE_TEST_TIMEOUT_MS,
    );
  });

  describe("natural, same-tick start (regression guards, E-8 natural 0 of 20)", () => {
    it(
      "m1 guard: removeResourceFromMentionIndex vs runTask mention step",
      () => expectBothChangesKept("removeVsRunTask", "natural"),
      RACE_TEST_TIMEOUT_MS,
    );
    it(
      "m3 guard: rescanEntityAcrossProject vs runTask mention step",
      () => expectBothChangesKept("rescanVsRunTask", "natural"),
      RACE_TEST_TIMEOUT_MS,
    );
  });
});
