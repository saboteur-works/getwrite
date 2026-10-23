/**
 * note_5f0521e0 (Feature 78): two saves to one resource released 0-5 ms apart
 * left content.bin as an unparseable mix of both documents (36 of 200 runs in
 * the app; the start of the short document followed by the tail of the long
 * one). This drives `updateRevisionInPlace` twice at once on the real
 * filesystem and requires content.bin to always hold one whole document.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listRevisions, writeRevision } from "../../src/lib/models/revision";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

function documentOf(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

const BASE = documentOf("BASE alpha bravo charlie");
const SHORT = documentOf("BASE alpha bravo charlie A1");
const LONG = documentOf(
  `BASE alpha bravo charlie B2LONG ${Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ")}`,
);

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
});

async function canonicalResource(): Promise<{
  projectRoot: string;
  resourceId: string;
  revisionId: string;
  contentPath: string;
}> {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-concurrent-"),
  );
  dirs.push(projectRoot);
  const resourceId = generateUUID();
  await writeRevision(projectRoot, resourceId, 1, BASE, { isCanonical: true });
  const [revision] = await listRevisions(projectRoot, resourceId);
  return {
    projectRoot,
    resourceId,
    revisionId: revision!.id,
    contentPath: path.join(
      projectRoot,
      "revisions",
      resourceId,
      "v-1",
      "content.bin",
    ),
  };
}

describe("updateRevisionInPlace — two saves at once", () => {
  it("leaves content.bin holding one whole document every time", async () => {
    const outcomes: string[] = [];
    for (let rep = 0; rep < 40; rep += 1) {
      const r = await canonicalResource();
      // Long released first, as in every damaged run of the app measurement.
      await Promise.all([
        updateRevisionInPlace(r.projectRoot, r.resourceId, r.revisionId, LONG),
        updateRevisionInPlace(r.projectRoot, r.resourceId, r.revisionId, SHORT),
      ]);
      const stored = await fs.readFile(r.contentPath, "utf8");
      outcomes.push(
        stored === LONG ? "long" : stored === SHORT ? "short" : "mixed",
      );
    }
    expect(outcomes.filter((o) => o === "mixed")).toEqual([]);
  }, 60000);
});
