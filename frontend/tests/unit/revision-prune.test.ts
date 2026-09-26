import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import { generateUUID } from "../../src/lib/models/uuid";
import path from "node:path";
import {
  writeRevision,
  listRevisions,
  pruneRevisions,
  revisionsBaseDir,
  selectPruneCandidates,
} from "../../src/lib/models/revision";
import { writeFile as ioWriteFile } from "../../src/lib/models/io";

describe("revision pruning algorithm (T014a)", () => {
  beforeEach(() => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
  });

  it("selects oldest non-canonical revisions", () => {
    const revs = [
      { versionNumber: 1, isCanonical: false },
      { versionNumber: 2, isCanonical: false },
      { versionNumber: 3, isCanonical: true },
    ] as any;
    const candidates = selectPruneCandidates(revs, 2);
    expect(candidates.map((r) => r.versionNumber)).toEqual([1]);
  });

  it("skips preserved revisions when selecting candidates", async () => {
    const projectRoot = "/proj-" + generateUUID();
    const resourceId = generateUUID();

    // create three revisions; we'll mark v2 as preserved
    await writeRevision(projectRoot, resourceId, 1, "one");
    await writeRevision(projectRoot, resourceId, 2, "two");
    await writeRevision(projectRoot, resourceId, 3, "three", {
      isCanonical: true,
    });

    // inject metadata.preserve = true into v-2 metadata.json
    const base = revisionsBaseDir(projectRoot, resourceId);
    const metaPath = path.posix.join(base, "v-2", "metadata.json");
    const raw = await (
      await import("../../src/lib/models/io")
    ).readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    parsed.metadata = { preserve: true };
    await ioWriteFile(metaPath, JSON.stringify(parsed, null, 2), "utf8");

    const all = await listRevisions(projectRoot, resourceId);
    const candidates = selectPruneCandidates(all, 1);
    // total 3 -> need to remove 2; but v2 is preserved and v3 is canonical, so only v1 is removable
    expect(candidates.map((r) => r.versionNumber)).toEqual([1]);
  });

  /** Marks the given version as protected via its on-disk metadata. */
  async function protectRevision(
    projectRoot: string,
    resourceId: string,
    version: number,
  ): Promise<void> {
    const base = revisionsBaseDir(projectRoot, resourceId);
    const metaPath = path.posix.join(base, `v-${version}`, "metadata.json");
    const raw = await (
      await import("../../src/lib/models/io")
    ).readFile(metaPath, "utf8");
    const parsed = JSON.parse(raw);
    parsed.metadata = { preserve: true };
    await ioWriteFile(metaPath, JSON.stringify(parsed, null, 2), "utf8");
  }

  // FR-7 (authorised deviation): protected non-canonical revisions do not
  // count toward the limit, so a lone unprotected revision is removable.
  it("in headless mode prunes an unprotected revision even when another is protected (FR-7)", async () => {
    const projectRoot = "/proj-" + generateUUID();
    const resourceId = generateUUID();
    await writeRevision(projectRoot, resourceId, 1, "one");
    await writeRevision(projectRoot, resourceId, 2, "two");
    await protectRevision(projectRoot, resourceId, 1);

    const deleted = await pruneRevisions(projectRoot, resourceId, 0, {
      autoPrune: false,
    });
    expect(deleted.map((r) => r.versionNumber)).toEqual([2]);
  });

  it("in headless mode aborts when not enough removable revisions and autoPrune=false", async () => {
    const projectRoot = "/proj-" + generateUUID();
    const resourceId = generateUUID();

    // v1 canonical (counts, never removable), v2 protected non-canonical
    // (excluded): count 1 > max 0 but no candidate exists, so it aborts.
    await writeRevision(projectRoot, resourceId, 1, "one", {
      isCanonical: true,
    });
    await writeRevision(projectRoot, resourceId, 2, "two");
    await protectRevision(projectRoot, resourceId, 2);

    const deleted = await pruneRevisions(projectRoot, resourceId, 0, {
      autoPrune: false,
    });
    expect(deleted.length).toBe(0);
  });
});
