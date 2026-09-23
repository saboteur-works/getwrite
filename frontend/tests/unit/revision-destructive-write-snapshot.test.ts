import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import { writeRevision, listRevisions } from "../../src/lib/models/revision";
import {
  updateRevisionInPlace,
  AUTOMATIC_SNAPSHOT_NAME,
} from "../../src/lib/models/revision-core";
import { readFile } from "../../src/lib/models/io";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  isDestructiveContentChange,
  revisionWordCount,
} from "../../src/lib/models/content-loss";
import type { TipTapDocument } from "../../src/lib/models/types";
import path from "node:path";

/** A TipTap document holding `wordCount` single-character words. */
function documentOf(wordCount: number): string {
  const doc: TipTapDocument = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: Array.from({ length: wordCount }, (_, i) => `w${i}`).join(
              " ",
            ),
          },
        ],
      },
    ],
  };
  return JSON.stringify(doc);
}

const EMPTY_DOCUMENT = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

describe("isDestructiveContentChange", () => {
  it("treats emptying a resource as destructive at any size", () => {
    expect(isDestructiveContentChange(documentOf(4), EMPTY_DOCUMENT)).toBe(
      true,
    );
    expect(isDestructiveContentChange(documentOf(3000), EMPTY_DOCUMENT)).toBe(
      true,
    );
  });

  it("ignores growth and ordinary editing", () => {
    expect(isDestructiveContentChange(documentOf(100), documentOf(140))).toBe(
      false,
    );
    expect(isDestructiveContentChange(documentOf(100), documentOf(95))).toBe(
      false,
    );
    // Heavy but not destructive: more than half survives.
    expect(isDestructiveContentChange(documentOf(100), documentOf(60))).toBe(
      false,
    );
  });

  it("requires both a large proportion and an absolute floor", () => {
    // Half gone, but only 4 words: below the floor.
    expect(isDestructiveContentChange(documentOf(8), documentOf(4))).toBe(
      false,
    );
    // Half gone and well past the floor.
    expect(isDestructiveContentChange(documentOf(100), documentOf(40))).toBe(
      true,
    );
  });

  it("counts a legacy plain-text revision as the text it is", () => {
    // Not JSON: counted as prose rather than read as an empty document, which
    // would make every save against a legacy revision look destructive.
    expect(revisionWordCount("one two three")).toBe(3);
    expect(isDestructiveContentChange("one two three", documentOf(3))).toBe(
      false,
    );
  });

  it("never fires when there was nothing there to lose", () => {
    expect(isDestructiveContentChange(EMPTY_DOCUMENT, documentOf(20))).toBe(
      false,
    );
  });
});

describe("updateRevisionInPlace — snapshot before a destructive write", () => {
  let projectRoot: string;
  let resourceId: string;

  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
    projectRoot = "/proj-" + generateUUID();
    resourceId = generateUUID();
  });

  async function seedCanonical(content: string) {
    return writeRevision(projectRoot, resourceId, 1, content, {
      isCanonical: true,
    });
  }

  it("preserves the prior content when an autosave would empty the resource", async () => {
    const original = documentOf(400);
    const canonical = await seedCanonical(original);

    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      canonical.id,
      EMPTY_DOCUMENT,
    );

    const revisions = await listRevisions(projectRoot, resourceId);
    expect(revisions).toHaveLength(2);

    const snapshot = revisions.find((r) => !r.isCanonical);
    expect(snapshot).toBeDefined();
    expect(snapshot?.metadata?.name).toBe(AUTOMATIC_SNAPSHOT_NAME);
    expect(snapshot?.metadata?.automaticSnapshot).toBe(true);

    // The point of the whole exercise: the writer's prose is still on disk.
    const preserved = await readFile(
      path.join(
        projectRoot,
        "revisions",
        resourceId,
        `v-${snapshot?.versionNumber}`,
        "content.bin",
      ),
      "utf8",
    );
    expect(preserved).toBe(original);

    // And the canonical revision still took the write it was given.
    const canonicalAfter = revisions.find((r) => r.isCanonical);
    const canonicalContent = await readFile(
      path.join(
        projectRoot,
        "revisions",
        resourceId,
        `v-${canonicalAfter?.versionNumber}`,
        "content.bin",
      ),
      "utf8",
    );
    expect(canonicalContent).toBe(EMPTY_DOCUMENT);
  });

  it("adds no revision for an ordinary edit", async () => {
    const canonical = await seedCanonical(documentOf(100));

    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      canonical.id,
      documentOf(120),
    );

    const revisions = await listRevisions(projectRoot, resourceId);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].isCanonical).toBe(true);
  });

  it("snapshots once per destructive step, not on every later save", async () => {
    const canonical = await seedCanonical(documentOf(400));

    // The destructive write.
    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      canonical.id,
      EMPTY_DOCUMENT,
    );
    // The writer keeps typing into the now-empty document; each of these is
    // growth against the new canonical content, so none of them snapshots.
    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      canonical.id,
      documentOf(5),
    );
    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      canonical.id,
      documentOf(12),
    );

    const revisions = await listRevisions(projectRoot, resourceId);
    expect(revisions).toHaveLength(2);
  });
});
