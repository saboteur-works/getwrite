import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  softDeleteResource,
  restoreResource,
  nullifyResourceRefs,
  writeTrashRefRecord,
  type RestoredReferenceInfo,
} from "../../src/lib/models/trash";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import {
  createTextResource,
  createFolderResource,
} from "../../src/lib/models/resource-factory";
import { search } from "../../src/lib/models/inverted-index";
import { loadBacklinks } from "../../src/lib/models/backlinks";
import { loadMentionIndex } from "../../src/lib/models/mention-index";
import type { MetadataValue } from "../../src/lib/models/types";
import { removeDirRetry } from "../unit/helpers/fs-utils";

async function makeProjectRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "gw-trash-restore-"));
}

/** Directly patches a resource's persisted sidecar with extra fields (e.g.
 * `entityKind`), bypassing `writeSidecar`'s own fire-and-forget background
 * indexing so test setup stays deterministic. */
async function patchSidecarDirect(
  projectRoot: string,
  resourceId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const sidecarPath = path.join(
    projectRoot,
    "meta",
    `resource-${resourceId}.meta.json`,
  );
  const raw = JSON.parse(await fs.readFile(sidecarPath, "utf8")) as Record<
    string,
    unknown
  >;
  await fs.writeFile(
    sidecarPath,
    JSON.stringify({ ...raw, ...patch }, null, 2),
    "utf8",
  );
}

describe("restoreResource (Task 8, FR-5/FR-9/FR-16/FR-22)", () => {
  it("falls back to the project root when the original parent folder no longer exists", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const folder = createFolderResource({ name: "Chapter One" });
      await writeResourceToFile(projectRoot, folder);

      const resource = createTextResource({
        name: "Scene A",
        folderId: folder.id,
        plainText: "Some prose.",
      });
      await writeResourceToFile(projectRoot, resource);

      // Remove the folder directly (simulating it no longer existing)
      // without going through the folder cascade, which would also trash
      // this resource.
      await fs.rm(path.join(projectRoot, "folders", folder.slug), {
        recursive: true,
        force: true,
      });

      await softDeleteResource(projectRoot, resource.id);
      const result = await restoreResource(projectRoot, resource.id);

      expect(result.relocated).toBe(true);
      const sidecar = await readSidecar(projectRoot, resource.id);
      expect(sidecar?.["folderId"]).toBeNull();
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("does not relocate when the original parent folder still exists", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const folder = createFolderResource({ name: "Chapter One" });
      await writeResourceToFile(projectRoot, folder);

      const resource = createTextResource({
        name: "Scene A",
        folderId: folder.id,
        plainText: "Some prose.",
      });
      await writeResourceToFile(projectRoot, resource);

      await softDeleteResource(projectRoot, resource.id);
      const result = await restoreResource(projectRoot, resource.id);

      expect(result.relocated).toBe(false);
      const sidecar = await readSidecar(projectRoot, resource.id);
      expect(sidecar?.["folderId"]).toBe(folder.id);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("applies the resolved OQ-2 suffix rule on a name collision, chaining across repeated restores", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const kept = createTextResource({ name: "Draft", plainText: "kept" });
      await writeResourceToFile(projectRoot, kept);

      const trashed1 = createTextResource({
        name: "Draft",
        plainText: "first",
      });
      await writeResourceToFile(projectRoot, trashed1);
      await softDeleteResource(projectRoot, trashed1.id);

      const result1 = await restoreResource(projectRoot, trashed1.id);
      expect(result1.renamed).toBe(true);
      expect(result1.restoredName).toBe("Draft (restored)");

      const trashed2 = createTextResource({
        name: "Draft",
        plainText: "second",
      });
      await writeResourceToFile(projectRoot, trashed2);
      await softDeleteResource(projectRoot, trashed2.id);

      const result2 = await restoreResource(projectRoot, trashed2.id);
      expect(result2.renamed).toBe(true);
      expect(result2.restoredName).toBe("Draft (restored 2)");
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("re-links a reference still in its cleared state, but leaves and reports one that changed since deletion", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const target = createTextResource({ name: "Alice", plainText: "" });
      await writeResourceToFile(projectRoot, target);

      const referencingA = createTextResource({
        name: "Referencing A",
        plainText: "",
        userMetadata: { pov: { id: target.id, name: "Alice" } },
      });
      await writeResourceToFile(projectRoot, referencingA);

      const referencingB = createTextResource({
        name: "Referencing B",
        plainText: "",
        userMetadata: {
          characters: [
            { id: "carol-id", name: "Carol" },
            { id: target.id, name: "Alice" },
          ],
        },
      });
      await writeResourceToFile(projectRoot, referencingB);

      const entries = await nullifyResourceRefs(
        projectRoot,
        target.id,
        "Alice",
        ["pov", "characters"],
      );
      await writeTrashRefRecord(projectRoot, target.id, entries);

      // Simulate referencingA's field having been repointed to a different
      // resource since the delete, rather than staying in its cleared state.
      const sidecarA = await readSidecar(projectRoot, referencingA.id);
      expect(sidecarA).not.toBeNull();
      const metaA = { ...(sidecarA as Record<string, unknown>) };
      metaA["userMetadata"] = {
        ...(metaA["userMetadata"] as Record<string, unknown>),
        pov: { id: "some-other-id", name: "Bob" },
      };
      await writeSidecar(
        projectRoot,
        referencingA.id,
        metaA as Record<string, MetadataValue>,
      );

      await softDeleteResource(projectRoot, target.id);
      const result = await restoreResource(projectRoot, target.id);

      expect(result.referencesRestored).toHaveLength(1);
      expect(result.referencesRestored[0]).toEqual({
        referencingResourceId: referencingB.id,
        fieldKey: "characters",
        arrayIndex: 1,
      });

      expect(result.referencesNotRestored).not.toBe("no-record");
      const notRestored =
        result.referencesNotRestored as RestoredReferenceInfo[];
      expect(notRestored).toHaveLength(1);
      expect(notRestored[0]).toEqual({
        referencingResourceId: referencingA.id,
        fieldKey: "pov",
      });

      // referencingB's cleared entry was re-linked.
      const updatedB = await readSidecar(projectRoot, referencingB.id);
      const charactersB = (
        updatedB?.["userMetadata"] as Record<string, unknown>
      )?.["characters"] as Array<{ id: string | null; name: string }>;
      expect(charactersB[1]).toEqual({ id: target.id, name: "Alice" });

      // referencingA's changed entry was left untouched, not overwritten.
      const updatedA = await readSidecar(projectRoot, referencingA.id);
      const povA = (updatedA?.["userMetadata"] as Record<string, unknown>)?.[
        "pov"
      ];
      expect(povA).toEqual({ id: "some-other-id", name: "Bob" });
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("reports 'no-record' and performs no re-linking for a legacy item with no ref record", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const resource = createTextResource({
        name: "Legacy Item",
        plainText: "",
      });
      await writeResourceToFile(projectRoot, resource);

      // Soft-delete directly, skipping nullifyResourceRefs/writeTrashRefRecord
      // — simulating a resource trashed before FR-8 existed.
      await softDeleteResource(projectRoot, resource.id);

      const result = await restoreResource(projectRoot, resource.id);

      expect(result.referencesNotRestored).toBe("no-record");
      expect(result.referencesRestored).toEqual([]);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("re-indexes the restored resource into the inverted index, backlinks, and mention index (FR-16)", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      // A declared entity named "Zephyr" for the mention index to match
      // against.
      const entity = createTextResource({ name: "Zephyr", plainText: "" });
      await writeResourceToFile(projectRoot, entity);
      await patchSidecarDirect(projectRoot, entity.id, {
        entityKind: "character",
      });

      const resource = createTextResource({
        name: "Scene",
        plainText: "Zephyr walked into the room.",
      });
      await writeResourceToFile(projectRoot, resource);

      await softDeleteResource(projectRoot, resource.id);
      await restoreResource(projectRoot, resource.id);

      const hits = await search(projectRoot, "zephyr");
      expect(hits).toContain(resource.id);

      const backlinks = await loadBacklinks(projectRoot);
      expect(backlinks).toHaveProperty(resource.id);

      const mentions = await loadMentionIndex(projectRoot);
      expect(mentions[resource.id]).toBeDefined();
      expect(mentions[resource.id]?.[0]?.entityId).toBe(entity.id);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });
});
