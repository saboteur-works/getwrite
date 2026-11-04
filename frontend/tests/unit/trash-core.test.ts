import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAndAssertProject } from "./helpers/project-creator";
import { softDeleteResource } from "../../src/lib/models/trash";
import { removeDirRetry } from "./helpers/fs-utils";
import { addAnnotationCore } from "../../src/lib/models/annotations-core";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { listRevisions } from "../../src/lib/models/revision";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { readSidecar } from "../../src/lib/models/sidecar";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  listTrashCore,
  restoreOneCore,
  purgeOneCore,
  purgeBatchCore,
} from "../../src/lib/models/trash-core";

describe("models/trash-core", () => {
  it("rejects an empty-string projectPath on every exported function", async () => {
    await expect(listTrashCore("")).rejects.toThrow();
    await expect(restoreOneCore("", "some-id")).rejects.toThrow();
    await expect(purgeOneCore("", "some-id")).rejects.toThrow();
    await expect(purgeBatchCore("", { all: true })).rejects.toThrow();
  });

  it("lists, restores, and purges a single trashed resource", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-core-"),
    );
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );

      const { projectPath, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Trash Core Test" },
      );

      if (resources.length === 0) {
        return;
      }

      const res = resources[0];
      await softDeleteResource(projectPath, res.id);

      const listed = await listTrashCore(projectPath);
      expect(listed.resources.some((r) => r.id === res.id)).toBe(true);

      const restoreResult = await restoreOneCore(projectPath, res.id);
      expect(restoreResult.ok).toBe(true);

      await softDeleteResource(projectPath, res.id);
      const purgeResult = await purgeOneCore(projectPath, res.id);
      expect(purgeResult.ok).toBe(true);

      const afterPurge = await listTrashCore(projectPath);
      expect(afterPurge.resources.some((r) => r.id === res.id)).toBe(false);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("a trashed and restored resource keeps its annotations and marks (Feature 101, FR-21)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-trash-ann-"));
    const previous = process.env.GETWRITE_PROJECTS_DIR;
    process.env.GETWRITE_PROJECTS_DIR = tmp;
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );
      const projectId = generateUUID();
      const projectPath = path.join(tmp, projectId);
      await createAndAssertProject(specPath, {
        projectRoot: projectPath,
        name: "Trash Annotations",
      });
      const created = await createResourceCore(projectId, {
        type: "text",
        name: "Noted",
        text: { plainText: "one two three" },
      });
      const noteId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
      const [rev] = await listRevisions(projectPath, created.id);
      const doc = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "one two three",
                marks: [{ type: "annotation", attrs: { id: noteId } }],
              },
            ],
          },
        ],
      };
      await updateRevisionInPlace(
        projectPath,
        created.id,
        rev.id,
        JSON.stringify(doc),
      );
      const added = await addAnnotationCore(projectId, created.id, {
        id: noteId,
        body: "keep me",
        quote: "one two three",
      });
      await flushIndexer();
      const tiptapPath = path.join(
        projectPath,
        "resources",
        created.id,
        "content.tiptap.json",
      );
      const docBefore = await fs.readFile(tiptapPath, "utf8");

      await softDeleteResource(projectPath, created.id);
      const restored = await restoreOneCore(projectPath, created.id);
      expect(restored.ok).toBe(true);
      await flushIndexer();

      const sidecar = await readSidecar(projectPath, created.id);
      expect(sidecar?.annotations).toEqual([added]);
      expect(await fs.readFile(tiptapPath, "utf8")).toBe(docBefore);
    } finally {
      if (previous === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
      else process.env.GETWRITE_PROJECTS_DIR = previous;
      await removeDirRetry(tmp);
    }
  });

  it("purgeBatchCore resolves { all: true } to every trashed item", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-trash-core-batch-"),
    );
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );

      const { projectPath, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Trash Core Batch Test" },
      );

      if (resources.length === 0) {
        return;
      }

      const res = resources[0];
      await softDeleteResource(projectPath, res.id);

      const results = await purgeBatchCore(projectPath, { all: true });
      expect(results.some((r) => r.id === res.id && r.ok)).toBe(true);

      const afterPurge = await listTrashCore(projectPath);
      expect(afterPurge.resources.length).toBe(0);
    } finally {
      await removeDirRetry(tmp);
    }
  });
});
