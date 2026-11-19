/**
 * Regression: the split request check accepts the revision id the real
 * revision-creation code produces. Measured in the packaged desktop app, a
 * canonical revision id is a UUID (the `v-1` is the folder name), and every
 * split request was refused by the request check.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSplitBody, parseSplitPreviewBody } from "../../src/lib/api/split";
import { writeInitialCanonicalRevision } from "../../src/lib/models/resource-initial-revision";
import { listRevisions } from "../../src/lib/models/revision";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

const HASH = "a".repeat(64);
const dirs: string[] = [];

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function realCanonicalRevisionId(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "split-rev-id-"));
  dirs.push(root);
  const resourceId = generateUUID();
  await writeInitialCanonicalRevision(root, resourceId, {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
  });
  const canonical = (await listRevisions(root, resourceId)).find(
    (r) => r.isCanonical,
  );
  if (!canonical) throw new Error("no canonical revision written");
  return canonical.id;
}

describe("split request check with a real revision id", () => {
  it("accepts the canonical revision id the model layer writes", async () => {
    const revisionId = await realCanonicalRevisionId();
    const cursor = {
      resourceId: generateUUID(),
      revisionId,
      contentHash: HASH,
      offset: 3,
    };
    const projectId = generateUUID();
    expect(parseSplitPreviewBody({ projectId, ...cursor }).ok).toBe(true);
    expect(
      parseSplitBody({
        projectId,
        ...cursor,
        carryOver: { annotationIds: [], fields: [], newName: "" },
      }).ok,
    ).toBe(true);
  });

  it("refuses a folder-name style or malformed revision id", () => {
    const projectId = generateUUID();
    for (const revisionId of ["v-1", "../x", "", `${generateUUID()}x`]) {
      expect(
        parseSplitPreviewBody({
          projectId,
          resourceId: generateUUID(),
          revisionId,
          contentHash: HASH,
          offset: 0,
        }).ok,
      ).toBe(false);
    }
  });
});
