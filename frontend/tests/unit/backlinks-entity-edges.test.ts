import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter, mkdir, writeFile } from "../../src/lib/models/io";
import {
  getEntityBacklinkEdges,
  persistBacklinks,
  type BacklinkIndex,
} from "../../src/lib/models/backlinks";

async function makeProject(): Promise<string> {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-bk-ee-"));
  await mkdir(path.join(projectRoot, "resources"), { recursive: true });
  await mkdir(path.join(projectRoot, "meta"), { recursive: true });
  return projectRoot;
}

async function addResource(
  projectRoot: string,
  resourceId: string,
): Promise<void> {
  await mkdir(path.join(projectRoot, "resources", resourceId), {
    recursive: true,
  });
}

async function writeSidecarFields(
  projectRoot: string,
  resourceId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const filePath = path.join(
    projectRoot,
    "meta",
    `resource-${resourceId}.meta.json`,
  );
  await writeFile(filePath, JSON.stringify(fields, null, 2), "utf8");
}

describe("getEntityBacklinkEdges (Feature 68, Task 2)", () => {
  beforeEach(() => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
  });

  it("produces one edge for two entities whose own resources backlink to each other", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "entity-a");
    await writeSidecarFields(projectRoot, "entity-a", {
      name: "Aria",
      entityKind: "character",
    });
    await addResource(projectRoot, "entity-b");
    await writeSidecarFields(projectRoot, "entity-b", {
      name: "Jones",
      entityKind: "character",
    });

    const index: BacklinkIndex = {
      "entity-a": ["entity-b"],
      "entity-b": ["entity-a"],
    };
    await persistBacklinks(projectRoot, index);

    const edges = await getEntityBacklinkEdges(projectRoot);

    expect(edges).toHaveLength(1);
    expect(new Set(edges[0]?.entityIds)).toEqual(
      new Set(["entity-a", "entity-b"]),
    );
  });

  it("produces no edges when entities have no backlinked resource", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "entity-a");
    await writeSidecarFields(projectRoot, "entity-a", {
      name: "Aria",
      entityKind: "character",
    });
    await addResource(projectRoot, "entity-b");
    await writeSidecarFields(projectRoot, "entity-b", {
      name: "Jones",
      entityKind: "character",
    });

    await persistBacklinks(projectRoot, { "entity-a": [], "entity-b": [] });

    const edges = await getEntityBacklinkEdges(projectRoot);

    expect(edges).toEqual([]);
  });

  it("ignores a backlink between two resources neither of which is a declared entity", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "plain-a");
    await writeSidecarFields(projectRoot, "plain-a", {
      name: "Not An Entity A",
    });
    await addResource(projectRoot, "plain-b");
    await writeSidecarFields(projectRoot, "plain-b", {
      name: "Not An Entity B",
    });

    await persistBacklinks(projectRoot, {
      "plain-a": ["plain-b"],
      "plain-b": ["plain-a"],
    });

    const edges = await getEntityBacklinkEdges(projectRoot);

    expect(edges).toEqual([]);
  });

  it("ignores a backlink where only one side is a declared entity", async () => {
    const projectRoot = await makeProject();
    await addResource(projectRoot, "entity-a");
    await writeSidecarFields(projectRoot, "entity-a", {
      name: "Aria",
      entityKind: "character",
    });
    await addResource(projectRoot, "plain-b");
    await writeSidecarFields(projectRoot, "plain-b", { name: "Not An Entity" });

    await persistBacklinks(projectRoot, {
      "entity-a": ["plain-b"],
      "plain-b": ["entity-a"],
    });

    const edges = await getEntityBacklinkEdges(projectRoot);

    expect(edges).toEqual([]);
  });

  it("returns no edges for an empty project", async () => {
    const projectRoot = await makeProject();

    const edges = await getEntityBacklinkEdges(projectRoot);

    expect(edges).toEqual([]);
  });
});
