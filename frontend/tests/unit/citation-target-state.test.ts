// Last Updated: 2026-11-07

/**
 * Feature 103, Task 32 (FR-27, OQ-2, OQ-168): what a citation shows when its
 * Source, attachment or excerpt is missing. One test per FR-27 case. The
 * "Observed" lines record what the derived state was when the test was run,
 * not an intended-cause statement.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  deriveCitationTargetState,
  type CitationTargetState,
} from "../../src/lib/models/citation-target-state";
import type { AnnotationTarget } from "../../src/lib/models/types";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";
const EXCERPT_ID = "33333333-3333-4333-8333-333333333333";

const FULL_TARGET: AnnotationTarget = {
  sourceId: SOURCE_ID,
  attachmentId: ATTACHMENT_ID,
  excerptId: EXCERPT_ID,
  sourceName: "Interview with Ada",
};

const FORBIDDEN: readonly string[] = ["hidden", "nothing", "deleted"];

describe("deriveCitationTargetState (FR-27)", () => {
  it("is present when the Source, attachment and excerpt all exist", () => {
    // Observed: { state: "present", displayName: "Interview with Ada", sourceRemoved: false }
    const r = deriveCitationTargetState(FULL_TARGET, {
      source: "present",
      currentSourceName: "Interview with Ada",
      attachment: "present",
      excerpt: "present",
    });
    expect(r).toEqual({
      state: "present",
      displayName: "Interview with Ada",
      sourceRemoved: false,
    });
  });

  it("Source in Trash: shows the saved name, marked removed, not hidden", () => {
    // Observed: { state: "source-in-trash", displayName: "Interview with Ada", sourceRemoved: true }
    const r = deriveCitationTargetState(FULL_TARGET, { source: "in-trash" });
    expect(r).toEqual({
      state: "source-in-trash",
      displayName: "Interview with Ada",
      sourceRemoved: true,
    });
  });

  it("Source purged: shows the saved name, marked removed, not hidden", () => {
    // Observed: { state: "source-purged", displayName: "Interview with Ada", sourceRemoved: true }
    const r = deriveCitationTargetState(FULL_TARGET, { source: "absent" });
    expect(r).toEqual({
      state: "source-purged",
      displayName: "Interview with Ada",
      sourceRemoved: true,
    });
  });

  it("attachment removed: Source still present, state names the attachment", () => {
    // Observed: { state: "attachment-removed", displayName: "Interview with Ada", sourceRemoved: false }
    const r = deriveCitationTargetState(FULL_TARGET, {
      source: "present",
      currentSourceName: "Interview with Ada",
      attachment: "removed",
      excerpt: "present",
    });
    expect(r).toEqual({
      state: "attachment-removed",
      displayName: "Interview with Ada",
      sourceRemoved: false,
    });
  });

  it("excerpt deleted: Source still present, state names the excerpt", () => {
    // Observed: { state: "excerpt-removed", displayName: "Interview with Ada", sourceRemoved: false }
    const r = deriveCitationTargetState(FULL_TARGET, {
      source: "present",
      currentSourceName: "Interview with Ada",
      attachment: "present",
      excerpt: "removed",
    });
    expect(r).toEqual({
      state: "excerpt-removed",
      displayName: "Interview with Ada",
      sourceRemoved: false,
    });
  });

  it("Source renamed after the citation: keeps the name at citing time", () => {
    // Observed: displayName "Interview with Ada" while the Source is now "Ada, transcript v2"
    const present = deriveCitationTargetState(FULL_TARGET, {
      source: "present",
      currentSourceName: "Ada, transcript v2",
      attachment: "present",
      excerpt: "present",
    });
    expect(present.displayName).toBe("Interview with Ada");
    expect(present.state).toBe("present");
    // Observed: the same name is kept once the renamed Source is purged.
    const purged = deriveCitationTargetState(FULL_TARGET, { source: "absent" });
    expect(purged.displayName).toBe("Interview with Ada");
  });

  it("a target saved without a name falls back to the current name, and to undefined when the Source is gone", () => {
    // Observed: undefined name for a purged Source with no saved name; the
    // caller must show "removed" from sourceRemoved, never an empty row.
    const bare: AnnotationTarget = { sourceId: SOURCE_ID };
    expect(
      deriveCitationTargetState(bare, {
        source: "present",
        currentSourceName: "Now",
      }).displayName,
    ).toBe("Now");
    const gone = deriveCitationTargetState(bare, { source: "absent" });
    expect(gone.displayName).toBeUndefined();
    expect(gone.sourceRemoved).toBe(true);
  });

  it("ignores attachment and excerpt inputs when the target has no such id", () => {
    const r = deriveCitationTargetState(
      { sourceId: SOURCE_ID, sourceName: "S" },
      { source: "present", attachment: "removed", excerpt: "removed" },
    );
    expect(r.state).toBe("present");
  });

  it("a missing Source outranks a removed attachment or excerpt", () => {
    const r = deriveCitationTargetState(FULL_TARGET, {
      source: "in-trash",
      attachment: "removed",
      excerpt: "removed",
    });
    expect(r.state).toBe("source-in-trash");
  });

  it("never resolves to hidden, nothing or deleted over every input combination", () => {
    const states = new Set<CitationTargetState>();
    for (const source of ["present", "in-trash", "absent"] as const) {
      for (const attachment of ["present", "removed", undefined] as const) {
        for (const excerpt of ["present", "removed", undefined] as const) {
          const r = deriveCitationTargetState(FULL_TARGET, {
            source,
            attachment,
            excerpt,
          });
          states.add(r.state);
          expect(FORBIDDEN).not.toContain(r.state);
        }
      }
    }
    expect([...states].sort()).toEqual([
      "attachment-removed",
      "excerpt-removed",
      "present",
      "source-in-trash",
      "source-purged",
    ]);
  });

  it("is pure and import-free (FR-4): no import of any kind, no I/O", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../src/lib/models/citation-target-state.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/^\s*import\s+(?!type\b)/m);
    expect(src).not.toMatch(/\brequire\(|\bfetch\(|node:|\.json["']/);
  });
});
