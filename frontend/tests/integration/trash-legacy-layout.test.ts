/**
 * FR-22/FR-23 legacy-layout coverage (Task 20), consolidated into a single
 * suite per FR-23's "in the same suite" requirement (`specs/features/trash-ui.md`,
 * resolved OQ-12).
 *
 * "Legacy" here means content soft-deleted before this feature existed: no
 * FR-8 ref record, revisions left at their original (non-`.trash/`) path, and
 * — for a folder — no FR-20 manifest. This suite exercises the
 * list/restore/purge behavior against those fixtures end-to-end, rather than
 * duplicating the unit-level legacy assertions already covered elsewhere:
 *
 * - `tests/integration/trash-restore.test.ts` ("reports 'no-record' and
 *   performs no re-linking for a legacy item with no ref record") already
 *   covers `restoreResource`'s ref-record-less re-linking behavior in
 *   isolation (Task 8, FR-9).
 * - `tests/unit/trash-purge-primitives.test.ts` ("falls back to the legacy
 *   revisions/<resourceId>/ path...") already covers `purgeTrashedRevisions`'s
 *   legacy-path fallback in isolation (Task 7, FR-6/FR-18 step 3).
 * - `tests/integration/trash-routes.test.ts` ("returns trashed resources and
 *   top-level trashed folders, including a legacy item with no ref
 *   record/manifest") already covers `GET .../trash`'s tolerance of a bare
 *   legacy sidecar at the route layer (Task 11, FR-1/FR-11).
 *
 * What is new here: a single resource fixture exercised through the full
 * list -> restore -> purge lifecycle (Tasks 4/7/8/10 composed together, not
 * just each primitive individually), and the legacy-folder (no manifest)
 * case, which no earlier task's own test suite covers at all.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  softDeleteResource,
  restoreResource,
  purgeResource,
  softDeleteFolder,
  restoreFolder,
  purgeFolder,
  listTrashedItems,
  resolveTrashedItemKind,
} from "../../src/lib/models/trash";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import {
  createTextResource,
  createFolderResource,
} from "../../src/lib/models/resource-factory";
import { writeRevision, revisionsBaseDir } from "../../src/lib/models/revision";
import { readSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "../unit/helpers/fs-utils";

async function makeProjectRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "gw-trash-legacy-"));
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

describe("legacy-layout resource: listable, restorable, purgeable (FR-22, resolved OQ-12)", () => {
  it("lists a legacy resource with no ref record and revisions still at their original path", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const resource = createTextResource({
        name: "Legacy Draft",
        plainText: "legacy content",
      });
      await writeResourceToFile(projectRoot, resource);

      // Soft-delete directly, skipping nullifyResourceRefs/writeTrashRefRecord
      // (no ref record — legacy). No revisions exist yet, so
      // softDeleteResource has nothing revision-related to move.
      await softDeleteResource(projectRoot, resource.id);

      // Write a revision *after* the soft delete, directly at the legacy,
      // non-trash path — simulating a resource whose revisions were never
      // moved into `.trash/` at all, because it predates Task 3's move logic.
      await writeRevision(projectRoot, resource.id, 1, "legacy revision body");
      const legacyRevisionsDir = revisionsBaseDir(projectRoot, resource.id);
      expect(await pathExists(legacyRevisionsDir)).toBe(true);

      const { resources } = await listTrashedItems(projectRoot);
      const entry = resources.find((r) => r.id === resource.id);
      expect(entry).toBeDefined();
      expect(entry?.originalName).toBe("Legacy Draft");
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("restores a legacy resource, reporting references couldn't be restored (no ref record), leaving its already-live revisions untouched", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const resource = createTextResource({
        name: "Legacy Draft",
        plainText: "legacy content",
      });
      await writeResourceToFile(projectRoot, resource);

      await softDeleteResource(projectRoot, resource.id);
      await writeRevision(projectRoot, resource.id, 1, "legacy revision body");
      const legacyRevisionsDir = revisionsBaseDir(projectRoot, resource.id);

      const result = await restoreResource(projectRoot, resource.id);

      // FR-9/FR-22: no ref record at all means no re-linking is attempted,
      // and the caller (UI, Task 18) is told references couldn't be restored.
      expect(result.referencesNotRestored).toBe("no-record");
      expect(result.referencesRestored).toEqual([]);

      const sidecar = await readSidecar(projectRoot, resource.id);
      expect(sidecar?.["name"]).toBe("Legacy Draft");

      // The revisions were never trashed in the first place (legacy layout),
      // so restore has nothing to move them back from — they simply remain
      // exactly where they always were, at the live path.
      expect(await pathExists(legacyRevisionsDir)).toBe(true);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("purges a legacy resource, removing its revisions from the legacy (non-trash) path", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const resource = createTextResource({
        name: "Legacy Draft To Purge",
        plainText: "legacy content",
      });
      await writeResourceToFile(projectRoot, resource);

      await softDeleteResource(projectRoot, resource.id);
      await writeRevision(projectRoot, resource.id, 1, "legacy revision body");
      const legacyRevisionsDir = revisionsBaseDir(projectRoot, resource.id);
      expect(await pathExists(legacyRevisionsDir)).toBe(true);

      await purgeResource(projectRoot, resource.id);

      // FR-6/FR-18 step 3, resolved OQ-12: the legacy-path revisions are
      // removed even though they were never under `.trash/revisions/`.
      expect(await pathExists(legacyRevisionsDir)).toBe(false);

      const trashedSidecarPath = path.join(
        projectRoot,
        ".trash",
        "meta",
        `resource-${resource.id}.meta.json`,
      );
      expect(await pathExists(trashedSidecarPath)).toBe(false);
    } finally {
      await removeDirRetry(projectRoot);
    }
  });
});

describe("legacy-layout folder: no manifest — cannot restore/purge as a unit (FR-22/FR-23, resolved OQ-12)", () => {
  /**
   * Per Task 6's own evidence, no code before this feature ever moved a
   * folder descriptor into `.trash/folders/` at all — folder removal was
   * purely a client-side Redux filter with no on-disk effect. A "legacy
   * trashed folder" is therefore simulated directly, by moving a folder's
   * descriptor into `.trash/folders/<slug>/folder.json` without going
   * through `softDeleteFolder` — so no Task 6 manifest is ever written. This
   * is exactly the shape `resolveTrashedItemKind`'s third check (a trashed
   * folder descriptor with no manifest) documents itself as covering.
   */
  async function makeLegacyTrashedFolder(projectRoot: string) {
    const folder = createFolderResource({ name: "Legacy Folder" });
    await writeResourceToFile(projectRoot, folder);

    const liveDir = path.join(projectRoot, "folders", folder.slug);
    const trashedDir = path.join(projectRoot, ".trash", "folders", folder.slug);
    await fs.mkdir(path.dirname(trashedDir), { recursive: true });
    await fs.rename(liveDir, trashedDir);

    return { folder, trashedDir };
  }

  it("is still listed, with an empty descendants array, when no manifest exists", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const { folder } = await makeLegacyTrashedFolder(projectRoot);

      const { folders } = await listTrashedItems(projectRoot);
      const entry = folders.find((f) => f.id === folder.id);
      expect(entry).toBeDefined();
      expect(entry?.originalName).toBe("Legacy Folder");
      expect(entry?.descendants).toEqual([]);

      expect(await resolveTrashedItemKind(projectRoot, folder.id)).toBe(
        "folder",
      );
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("refuses to restore as a unit, throwing a clear, non-crashing error rather than a partial/fabricated restore", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const { folder } = await makeLegacyTrashedFolder(projectRoot);

      // restoreFolder rebuilds the tree exclusively from the Task 6 manifest
      // (FR-20). With no manifest at all, there is no recorded structure to
      // rebuild, so it throws a named, descriptive error identifying exactly
      // which folder couldn't be restored — a controlled refusal, not a
      // crash, and not a restore that silently drops the folder's original
      // descendants.
      await expect(restoreFolder(projectRoot, folder.id)).rejects.toThrow(
        /No trash manifest found for folder/,
      );

      // The refusal leaves the item exactly as it was — still trashed, still
      // listable — rather than half-restoring it.
      expect(await resolveTrashedItemKind(projectRoot, folder.id)).toBe(
        "folder",
      );
    } finally {
      await removeDirRetry(projectRoot);
    }
  });

  it("purges the folder's own trashed descriptor as a complete unit when no manifest — and therefore no recorded descendants — ever existed", async () => {
    const projectRoot = await makeProjectRoot();
    try {
      const { folder, trashedDir } = await makeLegacyTrashedFolder(projectRoot);

      // Unlike restore, purge does not need to know the folder's original
      // structure to remove it — and since no manifest ever existed for this
      // legacy item, there is, by construction, no other trashed content
      // (no descendant resource/folder) associated with it left behind.
      // Purging the descriptor is therefore a complete purge of everything
      // this legacy item's presence in Trash could ever represent, not a
      // silent partial success masking dropped data.
      await expect(purgeFolder(projectRoot, folder.id)).resolves.not.toThrow();

      expect(await pathExists(trashedDir)).toBe(false);
      expect(await resolveTrashedItemKind(projectRoot, folder.id)).toBe(
        "unknown",
      );
    } finally {
      await removeDirRetry(projectRoot);
    }
  });
});
