/**
 * `repairMissingInitialRevisions`: gives a text resource that has content but
 * no revision directory its initial canonical revision.
 *
 * Such resources exist in real stores (created before the app wrote a
 * revision at creation, or copied before copies got one) and the editor does
 * not save edits typed into them.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { repairMissingInitialRevisions } from "../../src/lib/models/revision-repair";
import { createResourceOfType } from "../../src/lib/models/resource-factory";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import { writeResourceWithInitialRevision } from "../../src/lib/models/resource-initial-revision";
import { listRevisions } from "../../src/lib/models/revision";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";

const SPEC = {
  id: "repair-test",
  name: "Repair Test",
  folders: [{ name: "Workspace", special: true }],
};

async function listTree(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string): Promise<void> {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push(path.relative(dir, full));
    }
  }
  await walk(dir);
  return out.sort();
}

describe("repairMissingInitialRevisions", () => {
  let root: string;

  /** A text resource written the way the app writes one, minus its revision. */
  async function writeRevisionless(
    name: string,
    plainText: string,
  ): Promise<string> {
    const resource = createResourceOfType("text", {
      name,
      type: "text",
      text: { plainText },
    });
    await writeResourceToFile(root, resource);
    return resource.id;
  }

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-revision-repair-"));
    await createAndAssertProject(SPEC, { projectRoot: root, name: "Repair" });
  });

  afterEach(async () => {
    await flushIndexer();
    await removeDirRetry(root);
  });

  it("reports a revision-less text resource in a dry run and writes nothing", async () => {
    const id = await writeRevisionless("Old Note", "Some words here.");
    await flushIndexer();
    const before = await listTree(path.join(root, "revisions")).catch(
      () => [] as string[],
    );

    const report = await repairMissingInitialRevisions(root, { dryRun: true });

    expect(report.repaired).toEqual([{ id, name: "Old Note" }]);
    expect(report.skipped).toEqual([]);
    expect(await listRevisions(root, id)).toEqual([]);
    const after = await listTree(path.join(root, "revisions")).catch(
      () => [] as string[],
    );
    expect(after).toEqual(before);
  });

  it("writes one canonical v-1 holding the resource's own document", async () => {
    const id = await writeRevisionless("Old Note", "First line\nSecond line");

    const report = await repairMissingInitialRevisions(root);

    expect(report.repaired).toEqual([{ id, name: "Old Note" }]);
    const revisions = await listRevisions(root, id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].versionNumber).toBe(1);
    expect(revisions[0].isCanonical).toBe(true);
    expect(revisions[0].resourceId).toBe(id);

    const revisionContent = JSON.parse(
      await fs.readFile(
        path.join(root, "revisions", id, "v-1", "content.bin"),
        "utf8",
      ),
    );
    const resourceContent = JSON.parse(
      await fs.readFile(
        path.join(root, "resources", id, "content.tiptap.json"),
        "utf8",
      ),
    );
    expect(revisionContent).toEqual(resourceContent);
  });

  it("makes the repaired resource saveable through the canonical-save path", async () => {
    const id = await writeRevisionless("Old Note", "Before");
    await repairMissingInitialRevisions(root);
    const [revision] = await listRevisions(root, id);

    const next = JSON.stringify({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "After" }] },
      ],
    });
    await updateRevisionInPlace(root, id, revision.id, next);

    expect(
      await fs.readFile(
        path.join(root, "resources", id, "content.txt"),
        "utf8",
      ),
    ).toContain("After");
  });

  it("repairs an empty document", async () => {
    const id = await writeRevisionless("Empty", "");

    const report = await repairMissingInitialRevisions(root);

    expect(report.repaired.map((r) => r.id)).toEqual([id]);
    expect(await listRevisions(root, id)).toHaveLength(1);
  });

  it("leaves a resource that already has a revision untouched", async () => {
    const healthy = createResourceOfType("text", {
      name: "Healthy",
      type: "text",
      text: { plainText: "Has a revision." },
    });
    await writeResourceWithInitialRevision(root, healthy);
    const before = await listTree(path.join(root, "revisions", healthy.id));
    const beforeBytes = await fs.readFile(
      path.join(root, "revisions", healthy.id, "v-1", "metadata.json"),
      "utf8",
    );

    const report = await repairMissingInitialRevisions(root);

    expect(report.repaired).toEqual([]);
    expect(await listTree(path.join(root, "revisions", healthy.id))).toEqual(
      before,
    );
    expect(
      await fs.readFile(
        path.join(root, "revisions", healthy.id, "v-1", "metadata.json"),
        "utf8",
      ),
    ).toBe(beforeBytes);
  });

  it("does not treat a revision directory with unreadable metadata as missing", async () => {
    const id = await writeRevisionless("Damaged", "Body");
    const revDir = path.join(root, "revisions", id, "v-1");
    await fs.mkdir(revDir, { recursive: true });
    await fs.writeFile(path.join(revDir, "metadata.json"), "{ not json");

    const report = await repairMissingInitialRevisions(root);

    expect(report.repaired).toEqual([]);
    expect(await fs.readFile(path.join(revDir, "metadata.json"), "utf8")).toBe(
      "{ not json",
    );
  });

  it("skips a text resource with no content files and says why", async () => {
    const id = await writeRevisionless("Hollow", "Body");
    await fs.rm(path.join(root, "resources", id), { recursive: true });

    const report = await repairMissingInitialRevisions(root);

    expect(report.repaired).toEqual([]);
    expect(report.skipped).toEqual([
      { id, name: "Hollow", reason: "no content files" },
    ]);
    expect(await listRevisions(root, id)).toEqual([]);
  });

  it("ignores image and audio resources", async () => {
    const image = createResourceOfType("image", {
      name: "Picture",
      type: "image",
    });
    await writeResourceToFile(root, image);

    const report = await repairMissingInitialRevisions(root);

    expect(report.repaired).toEqual([]);
    expect(report.skipped).toEqual([]);
  });

  it("is idempotent", async () => {
    await writeRevisionless("Old Note", "Body");
    const first = await repairMissingInitialRevisions(root);
    const second = await repairMissingInitialRevisions(root);

    expect(first.repaired).toHaveLength(1);
    expect(second.repaired).toEqual([]);
    expect(second.skipped).toEqual([]);
  });
});
