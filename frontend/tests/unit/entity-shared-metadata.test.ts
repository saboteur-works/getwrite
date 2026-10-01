/**
 * Unit tests for `entity-shared-metadata.ts` (Feature 68, Task 4).
 *
 * Exercises `getEntitySharedMetadataEdges` (FR-5) against real sidecars, a
 * real `project.json`, and real resource directories under a temp project
 * root, following the real-fs pattern established in `mentions-core.test.ts`
 * and `tags.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { createTag, assignTagToResource } from "../../src/lib/models/tags";
import { addGroup, addField } from "../../src/lib/models/metadata-schema";
import { getEntitySharedMetadataEdges } from "../../src/lib/models/entity-shared-metadata";

async function makeTmpProjectRoot(): Promise<string> {
  const dir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-entity-shared-metadata-"),
  );
  const proj = createProject({ name: "shared-metadata-test" });
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return dir;
}

/** Declares a resource as an entity by creating its directory + sidecar. */
async function declareEntity(
  projectRoot: string,
  resourceId: string,
  name: string,
  userMetadata?: Record<string, string>,
): Promise<void> {
  const resourceDir = path.join(projectRoot, "resources", resourceId);
  await fs.mkdir(resourceDir, { recursive: true });
  await writeSidecar(projectRoot, resourceId, {
    id: resourceId,
    name,
    entityKind: "character",
    ...(userMetadata ? { userMetadata } : {}),
  });
}

function findEdge(
  edges: Awaited<ReturnType<typeof getEntitySharedMetadataEdges>>,
  a: string,
  b: string,
) {
  return edges.find(
    (edge) =>
      (edge.entityIdA === a && edge.entityIdB === b) ||
      (edge.entityIdA === b && edge.entityIdB === a),
  );
}

describe("getEntitySharedMetadataEdges (FR-5)", () => {
  it("draws an edge between two entities sharing a single tag", async () => {
    const projectRoot = await makeTmpProjectRoot();
    await declareEntity(projectRoot, "entity-a", "Aria");
    await declareEntity(projectRoot, "entity-b", "Jones");

    const tag = await createTag(projectRoot, "Protagonist");
    await assignTagToResource(projectRoot, "entity-a", tag.id);
    await assignTagToResource(projectRoot, "entity-b", tag.id);

    const edges = await getEntitySharedMetadataEdges(projectRoot);

    expect(edges).toHaveLength(1);
    const edge = findEdge(edges, "entity-a", "entity-b");
    expect(edge).toBeDefined();
    expect(edge?.sharedTagIds).toEqual([tag.id]);
    expect(edge?.sharedFieldKeys).toEqual([]);
  });

  it("draws an edge between two entities sharing a single custom-field value", async () => {
    const projectRoot = await makeTmpProjectRoot();
    await addGroup(projectRoot, {
      id: "custom-group",
      label: "Custom",
      fields: [],
    });
    await addField(projectRoot, "custom-group", {
      key: "faction",
      label: "Faction",
      type: "text",
    });

    await declareEntity(projectRoot, "entity-a", "Aria", { faction: "Empire" });
    await declareEntity(projectRoot, "entity-b", "Jones", {
      faction: "Empire",
    });

    const edges = await getEntitySharedMetadataEdges(projectRoot);

    expect(edges).toHaveLength(1);
    const edge = findEdge(edges, "entity-a", "entity-b");
    expect(edge).toBeDefined();
    expect(edge?.sharedFieldKeys).toEqual(["faction"]);
    expect(edge?.sharedTagIds).toEqual([]);
  });

  it("draws no edge between entities sharing nothing", async () => {
    const projectRoot = await makeTmpProjectRoot();
    await addGroup(projectRoot, {
      id: "custom-group",
      label: "Custom",
      fields: [],
    });
    await addField(projectRoot, "custom-group", {
      key: "faction",
      label: "Faction",
      type: "text",
    });

    await declareEntity(projectRoot, "entity-a", "Aria", { faction: "Empire" });
    await declareEntity(projectRoot, "entity-b", "Jones", {
      faction: "Rebellion",
    });

    const tagA = await createTag(projectRoot, "Hero");
    const tagB = await createTag(projectRoot, "Villain");
    await assignTagToResource(projectRoot, "entity-a", tagA.id);
    await assignTagToResource(projectRoot, "entity-b", tagB.id);

    const edges = await getEntitySharedMetadataEdges(projectRoot);

    expect(edges).toEqual([]);
  });

  it("ignores a shared tag assignment involving a resource that is not a declared entity", async () => {
    const projectRoot = await makeTmpProjectRoot();
    await declareEntity(projectRoot, "entity-a", "Aria");

    // A plain resource (no entityKind) sharing the same tag must not pair
    // with the declared entity.
    const resourceDir = path.join(projectRoot, "resources", "plain-resource");
    await fs.mkdir(resourceDir, { recursive: true });
    await writeSidecar(projectRoot, "plain-resource", {
      id: "plain-resource",
      name: "Chapter One",
    });

    const tag = await createTag(projectRoot, "Draft");
    await assignTagToResource(projectRoot, "entity-a", tag.id);
    await assignTagToResource(projectRoot, "plain-resource", tag.id);

    const edges = await getEntitySharedMetadataEdges(projectRoot);

    expect(edges).toEqual([]);
  });

  it("returns a single edge aggregating both a shared tag and a shared field", async () => {
    const projectRoot = await makeTmpProjectRoot();
    await addGroup(projectRoot, {
      id: "custom-group",
      label: "Custom",
      fields: [],
    });
    await addField(projectRoot, "custom-group", {
      key: "faction",
      label: "Faction",
      type: "text",
    });

    await declareEntity(projectRoot, "entity-a", "Aria", { faction: "Empire" });
    await declareEntity(projectRoot, "entity-b", "Jones", {
      faction: "Empire",
    });

    const tag = await createTag(projectRoot, "Protagonist");
    await assignTagToResource(projectRoot, "entity-a", tag.id);
    await assignTagToResource(projectRoot, "entity-b", tag.id);

    const edges = await getEntitySharedMetadataEdges(projectRoot);

    expect(edges).toHaveLength(1);
    const edge = findEdge(edges, "entity-a", "entity-b");
    expect(edge?.sharedTagIds).toEqual([tag.id]);
    expect(edge?.sharedFieldKeys).toEqual(["faction"]);
  });
});
