/**
 * note_746a516e (unlocked read-modify-writes): two writes that each read a
 * file, merge, and write it back can lose one another's change when they
 * overlap. These drive the real cores at once on the real filesystem:
 * - a metadata save (`updateSidecarCore`) and a canonical save
 *   (`updateRevisionInPlace`, which rewrites the sidecar's updatedAt and
 *   wordCount) on the same resource: the status must survive;
 * - two editor-style saves (`updateEditorConfigCore`), one for headings and
 *   one for body: both must survive.
 *
 * Measured 2026-10-23 before the fix: the editor-config case failed on its
 * first repetition in two runs, with project.json unparseable ("Unexpected
 * non-whitespace character after JSON"), not merely missing one change. The
 * status case passed 20 of 20 in both runs, so that race was not reproduced
 * here; it stays as a guard.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { updateSidecarCore } from "../../src/lib/models/resource-crud-core";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { updateEditorConfigCore } from "../../src/lib/models/editor-config-core";
import { addField, addGroup } from "../../src/lib/models/metadata-schema";
import { listRevisions } from "../../src/lib/models/revision";
import { readSidecar } from "../../src/lib/models/sidecar";
import { createResourceOfType } from "../../src/lib/models/resource-factory";
import { writeResourceWithInitialRevision } from "../../src/lib/models/resource-initial-revision";
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

async function newProject(): Promise<{
  projectId: string;
  projectRoot: string;
}> {
  const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-meta-race-"));
  dirs.push(projectsDir);
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  const projectId = generateUUID();
  const projectRoot = path.join(projectsDir, projectId);
  await createAndAssertProject(
    {
      id: "meta-race",
      name: "Meta Race",
      folders: [{ name: "Workspace", special: true }],
    },
    { projectRoot, name: "Meta Race" },
  );
  return { projectId, projectRoot };
}

const doc = (text: string): string =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

describe("metadata read-modify-writes at once", () => {
  it("a status change survives a canonical save of the same resource", async () => {
    const lost: number[] = [];
    for (let rep = 0; rep < 20; rep += 1) {
      const { projectId, projectRoot } = await newProject();
      const resource = createResourceOfType("text", {
        name: `Scene ${rep}`,
        type: "text",
        text: { plainText: "one two three" },
      });
      await writeResourceWithInitialRevision(projectRoot, resource);
      const [revision] = await listRevisions(projectRoot, resource.id);
      await flushIndexer();

      await Promise.all([
        updateRevisionInPlace(
          projectRoot,
          resource.id,
          revision!.id,
          doc("one two three four"),
        ),
        updateSidecarCore(projectId, resource.id, {
          ...resource,
          userMetadata: { status: "Draft" },
        }),
      ]);

      const stored = await readSidecar(projectRoot, resource.id);
      const status = (stored?.userMetadata as { status?: string } | undefined)
        ?.status;
      if (status !== "Draft") lost.push(rep);
    }
    expect(lost).toEqual([]);
  }, 60000);

  it("concurrent heading and body saves both reach project.json", async () => {
    const lost: string[] = [];
    for (let rep = 0; rep < 20; rep += 1) {
      const { projectId, projectRoot } = await newProject();
      await Promise.all([
        updateEditorConfigCore({
          projectId,
          headings: { h1: { fontSize: "33px" } },
        }),
        updateEditorConfigCore({ projectId, body: { fontSize: "19px" } }),
      ]);
      const project = JSON.parse(
        await fs.readFile(path.join(projectRoot, "project.json"), "utf8"),
      ) as {
        config?: {
          editorConfig?: {
            headings?: { h1?: { fontSize?: string } };
            body?: { fontSize?: string };
          };
        };
      };
      const ec = project.config?.editorConfig;
      if (ec?.headings?.h1?.fontSize !== "33px") lost.push(`${rep}:headings`);
      if (ec?.body?.fontSize !== "19px") lost.push(`${rep}:body`);
    }
    expect(lost).toEqual([]);
  }, 60000);

  it("an editor-style save racing a schema change never leaves project.json unparseable", async () => {
    // metadata-schema.ts holds locks.ts's lock, not withMetaLock, so the two
    // writers are not serialized; atomic writes keep the file whole. Measured
    // 2026-10-23: the schema change was lost in 20 of 20 repetitions in each
    // of 9 runs (the editor save read project.json first and wrote back its
    // older copy). That lost update is a known open defect and is not
    // asserted here; only an unparseable file fails this test.
    const unparseable: number[] = [];
    for (let rep = 0; rep < 20; rep += 1) {
      const { projectId, projectRoot } = await newProject();
      await addGroup(projectRoot, {
        id: "custom-group",
        label: "Custom",
        fields: [],
      });
      await Promise.all([
        updateEditorConfigCore({ projectId, body: { fontSize: "19px" } }),
        addField(projectRoot, "custom-group", {
          key: "mood",
          label: "Mood",
          type: "text",
        }),
      ]);
      const raw = await fs.readFile(
        path.join(projectRoot, "project.json"),
        "utf8",
      );
      try {
        JSON.parse(raw);
      } catch {
        unparseable.push(rep);
      }
    }
    expect(unparseable).toEqual([]);
  }, 60000);
});
