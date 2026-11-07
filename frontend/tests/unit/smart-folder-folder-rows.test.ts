/**
 * Feature 102, Task 16 (FR-14): a smart folder with `type = folder` lists
 * folders and filters them by fields, end to end from a real tmp project
 * through the evaluator into the Data view's rows; a failed folder read is a
 * rejection, never an empty result.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import {
  createFolderResource,
  writeResourceToFile,
} from "../../src/lib/models/resource";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { executeEvaluate } from "../../src/lib/models/query-evaluate-core";
import { listFolderDescriptors } from "../../src/lib/models/backlinks";
import { readFolderSidecar } from "../../src/lib/models/sidecar";
import {
  splitSmartFolderResults,
  buildFolderRows,
} from "../../src/lib/folder-data-rows";
import type { QueryAST } from "../../src/lib/models/query-ast";

const tmpDirs: string[] = [];

afterEach(async () => {
  await flushIndexer();
  for (const dir of tmpDirs.splice(0)) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});

async function seed(): Promise<{ root: string; a: string; b: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-folder-rows-"));
  tmpDirs.push(root);
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "p" })),
    "utf8",
  );
  const a = createFolderResource({ name: "Alpha" });
  const b = createFolderResource({ name: "Beta" });
  await writeResourceToFile(root, a);
  await writeResourceToFile(root, b);
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(
    path.join(root, "meta", `folder-${a.id}.meta.json`),
    JSON.stringify({
      userMetadata: { notes: "PRIVATE", mood: "tense" },
      resourceSubtype: "Act",
    }),
  );
  await fs.writeFile(
    path.join(root, "meta", `folder-${b.id}.meta.json`),
    JSON.stringify({ userMetadata: { mood: "calm" } }),
  );
  return { root, a: a.id, b: b.id };
}

const folderQuery = (child?: QueryAST): QueryAST => {
  const type: QueryAST = { op: "eq", field: "type", value: "folder" };
  return child ? { op: "and", children: [type, child] } : type;
};

async function rowsFor(root: string, ids: string[]) {
  const folders = await listFolderDescriptors(root);
  const { folders: matched } = splitSmartFolderResults(ids, [], folders);
  const byId = Object.fromEntries(
    await Promise.all(
      matched.map(
        async (f) => [f.id, await readFolderSidecar(root, f.id)] as const,
      ),
    ),
  );
  return buildFolderRows(matched, byId, [{ key: "mood", label: "Mood" }]);
}

describe("smart folder with type = folder", () => {
  it("lists the folders as rows with name, subtype and field columns, no notes", async () => {
    const { root } = await seed();
    const rows = await rowsFor(
      root,
      await executeEvaluate(root, folderQuery()),
    );
    expect(rows.map((r) => r.name).sort()).toEqual(["Alpha", "Beta"]);
    const alpha = rows.find((r) => r.name === "Alpha");
    expect(alpha?.subtype).toBe("Act");
    expect(alpha?.cells).toEqual([
      { key: "mood", label: "Mood", value: "tense" },
    ]);
    expect(JSON.stringify(rows)).not.toContain("PRIVATE");
  });

  it("filters the rows by a field value", async () => {
    const { root } = await seed();
    const ids = await executeEvaluate(
      root,
      folderQuery({ op: "eq", field: "mood", value: "calm" }),
    );
    const rows = await rowsFor(root, ids);
    expect(rows.map((r) => r.name)).toEqual(["Beta"]);
  });

  it("rejects, rather than returning no folders, when a folder sidecar is unreadable", async () => {
    const { root, a } = await seed();
    await fs.writeFile(
      path.join(root, "meta", `folder-${a}.meta.json`),
      "{ not json",
    );
    await expect(executeEvaluate(root, folderQuery())).rejects.toThrow();
  });
});
