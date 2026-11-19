/**
 * Feature 121, Task 16: the merge message constants (drafted wording, owner
 * review in Task 37). Every reason code of the contract has a text, no two
 * texts are equal, and no text echoes client input.
 */
import { describe, expect, it } from "vitest";
import {
  MERGE_ANNOTATION_LIMIT_MESSAGE,
  MERGE_DOCUMENT_CAP_MESSAGE,
  MERGE_FAILED_REMAINING_STATE_MESSAGES,
  MERGE_FAILED_STEP_LABELS,
  MERGE_INDEX_FAILURE_MESSAGE,
  MERGE_INDEX_STEP_LABELS,
  MERGE_MARK_STATE_MESSAGES,
  MERGE_REFUSAL_MESSAGES,
  MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
  MERGE_TARGET_IN_INBOX_WARNING,
  MERGED_NOTICE_LINE,
  MERGED_RULE_TEXTS,
  MERGED_TREE_LABEL_RULE,
  UNDO_MERGE_REFUSAL_MESSAGES,
  describeMergeAnnotationLimit,
  describeMergeDocumentCap,
  describeMergeFailure,
  describeMergeIndexFailure,
  describeMergedMarkLabel,
  describeUndoMergeAction,
} from "../../src/lib/models/merge-messages";
import { SPLIT_INDEX_STEPS } from "../../src/lib/models/split-index-update";
import {
  MERGE_MARK_STATES,
  MERGE_REFUSAL_REASONS,
  MERGE_STEPS,
  type MergeRemainingState,
} from "../../src/lib/models/merge-types";

const REMAINING: MergeRemainingState[] = [
  "documents-restored",
  "snapshot-revisions-kept",
  "partially-written",
  "state-unknown",
];

describe("merge refusal messages", () => {
  it("has a non-empty text for every reason code of the contract", () => {
    for (const reason of Object.values(MERGE_REFUSAL_REASONS)) {
      expect(MERGE_REFUSAL_MESSAGES[reason].length).toBeGreaterThan(10);
    }
    expect(Object.keys(MERGE_REFUSAL_MESSAGES).sort()).toEqual(
      Object.values(MERGE_REFUSAL_REASONS).sort(),
    );
  });

  it("names the merged-away cause for the target and the absorbed document differently", () => {
    expect(MERGE_REFUSAL_MESSAGES["merged-target"]).not.toBe(
      MERGE_REFUSAL_MESSAGES["merged-absorbed"],
    );
  });

  it("covers stale, locked and failed-step refusals", () => {
    expect(MERGE_REFUSAL_MESSAGES["stale-content"]).toMatch(/changed/i);
    expect(MERGE_REFUSAL_MESSAGES["locked-project"]).toMatch(/locked/i);
    expect(MERGE_REFUSAL_MESSAGES["step-failed"]).toMatch(
      /could not be finished/i,
    );
  });
});

describe("merge counted refusals", () => {
  it("states the annotation counts and changes nothing", () => {
    const text = describeMergeAnnotationLimit({
      existing: 480,
      incoming: 40,
      limit: 500,
    });
    expect(text).toContain("480");
    expect(text).toContain("40");
    expect(text).toContain("500");
    expect(text).toMatch(/nothing was changed/i);
    expect(MERGE_ANNOTATION_LIMIT_MESSAGE).toMatch(/notes/i);
  });

  it("states the document cap", () => {
    expect(describeMergeDocumentCap(50)).toContain("50");
    expect(describeMergeDocumentCap(50)).toMatch(/nothing was changed/i);
    expect(MERGE_DOCUMENT_CAP_MESSAGE).toMatch(/too many/i);
  });
});

describe("merge failure texts", () => {
  it("has a label for every step and a text for every remaining state", () => {
    for (const step of MERGE_STEPS) {
      expect(MERGE_FAILED_STEP_LABELS[step].length).toBeGreaterThan(3);
    }
    for (const state of REMAINING) {
      expect(
        MERGE_FAILED_REMAINING_STATE_MESSAGES[state].length,
      ).toBeGreaterThan(10);
    }
  });

  it("describes a failure as not finished, naming the step and the state", () => {
    const text = describeMergeFailure("append-to-target", "partially-written");
    expect(text).toMatch(/did not finish/i);
    expect(text).toContain(MERGE_FAILED_STEP_LABELS["append-to-target"]);
    expect(text).toContain(
      MERGE_FAILED_REMAINING_STATE_MESSAGES["partially-written"],
    );
  });

  it("never reads as success", () => {
    for (const step of MERGE_STEPS) {
      for (const state of REMAINING) {
        expect(describeMergeFailure(step, state)).not.toMatch(/was merged/i);
      }
    }
  });
});

describe("merge index failure text", () => {
  it("says the merge was saved and that reindex repairs the four indexes", () => {
    expect(MERGE_INDEX_FAILURE_MESSAGE).toMatch(/merge was saved/i);
    expect(MERGE_INDEX_FAILURE_MESSAGE).toMatch(/reindex/i);
    for (const four of [
      "search index",
      "notes search index",
      "links",
      "mentions",
    ])
      expect(MERGE_INDEX_FAILURE_MESSAGE).toContain(four);
  });

  it("says prose diagnostics refresh on the next save and does not say reindex repairs them", () => {
    expect(MERGE_INDEX_FAILURE_MESSAGE).toMatch(
      /prose diagnostics refresh the next time you save/i,
    );
    const reindexSentence = MERGE_INDEX_FAILURE_MESSAGE.split(".").find((s) =>
      /reindex/i.test(s),
    );
    expect(reindexSentence).toBeDefined();
    expect(reindexSentence).not.toMatch(/diagnostics/i);
  });

  it("has a label for every step of the per-document update", () => {
    for (const step of SPLIT_INDEX_STEPS)
      expect(MERGE_INDEX_STEP_LABELS[step].length).toBeGreaterThan(3);
  });

  it("names what was not brought up to date, once each, and never reads as a failed merge", () => {
    const text = describeMergeIndexFailure([
      "backlinks",
      "backlinks",
      "diagnostics",
    ]);
    expect(text).toContain(MERGE_INDEX_FAILURE_MESSAGE);
    expect(text).toContain(MERGE_INDEX_STEP_LABELS.backlinks);
    expect(text).toContain(MERGE_INDEX_STEP_LABELS.diagnostics);
    expect(text.split(MERGE_INDEX_STEP_LABELS.backlinks)).toHaveLength(2);
    expect(text).not.toMatch(/did not finish/i);
    expect(text).not.toMatch(/nothing was changed/i);
  });
});

describe("merged mark texts", () => {
  it("has a distinct text for each state beyond available", () => {
    const states = MERGE_MARK_STATES.filter((s) => s !== "available");
    expect(Object.keys(MERGE_MARK_STATE_MESSAGES).sort()).toEqual(
      [...states].sort(),
    );
  });

  it("names the target when available and differs from every other state", () => {
    const live = describeMergedMarkLabel({ state: "available" }, "Chapter 1");
    expect(live).toBe("Merged into “Chapter 1”");
    for (const text of Object.values(MERGE_MARK_STATE_MESSAGES)) {
      expect(text).not.toBe(live);
      expect(text).not.toContain("Chapter 1");
    }
    expect(
      describeMergedMarkLabel({ state: "target-in-trash" }, "Chapter 1"),
    ).toBe(MERGE_MARK_STATE_MESSAGES["target-in-trash"]);
    expect(
      describeMergedMarkLabel(
        { state: "could-not-be-checked", cause: "disk error /x/y" },
        null,
      ),
    ).not.toContain("/x/y");
  });

  it("never renders a live label with no name", () => {
    expect(describeMergedMarkLabel({ state: "available" }, null)).toBe(
      MERGE_MARK_STATE_MESSAGES["could-not-be-checked"],
    );
  });
});

describe("merged rule texts", () => {
  it("states one rule per surface of FR-17 to FR-20", () => {
    expect(MERGED_RULE_TEXTS.compile).toMatch(/compile/i);
    expect(MERGED_RULE_TEXTS.exportAndSearch).toMatch(/export/i);
    expect(MERGED_RULE_TEXTS.exportAndSearch).toMatch(/search/i);
    expect(MERGED_RULE_TEXTS.goals).toMatch(/goal/i);
    expect(MERGED_RULE_TEXTS.wordCounts).toMatch(/word/i);
    expect(MERGED_NOTICE_LINE).toMatch(/still edit/i);
    expect(MERGED_TREE_LABEL_RULE.length).toBeGreaterThan(10);
  });
});

describe("compile and Inbox warnings (OQ-12)", () => {
  it("differ and say the merge proceeds", () => {
    expect(MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING).not.toBe(
      MERGE_TARGET_IN_INBOX_WARNING,
    );
    expect(MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING).toMatch(/compile/i);
    expect(MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING).toMatch(/still merge/i);
    expect(MERGE_TARGET_IN_INBOX_WARNING).toMatch(/inbox/i);
    expect(MERGE_TARGET_IN_INBOX_WARNING).toMatch(/still merge/i);
  });
});

describe("Undo merge texts", () => {
  it("has a distinct text for target gone and snapshot gone", () => {
    expect(UNDO_MERGE_REFUSAL_MESSAGES["target-gone"]).not.toBe(
      UNDO_MERGE_REFUSAL_MESSAGES["snapshot-gone"],
    );
  });

  it("names the target and the number of absorbed documents", () => {
    const one = describeUndoMergeAction("Chapter 1", 1);
    const three = describeUndoMergeAction("Chapter 1", 3);
    expect(one).toContain("“Chapter 1”");
    expect(one).toContain("1 absorbed document");
    expect(three).toContain("3 absorbed documents");
    expect(describeUndoMergeAction(null, 2)).toMatch(/could not be found/i);
  });
});

describe("every text is distinct", () => {
  it("has no two equal constant texts", () => {
    const all: string[] = [
      ...Object.values(MERGE_REFUSAL_MESSAGES),
      MERGE_ANNOTATION_LIMIT_MESSAGE,
      MERGE_DOCUMENT_CAP_MESSAGE,
      ...Object.values(MERGE_FAILED_REMAINING_STATE_MESSAGES),
      ...Object.values(MERGE_FAILED_STEP_LABELS),
      MERGE_INDEX_FAILURE_MESSAGE,
      ...Object.values(MERGE_MARK_STATE_MESSAGES),
      ...Object.values(MERGED_RULE_TEXTS),
      MERGED_NOTICE_LINE,
      MERGED_TREE_LABEL_RULE,
      MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
      MERGE_TARGET_IN_INBOX_WARNING,
      ...Object.values(UNDO_MERGE_REFUSAL_MESSAGES),
    ];
    expect(new Set(all).size).toBe(all.length);
  });
});
