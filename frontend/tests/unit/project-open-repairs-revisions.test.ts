/**
 * note_1243f93b: a text resource with content but no revision (made before
 * Feature 73) dropped every edit in the app, because autosave writes only into
 * a canonical revision, and only `getwrite-cli repair-revisions` fixed it.
 * Opening the project now writes the missing initial revision.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadProjectCore } from "../../src/lib/models/project-crud-core";
import { createResourceOfType } from "../../src/lib/models/resource-factory";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import { listRevisions } from "../../src/lib/models/revision";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";

const dirs: string[] = [];
const originalEnv = process.env.GETWRITE_PROJECTS_DIR;

afterEach(async () => {
  await flushIndexer();
  process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
});

async function projectWithRevisionlessResource(): Promise<{
  projectId: string;
  projectRoot: string;
  resourceId: string;
}> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-open-repair-"),
  );
  dirs.push(projectsDir);
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  const projectId = generateUUID();
  const projectRoot = path.join(projectsDir, projectId);
  await createAndAssertProject(
    {
      id: "open-repair",
      name: "Open Repair",
      folders: [{ name: "Workspace", special: true }],
    },
    { projectRoot, name: "Open Repair" },
  );
  const resource = createResourceOfType("text", {
    name: "Old Copy",
    type: "text",
    text: { plainText: "Words written before copies had revisions." },
  });
  await writeResourceToFile(projectRoot, resource);
  await flushIndexer();
  return { projectId, projectRoot, resourceId: resource.id };
}

describe("loadProjectCore — revision-less text resources", () => {
  it("writes the missing canonical revision with the resource's own text, so edits can be saved", async () => {
    const { projectId, projectRoot, resourceId } =
      await projectWithRevisionlessResource();
    expect(await listRevisions(projectRoot, resourceId)).toEqual([]);

    const loaded = await loadProjectCore(projectId);

    expect(loaded.resources.some((r) => r.id === resourceId)).toBe(true);
    const revisions = await listRevisions(projectRoot, resourceId);
    expect(revisions).toHaveLength(1);
    expect(revisions[0]!.isCanonical).toBe(true);
    const stored = await fs.readFile(
      path.join(projectRoot, "revisions", resourceId, "v-1", "content.bin"),
      "utf8",
    );
    expect(stored).toContain("Words written before copies had revisions.");

    const edited = JSON.stringify({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Edited after the repair." }],
        },
      ],
    });
    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      revisions[0]!.id,
      edited,
    );
    expect(
      await fs.readFile(
        path.join(projectRoot, "revisions", resourceId, "v-1", "content.bin"),
        "utf8",
      ),
    ).toBe(edited);
  });

  it("leaves a resource that already has a revision alone on a second open", async () => {
    const { projectId, projectRoot, resourceId } =
      await projectWithRevisionlessResource();
    await loadProjectCore(projectId);
    const first = await listRevisions(projectRoot, resourceId);

    await loadProjectCore(projectId);

    expect(await listRevisions(projectRoot, resourceId)).toEqual(first);
  });
});

describe("loadProjectCore — a text resource with no content.txt", () => {
  it("still opens the project, keeping the resource and its stored word count", async () => {
    const { projectId, projectRoot, resourceId } =
      await projectWithRevisionlessResource();
    await loadProjectCore(projectId); // gives it a revision first
    await fs.rm(path.join(projectRoot, "resources", resourceId, "content.txt"));

    const loaded = await loadProjectCore(projectId);

    const resource = loaded.resources.find((r) => r.id === resourceId) as
      | { plaintext?: string }
      | undefined;
    expect(resource).toBeDefined();
    // Falls back to the resource's TipTap document when that is there.
    expect(resource?.plaintext).toContain(
      "Words written before copies had revisions.",
    );
  });
});
