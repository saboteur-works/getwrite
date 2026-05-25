import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createTextResource } from "../../src/lib/models/resource-factory";
import {
  writeResourceToFile,
  getLocalResources,
} from "../../src/lib/models/resource-persistence";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { buildProjectView } from "../../src/lib/models/project-view";
import type {
  Folder,
  Project,
  TextResource,
  MetadataValue,
} from "../../src/lib/models/types";

const project: Project = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  name: "Order Preservation Test",
  createdAt: "2026-05-13T00:00:00.000Z",
};

const folder: Folder = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  name: "Workspace",
  slug: "workspace",
  type: "folder",
  createdAt: "2026-05-13T00:00:00.000Z",
  orderIndex: 0,
};

/**
 * Simulate the fixed sidecar-route merge: read existing sidecar, apply metadata
 * update, preserve orderIndex and folderId from disk.
 */
async function simulateMetadataSave(
  projectRoot: string,
  resourceId: string,
  metadataUpdate: Record<string, MetadataValue>,
): Promise<void> {
  const existing = await readSidecar(projectRoot, resourceId).catch(() => null);
  const merged = {
    ...(existing ?? {}),
    ...metadataUpdate,
    orderIndex:
      existing?.orderIndex ??
      (metadataUpdate.orderIndex as number | undefined) ??
      0,
    folderId:
      existing?.folderId ??
      (metadataUpdate.folderId as string | null | undefined) ??
      null,
  };
  await writeSidecar(projectRoot, resourceId, merged);
}

describe("sidecar order preservation (TDD regression — T007)", () => {
  it("orderIndex survives writeResourceToFile round-trip", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-order-"));

    const rA = createTextResource({
      name: "A",
      folderId: folder.id,
      orderIndex: 2,
    });
    const rB = createTextResource({
      name: "B",
      folderId: folder.id,
      orderIndex: 0,
    });
    const rC = createTextResource({
      name: "C",
      folderId: folder.id,
      orderIndex: 1,
    });

    await writeResourceToFile(tmp, rA);
    await writeResourceToFile(tmp, rB);
    await writeResourceToFile(tmp, rC);

    const sidecarA = await readSidecar(tmp, rA.id);
    const sidecarB = await readSidecar(tmp, rB.id);
    const sidecarC = await readSidecar(tmp, rC.id);

    expect(sidecarA?.orderIndex).toBe(2);
    expect(sidecarB?.orderIndex).toBe(0);
    expect(sidecarC?.orderIndex).toBe(1);
  });

  it("getLocalResources returns resources with correct orderIndex after writeResourceToFile", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-order-"));

    const rA = createTextResource({
      name: "A",
      folderId: folder.id,
      orderIndex: 2,
    });
    const rB = createTextResource({
      name: "B",
      folderId: folder.id,
      orderIndex: 0,
    });
    const rC = createTextResource({
      name: "C",
      folderId: folder.id,
      orderIndex: 1,
    });

    await writeResourceToFile(tmp, rA);
    await writeResourceToFile(tmp, rB);
    await writeResourceToFile(tmp, rC);

    const loaded = getLocalResources(tmp);
    const orderMap = new Map(loaded.map((r) => [r.name, r.orderIndex]));

    expect(orderMap.get("A")).toBe(2);
    expect(orderMap.get("B")).toBe(0);
    expect(orderMap.get("C")).toBe(1);
  });

  it("buildProjectView sorts correctly after disk round-trip regardless of filesystem order", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-order-"));

    // Write in a scrambled orderIndex sequence to expose any filesystem-order dependency
    const rA = createTextResource({
      name: "A",
      folderId: folder.id,
      orderIndex: 2,
    });
    const rB = createTextResource({
      name: "B",
      folderId: folder.id,
      orderIndex: 0,
    });
    const rC = createTextResource({
      name: "C",
      folderId: folder.id,
      orderIndex: 1,
    });

    await writeResourceToFile(tmp, rA);
    await writeResourceToFile(tmp, rB);
    await writeResourceToFile(tmp, rC);

    const loaded = getLocalResources(tmp).filter(
      (r) => r.type === "text",
    ) as TextResource[];

    const view = buildProjectView({
      project,
      folders: [folder],
      resources: loaded,
    });

    expect(view.folders[0].resources.map((r) => r.title)).toEqual([
      "B",
      "C",
      "A",
    ]);
    expect(view.folders[0].resources.map((r) => r._orderIndex)).toEqual([
      0, 1, 2,
    ]);
  });

  it("orderIndex survives a notes metadata save", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-order-"));

    const r1 = createTextResource({
      name: "First",
      folderId: folder.id,
      orderIndex: 0,
    });
    const r2 = createTextResource({
      name: "Second",
      folderId: folder.id,
      orderIndex: 1,
    });

    await writeResourceToFile(tmp, r1);
    await writeResourceToFile(tmp, r2);

    // Simulate saving notes via the Sidebar
    await simulateMetadataSave(tmp, r1.id, {
      userMetadata: { notes: "These are my notes." },
    });
    await simulateMetadataSave(tmp, r2.id, {
      userMetadata: { notes: "Chapter notes." },
    });

    const loaded = getLocalResources(tmp).filter(
      (r) => r.type === "text",
    ) as TextResource[];
    const view = buildProjectView({
      project,
      folders: [folder],
      resources: loaded,
    });

    expect(view.folders[0].resources.map((r) => r.title)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("orderIndex survives status, pov, storyDate, storyDuration metadata saves", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-order-"));

    const r1 = createTextResource({
      name: "Scene One",
      folderId: folder.id,
      orderIndex: 0,
    });
    const r2 = createTextResource({
      name: "Scene Two",
      folderId: folder.id,
      orderIndex: 1,
    });
    const r3 = createTextResource({
      name: "Scene Three",
      folderId: folder.id,
      orderIndex: 2,
    });

    await writeResourceToFile(tmp, r1);
    await writeResourceToFile(tmp, r2);
    await writeResourceToFile(tmp, r3);

    // Simulate saving each non-ordering metadata field
    await simulateMetadataSave(tmp, r1.id, {
      userMetadata: { status: "in-progress" },
    });
    await simulateMetadataSave(tmp, r2.id, { userMetadata: { pov: "Alice" } });
    await simulateMetadataSave(tmp, r3.id, {
      userMetadata: { storyDate: "2024-06-01", storyDuration: 45 },
    });

    const loaded = getLocalResources(tmp).filter(
      (r) => r.type === "text",
    ) as TextResource[];
    const view = buildProjectView({
      project,
      folders: [folder],
      resources: loaded,
    });

    expect(view.folders[0].resources.map((r) => r.title)).toEqual([
      "Scene One",
      "Scene Two",
      "Scene Three",
    ]);
    expect(view.folders[0].resources.map((r) => r._orderIndex)).toEqual([
      0, 1, 2,
    ]);
  });

  it("orderIndex survives Metadata Provider links being set (characters, locations, items)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-order-"));

    // Scrambled orderIndex to detect sort failures
    const r1 = createTextResource({
      name: "Chapter One",
      folderId: folder.id,
      orderIndex: 1,
    });
    const r2 = createTextResource({
      name: "Chapter Two",
      folderId: folder.id,
      orderIndex: 0,
    });
    const r3 = createTextResource({
      name: "Chapter Three",
      folderId: folder.id,
      orderIndex: 2,
    });

    await writeResourceToFile(tmp, r1);
    await writeResourceToFile(tmp, r2);
    await writeResourceToFile(tmp, r3);

    // Simulate setting Metadata Provider links in the Sidebar
    await simulateMetadataSave(tmp, r1.id, {
      userMetadata: { characters: ["Alice", "Bob"], locations: ["Forest"] },
    });
    await simulateMetadataSave(tmp, r2.id, {
      userMetadata: { characters: ["Carol"], items: ["Sword", "Shield"] },
    });
    await simulateMetadataSave(tmp, r3.id, {
      userMetadata: { locations: ["Castle", "Dungeon"], characters: ["Alice"] },
    });

    const loaded = getLocalResources(tmp).filter(
      (r) => r.type === "text",
    ) as TextResource[];
    const view = buildProjectView({
      project,
      folders: [folder],
      resources: loaded,
    });

    // Should be sorted by orderIndex: r2(0), r1(1), r3(2)
    expect(view.folders[0].resources.map((r) => r.title)).toEqual([
      "Chapter Two",
      "Chapter One",
      "Chapter Three",
    ]);
    expect(view.folders[0].resources.map((r) => r._orderIndex)).toEqual([
      0, 1, 2,
    ]);
  });

  it("orderIndex survives all metadata field types set simultaneously", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-order-"));

    const r1 = createTextResource({
      name: "Alpha",
      folderId: folder.id,
      orderIndex: 2,
    });
    const r2 = createTextResource({
      name: "Beta",
      folderId: folder.id,
      orderIndex: 0,
    });
    const r3 = createTextResource({
      name: "Gamma",
      folderId: folder.id,
      orderIndex: 1,
    });

    await writeResourceToFile(tmp, r1);
    await writeResourceToFile(tmp, r2);
    await writeResourceToFile(tmp, r3);

    // Set every possible metadata type in one save
    for (const [id] of [[r1.id], [r2.id], [r3.id]]) {
      await simulateMetadataSave(tmp, id, {
        userMetadata: {
          notes: "A note",
          status: "draft",
          pov: "Bob",
          storyDate: "2024-07-04",
          storyDuration: 120,
          characters: ["Alice", "Bob"],
          locations: ["Forest"],
          items: ["Ring"],
        },
      });
    }

    const loaded = getLocalResources(tmp).filter(
      (r) => r.type === "text",
    ) as TextResource[];
    const view = buildProjectView({
      project,
      folders: [folder],
      resources: loaded,
    });

    // Sorted by orderIndex: Beta(0), Gamma(1), Alpha(2)
    expect(view.folders[0].resources.map((r) => r.title)).toEqual([
      "Beta",
      "Gamma",
      "Alpha",
    ]);
  });
});
