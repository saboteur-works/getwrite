import { describe, it, expect, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  softDeleteResource,
  softDeleteFolder,
  purgeResource,
  purgeFolder,
  purgeResourceSteps,
  PurgeSweepError,
} from "../../src/lib/models/trash";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import {
  createTextResource,
  createFolderResource,
} from "../../src/lib/models/resource-factory";
import { indexResource, search } from "../../src/lib/models/inverted-index";
import {
  loadBacklinks,
  persistBacklinks,
} from "../../src/lib/models/backlinks";
import {
  loadMentionIndex,
  persistMentionIndex,
} from "../../src/lib/models/mention-index";
import {
  createEntityRelationship,
  loadEntityRelationships,
} from "../../src/lib/models/entity-relationships";
import { writeRevision, revisionsBaseDir } from "../../src/lib/models/revision";
import { removeDirRetry } from "../unit/helpers/fs-utils";

async function makeProjectRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "gw-trash-purge-sweep-"));
}

async function writeProjectConfig(
  projectRoot: string,
  relationshipTypes: string[],
): Promise<void> {
  await fs.writeFile(
    path.join(projectRoot, "project.json"),
    JSON.stringify({ config: { relationshipTypes } }, null, 2),
    "utf8",
  );
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function trashedSidecarPath(
  projectRoot: string,
  resourceId: string,
): Promise<string> {
  return path.join(
    projectRoot,
    ".trash",
    "meta",
    `resource-${resourceId}.meta.json`,
  );
}

async function trashedResourceFiles(
  projectRoot: string,
  resourceId: string,
): Promise<string[]> {
  const dir = path.join(projectRoot, ".trash", "resources");
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((e) => e.startsWith(`${resourceId}-`));
  } catch {
    return [];
  }
}

const OTHER_ENTITY_ID = "99999999-9999-4999-8999-999999999999";

describe("purgeResource (Task 10, FR-6/FR-7/FR-10/FR-18)", () => {
  it("runs all five steps and leaves no trace of the resource anywhere", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      await writeProjectConfig(projectRoot, ["ally of"]);

      const resource = createTextResource({
        name: "Doomed Resource",
        plainText: "a lonely dragon roams",
      });
      await writeResourceToFile(projectRoot, resource);
      await indexResource(projectRoot, resource);
      await persistBacklinks(projectRoot, {
        [resource.id]: [OTHER_ENTITY_ID],
        [OTHER_ENTITY_ID]: [resource.id],
      });
      await persistMentionIndex(projectRoot, {
        [resource.id]: [
          {
            entityId: OTHER_ENTITY_ID,
            resourceId: resource.id,
            count: 1,
            offsets: [0],
          },
        ],
      });
      await createEntityRelationship(
        projectRoot,
        resource.id,
        OTHER_ENTITY_ID,
        "ally of",
      );
      await writeRevision(projectRoot, resource.id, 1, "a lonely dragon roams");

      await softDeleteResource(projectRoot, resource.id);

      await purgeResource(projectRoot, resource.id);

      // No trashed content files.
      expect(await trashedResourceFiles(projectRoot, resource.id)).toEqual([]);

      // No sidecar.
      expect(
        await pathExists(await trashedSidecarPath(projectRoot, resource.id)),
      ).toBe(false);

      // No revisions, neither current-layout trash path nor legacy remnant.
      expect(
        await pathExists(
          path.join(projectRoot, ".trash", "revisions", resource.id),
        ),
      ).toBe(false);
      expect(await pathExists(revisionsBaseDir(projectRoot, resource.id))).toBe(
        false,
      );

      // No inverted-index/backlinks/mention-index entry.
      const searchResults = await search(projectRoot, "dragon");
      expect(searchResults).not.toContain(resource.id);
      const backlinks = await loadBacklinks(projectRoot);
      expect(backlinks[resource.id]).toBeUndefined();
      const mentions = await loadMentionIndex(projectRoot);
      expect(mentions[resource.id]).toBeUndefined();

      // No relationship edge naming the resource.
      const edges = await loadEntityRelationships(projectRoot);
      expect(
        edges.some(
          (e) =>
            e.sourceEntityId === resource.id ||
            e.targetEntityId === resource.id,
        ),
      ).toBe(false);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("stops on a mid-sweep failure, persists steps 1-2's effects, and completes only the remaining steps on retry", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      await writeProjectConfig(projectRoot, ["ally of"]);

      const resource = createTextResource({
        name: "Half-Purged Resource",
        plainText: "a second dragon sleeps",
      });
      await writeResourceToFile(projectRoot, resource);
      await indexResource(projectRoot, resource);
      await persistBacklinks(projectRoot, {
        [resource.id]: [OTHER_ENTITY_ID],
        [OTHER_ENTITY_ID]: [resource.id],
      });
      await createEntityRelationship(
        projectRoot,
        resource.id,
        OTHER_ENTITY_ID,
        "ally of",
      );
      await writeRevision(
        projectRoot,
        resource.id,
        1,
        "a second dragon sleeps",
      );

      await softDeleteResource(projectRoot, resource.id);

      const indexSpy = vi.spyOn(purgeResourceSteps, "removeIndexEntries");
      const relationshipsSpy = vi.spyOn(
        purgeResourceSteps,
        "removeRelationships",
      );
      const revisionsSpy = vi
        .spyOn(purgeResourceSteps, "purgeRevisions")
        .mockRejectedValueOnce(new Error("simulated mid-sweep failure"));

      await expect(purgeResource(projectRoot, resource.id)).rejects.toThrow(
        PurgeSweepError,
      );

      // Steps 1-2 already ran once, ahead of the induced step-3 failure.
      expect(indexSpy).toHaveBeenCalledTimes(1);
      expect(relationshipsSpy).toHaveBeenCalledTimes(1);
      expect(revisionsSpy).toHaveBeenCalledTimes(1);

      // Confirm steps 1-2's persisted effects directly:
      const searchResults = await search(projectRoot, "dragon");
      expect(searchResults).not.toContain(resource.id);
      const backlinks = await loadBacklinks(projectRoot);
      expect(backlinks[resource.id]).toBeUndefined();
      const edges = await loadEntityRelationships(projectRoot);
      expect(
        edges.some(
          (e) =>
            e.sourceEntityId === resource.id ||
            e.targetEntityId === resource.id,
        ),
      ).toBe(false);

      // Item is still in Trash: sidecar and content files remain, revisions
      // (the step that failed) remain untouched.
      expect(
        await pathExists(await trashedSidecarPath(projectRoot, resource.id)),
      ).toBe(true);
      expect(
        (await trashedResourceFiles(projectRoot, resource.id)).length,
      ).toBeGreaterThan(0);
      expect(
        await pathExists(
          path.join(projectRoot, ".trash", "revisions", resource.id),
        ),
      ).toBe(true);

      // Retry: purgeResource re-runs steps 1-2 (idempotently, not skipped)
      // and completes the remaining steps.
      const callsBeforeRetry = indexSpy.mock.calls.length;
      const relationshipCallsBeforeRetry = relationshipsSpy.mock.calls.length;

      await expect(
        purgeResource(projectRoot, resource.id),
      ).resolves.not.toThrow();

      expect(indexSpy.mock.calls.length).toBeGreaterThan(callsBeforeRetry);
      expect(relationshipsSpy.mock.calls.length).toBeGreaterThan(
        relationshipCallsBeforeRetry,
      );

      expect(await trashedResourceFiles(projectRoot, resource.id)).toEqual([]);
      expect(
        await pathExists(await trashedSidecarPath(projectRoot, resource.id)),
      ).toBe(false);
      expect(
        await pathExists(
          path.join(projectRoot, ".trash", "revisions", resource.id),
        ),
      ).toBe(false);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });
});

describe("purgeFolder (Task 10, FR-6/FR-7/FR-10/FR-18)", () => {
  it("purges every manifest resource then removes the manifest and folder descriptor", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const folder = createFolderResource({ name: "Doomed Folder" });
      await writeResourceToFile(projectRoot, folder);

      const resource = createTextResource({
        name: "Nested Resource",
        folderId: folder.id,
        plainText: "a nested dragon hides",
      });
      await writeResourceToFile(projectRoot, resource);
      await indexResource(projectRoot, resource);

      await softDeleteFolder(projectRoot, folder.id);

      await purgeFolder(projectRoot, folder.id);

      expect(
        await pathExists(
          path.join(projectRoot, ".trash", "meta", `folder-${folder.id}.json`),
        ),
      ).toBe(false);
      expect(
        await pathExists(
          path.join(projectRoot, ".trash", "folders", folder.slug),
        ),
      ).toBe(false);
      expect(await trashedResourceFiles(projectRoot, resource.id)).toEqual([]);
      expect(
        await pathExists(await trashedSidecarPath(projectRoot, resource.id)),
      ).toBe(false);
      const searchResults = await search(projectRoot, "dragon");
      expect(searchResults).not.toContain(resource.id);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("stops on a mid-sweep failure inside a nested resource and completes on retry", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const folder = createFolderResource({ name: "Half-Purged Folder" });
      await writeResourceToFile(projectRoot, folder);

      const resource = createTextResource({
        name: "Nested Resource",
        folderId: folder.id,
        plainText: "a stubborn dragon lingers",
      });
      await writeResourceToFile(projectRoot, resource);
      await indexResource(projectRoot, resource);

      await softDeleteFolder(projectRoot, folder.id);

      const contentSpy = vi
        .spyOn(purgeResourceSteps, "purgeContentFiles")
        .mockRejectedValueOnce(new Error("simulated nested failure"));

      await expect(purgeFolder(projectRoot, folder.id)).rejects.toThrow(
        PurgeSweepError,
      );

      // Manifest and folder descriptor are untouched — the sweep never got
      // past the failing nested resource.
      expect(
        await pathExists(
          path.join(projectRoot, ".trash", "meta", `folder-${folder.id}.json`),
        ),
      ).toBe(true);
      expect(
        await pathExists(
          path.join(projectRoot, ".trash", "folders", folder.slug),
        ),
      ).toBe(true);

      expect(contentSpy).toHaveBeenCalled();

      await expect(purgeFolder(projectRoot, folder.id)).resolves.not.toThrow();

      expect(
        await pathExists(
          path.join(projectRoot, ".trash", "meta", `folder-${folder.id}.json`),
        ),
      ).toBe(false);
      expect(
        await pathExists(
          path.join(projectRoot, ".trash", "folders", folder.slug),
        ),
      ).toBe(false);
      expect(await trashedResourceFiles(projectRoot, resource.id)).toEqual([]);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });
});
