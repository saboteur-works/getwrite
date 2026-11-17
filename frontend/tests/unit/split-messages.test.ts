/**
 * Feature 120, Task 10: the split message constants. Every reason code of the
 * contract has a text, the Undo refusals have their own, and no two texts are
 * equal. The wording is a draft for owner review (Task 28).
 */
import { describe, expect, it } from "vitest";
import {
  SPLIT_COMPILE_EXCLUSION_NOTICE,
  SPLIT_FAILED_REMAINING_STATE_MESSAGES,
  SPLIT_FAILED_STEP_LABELS,
  SPLIT_REFUSAL_MESSAGES,
  SPLIT_UNDO_REFUSAL_MESSAGES,
  SPLIT_UNDO_REFUSAL_REASONS,
  describeSplitFailure,
} from "../../src/lib/models/split-messages";
import {
  SPLIT_REFUSAL_REASONS,
  SPLIT_STEPS,
  type SplitRemainingState,
} from "../../src/lib/models/split-types";

const REMAINING_STATES: SplitRemainingState[] = [
  "original-restored",
  "snapshot-revision-kept",
  "new-document-remains",
  "original-truncated",
  "state-unknown",
];

function allTexts(): string[] {
  return [
    ...Object.values(SPLIT_REFUSAL_MESSAGES),
    ...Object.values(SPLIT_UNDO_REFUSAL_MESSAGES),
    SPLIT_COMPILE_EXCLUSION_NOTICE,
    ...Object.values(SPLIT_FAILED_REMAINING_STATE_MESSAGES),
  ];
}

describe("split messages", () => {
  it("has a non-empty text for every refusal reason code", () => {
    for (const reason of Object.values(SPLIT_REFUSAL_REASONS)) {
      expect(SPLIT_REFUSAL_MESSAGES[reason]?.trim().length).toBeGreaterThan(0);
    }
    expect(Object.keys(SPLIT_REFUSAL_MESSAGES).sort()).toEqual(
      Object.values(SPLIT_REFUSAL_REASONS).sort(),
    );
  });

  it("has the five Undo refusals of FR-17, each with a text", () => {
    expect([...SPLIT_UNDO_REFUSAL_REASONS].sort()).toEqual(
      [
        "original-gone",
        "original-in-trash",
        "original-purged",
        "snapshot-gone",
        "split-off-split-since",
      ].sort(),
    );
    for (const reason of SPLIT_UNDO_REFUSAL_REASONS) {
      expect(SPLIT_UNDO_REFUSAL_MESSAGES[reason].trim().length).toBeGreaterThan(
        0,
      );
    }
  });

  it("has a text for the full compile exclusion list notice", () => {
    expect(SPLIT_COMPILE_EXCLUSION_NOTICE.trim().length).toBeGreaterThan(0);
  });

  it("has a text for every remaining state and a label for every step", () => {
    for (const state of REMAINING_STATES) {
      expect(
        SPLIT_FAILED_REMAINING_STATE_MESSAGES[state].trim().length,
      ).toBeGreaterThan(0);
    }
    for (const step of SPLIT_STEPS) {
      expect(SPLIT_FAILED_STEP_LABELS[step].trim().length).toBeGreaterThan(0);
    }
  });

  it("has no two equal texts", () => {
    const texts = allTexts();
    expect(new Set(texts).size).toBe(texts.length);
    const labels = Object.values(SPLIT_FAILED_STEP_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("names the failed step and the state that remains, distinctly per pair", () => {
    const seen = new Set<string>();
    for (const step of SPLIT_STEPS) {
      for (const state of REMAINING_STATES) {
        const text = describeSplitFailure(step, state);
        expect(text).toContain(SPLIT_FAILED_STEP_LABELS[step]);
        expect(text).toContain(SPLIT_FAILED_REMAINING_STATE_MESSAGES[state]);
        seen.add(text);
      }
    }
    expect(seen.size).toBe(SPLIT_STEPS.length * REMAINING_STATES.length);
  });

  it("never reads a failure as success", () => {
    const text = describeSplitFailure(
      "truncate",
      "state-unknown",
    ).toLowerCase();
    expect(text).toContain("did not");
  });

  it("echoes no client input: no text has a placeholder or interpolation marker", () => {
    for (const text of allTexts()) {
      expect(text).not.toMatch(/\$\{|\{\w+\}|%s/);
    }
  });
});
