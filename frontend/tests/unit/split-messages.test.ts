/**
 * Feature 120, Task 10: the split message constants. Every reason code of the
 * contract has a text, the Undo refusals have their own, and no two texts are
 * equal. The wording was reviewed and kept by the owner (Task 28).
 */
import { describe, expect, it } from "vitest";
import {
  SPLIT_COMPILE_EXCLUSION_NOTICE,
  SPLIT_FAILED_REMAINING_STATE_MESSAGES,
  SPLIT_FAILED_STEP_LABELS,
  SPLIT_INDEX_FAILURE_MESSAGE,
  SPLIT_INDEX_STEP_LABELS,
  SPLIT_REFUSAL_MESSAGES,
  SPLIT_UNDO_REFUSAL_MESSAGES,
  SPLIT_UNDO_REFUSAL_REASONS,
  describeSplitFailure,
  describeSplitIndexFailure,
  SPLIT_SAVE_FAILED_MESSAGE,
  SPLIT_READ_FAILED_MESSAGE,
  SPLIT_UNEXPECTED_FAILURE_MESSAGE,
  SPLIT_RELOAD_FAILED_MESSAGE,
  SPLIT_TREE_REFRESH_FAILED_MESSAGE,
  SPLIT_SUCCESS_TITLE,
  describeSplitSuccess,
  UNDO_SPLIT_STEP_LABELS,
  UNDO_SPLIT_REMAINING_STATE_MESSAGES,
  UNDO_SPLIT_LABEL,
  UNDO_TOAST_DISMISS_LABEL,
  UNDO_SPLIT_UNKNOWN_NAME_PHRASE,
  UNDO_SPLIT_READ_FAILED_MESSAGE,
  UNDO_SPLIT_READ_LOCKED_MESSAGE,
  UNDO_SPLIT_WORKING_MESSAGE,
  UNDO_SPLIT_SAVE_FAILED_MESSAGE,
  UNDO_SPLIT_LOCKED_MESSAGE,
  UNDO_SPLIT_INVALID_REQUEST_MESSAGE,
  UNDO_SPLIT_TRANSPORT_FAILED_MESSAGE,
  UNDO_SPLIT_UNEXPECTED_FAILURE_MESSAGE,
  UNDO_SPLIT_RELOAD_FAILED_MESSAGE,
  UNDO_SPLIT_TREE_REFRESH_FAILED_MESSAGE,
  UNDO_SPLIT_OPEN_DOCUMENT_IN_TRASH_MESSAGE,
  UNDO_SPLIT_EDITOR_HELD_MESSAGE,
  UNDO_SPLIT_NOTHING_TO_UNDO_MESSAGE,
  UNDO_SPLIT_UNSUPPORTED_OPERATION_MESSAGE,
  UNDO_SPLIT_COULD_NOT_BE_CHECKED_MESSAGE,
  describeUndoSplitAction,
  describeUndoSplitFailure,
  describeUndoSplitSuccess,
  describeUndoSplitIndexFailure,
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

describe("split index-failure text (Task 22)", () => {
  it("says the split was saved, that reindex repairs the indexes, and that diagnostics refresh on the next save", () => {
    const text = SPLIT_INDEX_FAILURE_MESSAGE;
    expect(text).toMatch(/was saved/);
    expect(text).toMatch(/reindex/);
    expect(text).toMatch(/next time you save/);
    expect(text).toMatch(/diagnostics/i);
  });

  it("does not say reindex repairs diagnostics: no sentence names both", () => {
    const sentences = SPLIT_INDEX_FAILURE_MESSAGE.split(/(?<=\.)\s+/);
    const withReindex = sentences.filter((s) => /reindex/i.test(s));
    expect(withReindex.length).toBeGreaterThan(0);
    for (const sentence of withReindex)
      expect(sentence).not.toMatch(/diagnostic/i);
  });

  it("has a distinct label for every failing step and names the steps that failed", () => {
    const labels = Object.values(SPLIT_INDEX_STEP_LABELS);
    expect(new Set(labels).size).toBe(labels.length);
    for (const label of labels) expect(label.trim().length).toBeGreaterThan(0);
    const text = describeSplitIndexFailure(["diagnostics", "word-count"]);
    expect(text).toContain(SPLIT_INDEX_FAILURE_MESSAGE);
    expect(text).toContain(SPLIT_INDEX_STEP_LABELS.diagnostics);
    expect(text).toContain(SPLIT_INDEX_STEP_LABELS["word-count"]);
    expect(describeSplitIndexFailure(["diagnostics"])).not.toContain(
      SPLIT_INDEX_STEP_LABELS["word-count"],
    );
  });

  it("differs from every other text and echoes no client input", () => {
    expect(allTexts()).not.toContain(SPLIT_INDEX_FAILURE_MESSAGE);
    expect(SPLIT_INDEX_FAILURE_MESSAGE).not.toMatch(/\$\{|\{\w+\}|%s/);
  });
});

describe("split host and Undo texts moved here (Task 28)", () => {
  const UNDO_STEPS = [
    "save-current-text",
    "restore-original",
    "move-annotations",
    "trash-split-off",
    "remove-exclusion",
    "clear-record",
  ] as const;
  const UNDO_STATES = [
    "split-restored",
    "record-not-restored",
    "exclusion-not-restored",
    "split-off-in-trash",
    "notes-not-restored",
    "original-not-restored",
    "preserved-revisions-kept",
    "state-unknown",
  ] as const;

  it("has the five host texts and the success title and body, all distinct and non-empty", () => {
    const texts = [
      SPLIT_SAVE_FAILED_MESSAGE,
      SPLIT_READ_FAILED_MESSAGE,
      SPLIT_UNEXPECTED_FAILURE_MESSAGE,
      SPLIT_RELOAD_FAILED_MESSAGE,
      SPLIT_TREE_REFRESH_FAILED_MESSAGE,
      SPLIT_SUCCESS_TITLE,
      describeSplitSuccess("X"),
    ];
    for (const text of texts) expect(text.trim().length).toBeGreaterThan(0);
    expect(new Set(texts).size).toBe(texts.length);
    expect(SPLIT_SUCCESS_TITLE).toBe("Document split");
    expect(describeSplitSuccess("Chapter 2")).toBe(
      "The text after the cursor is now the new document “Chapter 2”.",
    );
  });

  it("has a distinct non-empty label for every Undo step and text for every remaining state", () => {
    expect(Object.keys(UNDO_SPLIT_STEP_LABELS).sort()).toEqual(
      [...UNDO_STEPS].sort(),
    );
    expect(Object.keys(UNDO_SPLIT_REMAINING_STATE_MESSAGES).sort()).toEqual(
      [...UNDO_STATES].sort(),
    );
    for (const record of [
      Object.values(UNDO_SPLIT_STEP_LABELS),
      Object.values(UNDO_SPLIT_REMAINING_STATE_MESSAGES),
    ]) {
      for (const text of record) expect(text.trim().length).toBeGreaterThan(0);
      expect(new Set(record).size).toBe(record.length);
    }
  });

  it("has the Undo toast's Dismiss label, which is no other text in the module (Feature 121 Task 41)", () => {
    expect(UNDO_TOAST_DISMISS_LABEL).toBe("Dismiss");
    expect(allTexts()).not.toContain(UNDO_TOAST_DISMISS_LABEL);
  });

  it("has distinct Undo constants, none equal to a text already in the module", () => {
    const undo = [
      UNDO_SPLIT_LABEL,
      UNDO_SPLIT_UNKNOWN_NAME_PHRASE,
      UNDO_SPLIT_READ_FAILED_MESSAGE,
      UNDO_SPLIT_READ_LOCKED_MESSAGE,
      UNDO_SPLIT_WORKING_MESSAGE,
      UNDO_SPLIT_SAVE_FAILED_MESSAGE,
      UNDO_SPLIT_LOCKED_MESSAGE,
      UNDO_SPLIT_INVALID_REQUEST_MESSAGE,
      UNDO_SPLIT_TRANSPORT_FAILED_MESSAGE,
      UNDO_SPLIT_UNEXPECTED_FAILURE_MESSAGE,
      UNDO_SPLIT_RELOAD_FAILED_MESSAGE,
      UNDO_SPLIT_TREE_REFRESH_FAILED_MESSAGE,
      UNDO_SPLIT_OPEN_DOCUMENT_IN_TRASH_MESSAGE,
      UNDO_SPLIT_EDITOR_HELD_MESSAGE,
      UNDO_SPLIT_NOTHING_TO_UNDO_MESSAGE,
      UNDO_SPLIT_UNSUPPORTED_OPERATION_MESSAGE,
      UNDO_SPLIT_COULD_NOT_BE_CHECKED_MESSAGE,
    ];
    expect(new Set(undo).size).toBe(undo.length);
    for (const text of undo) expect(allTexts()).not.toContain(text);
  });

  it("describes a failed Undo by step and state, and never as rolled back when no request ran", () => {
    const seen = new Set<string>();
    for (const step of UNDO_STEPS) {
      for (const state of UNDO_STATES) {
        const text = describeUndoSplitFailure(step, state, "step-failed");
        expect(text).toContain(UNDO_SPLIT_STEP_LABELS[step]);
        expect(text).toContain(UNDO_SPLIT_REMAINING_STATE_MESSAGES[state]);
        seen.add(text);
      }
    }
    expect(seen.size).toBe(UNDO_STEPS.length * UNDO_STATES.length);
    expect(describeUndoSplitFailure(null, "state-unknown", "x")).toContain(
      "Undo split did not finish.",
    );
    expect(
      describeUndoSplitFailure(
        "clear-record",
        "split-restored",
        "transport-failed",
      ),
    ).toBe(UNDO_SPLIT_TRANSPORT_FAILED_MESSAGE);
    expect(
      describeUndoSplitFailure(
        "clear-record",
        "split-restored",
        "invalid-request",
      ),
    ).toBe(UNDO_SPLIT_INVALID_REQUEST_MESSAGE);
  });

  it("describes the Undo action and success with the name, or the unknown-name phrase", () => {
    expect(describeUndoSplitAction("Part 2")).toContain("“Part 2”");
    expect(describeUndoSplitAction(null)).toContain(
      UNDO_SPLIT_UNKNOWN_NAME_PHRASE,
    );
    const states = ["moved-to-trash", "was-in-trash", "was-purged"] as const;
    const texts = states.map((s) => describeUndoSplitSuccess("N", s, 0));
    expect(new Set(texts).size).toBe(3);
    expect(describeUndoSplitSuccess("N", "moved-to-trash", 1)).toContain(
      " 1 note was put back",
    );
    expect(describeUndoSplitSuccess("N", "moved-to-trash", 3)).toContain(
      " 3 notes were put back",
    );
  });

  it("names the steps not brought up to date after an Undo, without repeating one", () => {
    const text = describeUndoSplitIndexFailure(["diagnostics", "diagnostics"]);
    expect(text).toContain(SPLIT_INDEX_STEP_LABELS.diagnostics);
    const listed = text.slice(text.indexOf("Not brought up to date:"));
    expect(listed).toBe(
      `Not brought up to date: ${SPLIT_INDEX_STEP_LABELS.diagnostics}.`,
    );
    expect(text).toMatch(/does not rebuild prose diagnostics/);
  });
});
