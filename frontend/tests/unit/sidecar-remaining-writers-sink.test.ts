/**
 * Feature 92 Task 20: `reorderResourcesCore`'s sidecar loop,
 * `nullifyResourceRefs`, `relinkResourceRefs` (through `restoreResource`) and
 * `applyDocumentMetadata` compute their new sidecar value from a read taken
 * inside the sink (`mutateSidecar`). Each test holds the sidecar inside a slow
 * sink callback that adds a distinct field, starts the writer while it is held,
 * and asserts the held field survives (a read taken before the lock would
 * write back the old value). Real temp-dir projects.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  mutateSidecar,
  readSidecar,
  sidecarPathForProject,
  writeSidecar,
} from "../../src/lib/models/sidecar";
import { reorderResourcesCore } from "../../src/lib/models/resource-crud-core";
import {
  nullifyResourceRefs,
  restoreResource,
} from "../../src/lib/models/trash";
import { deleteResourceCore } from "../../src/lib/models/resource-crud-core";
import { applyDocumentMetadata } from "../../src/lib/models/scrivener/apply-document-metadata";
import { makeRefFixture } from "./helpers/f87-reference-delete-fixture";
import { removeDirRetry } from "./helpers/fs-utils";

const dirs: string[] = [];

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function makeRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-sidecar-sink-20-"));
  dirs.push(root);
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  return root;
}

/**
 * Holds the sidecar's sink for `ms` and then adds `heldField: true`. Resolves
 * `started` once the callback is running (the lock is held), and `done` when
 * the write has finished.
 */
async function holdSidecar(
  root: string,
  id: string,
  ms: number,
): Promise<{ done: Promise<unknown> }> {
  let signalStarted: () => void = () => undefined;
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  const done = mutateSidecar(root, id, async (current) => {
    signalStarted();
    await new Promise((resolve) => setTimeout(resolve, ms));
    return { ...(current ?? {}), heldField: true };
  });
  await started;
  return { done };
}

describe("reorderResourcesCore sidecar loop on the sink", () => {
  it("keeps a racing change in 30 repetitions, and merges orderIndex and folderId as before", async () => {
    const root = await makeRoot();
    const a = generateUUID();
    const b = generateUUID();
    const folder = generateUUID();
    await writeSidecar(root, a, { name: "A", orderIndex: 9, folderId: folder });
    await writeSidecar(root, b, { name: "B", orderIndex: 1 });
    for (let i = 0; i < 30; i++) {
      await Promise.all([
        reorderResourcesCore("unused", {
          projectRootOverride: root,
          folderOrder: [],
          resourceOrder: [
            { id: a, orderIndex: 0, folderId: null },
            { id: b, orderIndex: 2, folderId: folder },
          ],
        }),
        mutateSidecar(root, a, (cur) => ({ ...(cur ?? {}), [`f${i}`]: i })),
      ]);
      const stored = await readSidecar(root, a);
      expect(stored?.[`f${i}`], `repetition ${i}`).toBe(i);
      expect(stored).toMatchObject({
        name: "A",
        orderIndex: 0,
        folderId: folder,
      });
    }
    expect(await readSidecar(root, b)).toEqual({
      name: "B",
      orderIndex: 2,
      folderId: folder,
    });
  });

  it("logs and continues when one sidecar fails", async () => {
    const root = await makeRoot();
    const bad = generateUUID();
    const good = generateUUID();
    // A directory where the sidecar file belongs makes the write fail.
    await fs.mkdir(sidecarPathForProject(root, bad), { recursive: true });
    await writeSidecar(root, good, { name: "Good", orderIndex: 5 });
    await reorderResourcesCore("unused", {
      projectRootOverride: root,
      folderOrder: [],
      resourceOrder: [
        { id: bad, orderIndex: 0, folderId: null },
        { id: good, orderIndex: 1, folderId: null },
      ],
    });
    expect((await readSidecar(root, good))?.["orderIndex"]).toBe(1);
  });
});

describe("nullifyResourceRefs on the sink", () => {
  it("keeps a concurrent change and returns the same cleared entries", async () => {
    const root = await makeRoot();
    const deletedId = generateUUID();
    const other = generateUUID();
    await writeSidecar(root, other, {
      name: "Scene",
      userMetadata: { pov: { id: deletedId, name: "Alice" } },
    });
    const held = await holdSidecar(root, other, 300);
    const cleared = await nullifyResourceRefs(root, deletedId, "Alice", [
      "pov",
    ]);
    await held.done;
    expect(cleared).toEqual([
      {
        referencingResourceId: other,
        fieldKey: "pov",
        priorValue: { id: deletedId, name: "Alice" },
      },
    ]);
    const stored = await readSidecar(root, other);
    expect(stored?.["heldField"]).toBe(true);
    expect(stored?.["userMetadata"]).toEqual({
      pov: { id: null, name: "Alice" },
    });
  });
});

describe("relinkResourceRefs (through restoreResource) on the sink", () => {
  it("keeps a racing change in 20 repetitions and reports the same restored list", async () => {
    for (let i = 0; i < 20; i++) {
      const f = await makeRefFixture("gw-sidecar-sink-20-relink-", {
        schema: "schema-edited",
      });
      dirs.push(f.projectsDir);
      const original = process.env.GETWRITE_PROJECTS_DIR;
      process.env.GETWRITE_PROJECTS_DIR = f.projectsDir;
      try {
        await deleteResourceCore(f.projectId, f.targetId);
      } finally {
        process.env.GETWRITE_PROJECTS_DIR = original;
      }
      const [result] = await Promise.all([
        restoreResource(f.root, f.targetId),
        mutateSidecar(f.root, f.otherId, (cur) => ({
          ...(cur ?? {}),
          raced: i,
        })),
      ]);
      expect(result.referencesRestored, `repetition ${i}`).toEqual([
        { referencingResourceId: f.otherId, fieldKey: "pov" },
      ]);
      const stored = await readSidecar(f.root, f.otherId);
      expect(stored?.["raced"], `repetition ${i}`).toBe(i);
      expect(
        (stored?.["userMetadata"] as Record<string, unknown>)["pov"],
      ).toEqual({ id: f.targetId, name: "Mara" });
    }
  });
});

describe("applyDocumentMetadata on the sink", () => {
  it("keeps a concurrent change and returns the same result object", async () => {
    const root = await makeRoot();
    const id = generateUUID();
    await writeSidecar(root, id, { name: "Doc", userMetadata: { tag: "x" } });
    const held = await holdSidecar(root, id, 300);
    const result = await applyDocumentMetadata(root, id, { synopsis: "Short" });
    await held.done;
    expect(result.hasSynopsis).toBe(true);
    expect(result.hasNotes).toBe(false);
    const stored = await readSidecar(root, id);
    expect(stored?.["heldField"]).toBe(true);
    expect(stored?.["userMetadata"]).toEqual({ tag: "x", synopsis: "Short" });
    expect(result.sidecar).toEqual({
      name: "Doc",
      heldField: true,
      userMetadata: { tag: "x", synopsis: "Short" },
    });
  });
});
