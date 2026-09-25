import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  writeRevision,
  listRevisions,
  pruneRevisions,
  revisionsBaseDir,
} from "../../src/lib/models/revision";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";

describe("models/revision", () => {
  it("writes revisions and prunes oldest non-canonical", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rev-"));
    const resourceId = generateUUID();

    // write 4 revisions, mark v4 as canonical
    await writeRevision(tmp, resourceId, 1, "one");
    await writeRevision(tmp, resourceId, 2, "two");
    await writeRevision(tmp, resourceId, 3, "three");
    await writeRevision(tmp, resourceId, 4, "four", { isCanonical: true });

    const all = await listRevisions(tmp, resourceId);
    expect(all.length).toBe(4);

    // prune to max 2 -> should remove two oldest non-canonical (1 and 2)
    const deleted = await pruneRevisions(tmp, resourceId, 2);
    expect(deleted.map((d) => d.versionNumber)).toEqual([1, 2]);

    // verify directories removed
    const base = revisionsBaseDir(tmp, resourceId);
    const remaining = await fs.readdir(base);
    expect(remaining).toContain("v-3");
    expect(remaining).toContain("v-4");

    await removeDirRetry(tmp);
  });
});

import { describe as d2, it as it2, expect as expect2 } from "vitest";
import { selectPruneCandidates } from "../../src/lib/models/revision";
import type { Revision } from "../../src/lib/models/types";

function makeRev(
  id: string,
  ver: number,
  canonical = false,
  createdAt?: string,
) {
  return {
    id,
    resourceId: "resource-id",
    versionNumber: ver,
    createdAt: createdAt ?? new Date(2020, 0, ver).toISOString(),
    filePath: `/path/${id}.txt`,
    isCanonical: canonical,
  } as const;
}

d2("models/revision.selectPruneCandidates", () => {
  it2("returns empty when within limit", () => {
    const revs = [makeRev("a", 1, true), makeRev("b", 2), makeRev("c", 3)];
    expect2(selectPruneCandidates(revs as any, 3)).toEqual([]);
  });

  it2("selects oldest non-canonical when over limit", () => {
    const revs = [
      makeRev("a", 1, false),
      makeRev("b", 2, false),
      makeRev("c", 3, true),
    ];
    const candidates = selectPruneCandidates(revs as any, 2);
    // total 3 -> need to remove 1; oldest non-canonical is version 1
    expect2(candidates.map((r) => r.versionNumber)).toEqual([1]);
  });

  it2("never returns canonical revisions", () => {
    const revs = [
      makeRev("a", 1, true),
      makeRev("b", 2, true),
      makeRev("c", 3, false),
    ];
    const candidates = selectPruneCandidates(revs as any, 1);
    // Only non-canonical revision 3 is available; total 3 -> need remove 2,
    // but we only return non-canonical ones (just 3)
    expect2(candidates.every((r) => !r.isCanonical)).toBe(true);
    expect2(candidates.map((r) => r.versionNumber)).toEqual([3]);
  });

  it2("returns multiple candidates in ascending order", () => {
    const revs = [
      makeRev("a", 1),
      makeRev("b", 2),
      makeRev("c", 3),
      makeRev("d", 4, true),
    ];
    const candidates = selectPruneCandidates(revs as any, 1);
    // total 4 -> need to remove 3; non-canonical are versions 1,2,3 -> return all three
    expect2(candidates.map((r) => r.versionNumber)).toEqual([1, 2, 3]);
  });

  it2("throws on negative maxRevisions", () => {
    expect2(() => selectPruneCandidates([], -1)).toThrow();
  });
});

function makeProtectedRev(id: string, ver: number, canonical = false) {
  return {
    ...makeRev(id, ver, canonical),
    metadata: { preserve: true },
  } as const;
}

d2("models/revision.selectPruneCandidates protected revisions (FR-7)", () => {
  it2(
    "worked example: max 3, 6 revs, 2 protected, unprotected canonical -> 1 candidate",
    () => {
      const revs = [
        makeProtectedRev("a", 1),
        makeRev("b", 2),
        makeProtectedRev("c", 3),
        makeRev("d", 4),
        makeRev("e", 5),
        makeRev("f", 6, true),
      ];
      const candidates = selectPruneCandidates(revs, 3);
      expect2(candidates.map((r) => r.versionNumber)).toEqual([2]);
    },
  );

  it2("with no protected revisions, 6 revs and max 3 selects 3", () => {
    const revs: Revision[] = [1, 2, 3, 4, 5].map((v) => makeRev(`r${v}`, v));
    revs.push(makeRev("r6", 6, true));
    const candidates = selectPruneCandidates(revs, 3);
    expect2(candidates.map((r) => r.versionNumber)).toEqual([1, 2, 3]);
  });

  it2("never selects a protected revision", () => {
    const revs = [
      makeProtectedRev("a", 1),
      makeProtectedRev("b", 2),
      makeRev("c", 3),
      makeRev("d", 4, true),
    ];
    const candidates = selectPruneCandidates(revs, 1);
    expect2(candidates.map((r) => r.versionNumber)).toEqual([3]);
  });

  it2(
    "protected canonical still counts: max 2, 5 revs -> count 3, 1 candidate",
    () => {
      const revs = [
        makeProtectedRev("a", 1, true),
        makeProtectedRev("b", 2),
        makeProtectedRev("c", 3),
        makeRev("d", 4),
        makeRev("e", 5),
      ];
      const candidates = selectPruneCandidates(revs, 2);
      expect2(candidates.map((r) => r.versionNumber)).toEqual([4]);
    },
  );

  it2(
    "protected canonical still counts: max 3, 6 revs -> count 4, 1 candidate",
    () => {
      const revs = [
        makeProtectedRev("a", 1, true),
        makeProtectedRev("b", 2),
        makeProtectedRev("c", 3),
        makeRev("d", 4),
        makeRev("e", 5),
        makeRev("f", 6),
      ];
      const candidates = selectPruneCandidates(revs, 3);
      expect2(candidates.map((r) => r.versionNumber)).toEqual([4]);
    },
  );
});

import { setCanonicalRevision } from "../../src/lib/models/revision";

describe("models/revision metadata.name persistence", () => {
  it("keeps metadata.name through list and a canonical flip", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rev-name-"));
    const resourceId = generateUUID();

    await writeRevision(tmp, resourceId, 1, "one", {
      metadata: { name: "before the duel" },
    });
    await writeRevision(tmp, resourceId, 2, "two", { isCanonical: true });

    const listed = await listRevisions(tmp, resourceId);
    expect(listed.find((r) => r.versionNumber === 1)?.metadata).toEqual({
      name: "before the duel",
    });

    await setCanonicalRevision(tmp, resourceId, 1);
    const afterFlip = await listRevisions(tmp, resourceId);
    expect(afterFlip.find((r) => r.versionNumber === 1)?.metadata).toEqual({
      name: "before the duel",
    });

    await removeDirRetry(tmp);
  });

  it("prunes a named revision unless metadata.preserve is set", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rev-name-"));
    const resourceId = generateUUID();

    await writeRevision(tmp, resourceId, 1, "one", {
      metadata: { name: "named only" },
    });
    await writeRevision(tmp, resourceId, 2, "two", {
      metadata: { name: "named and preserved", preserve: true },
    });
    await writeRevision(tmp, resourceId, 3, "three", { isCanonical: true });

    const deleted = await pruneRevisions(tmp, resourceId, 1);
    expect(deleted.map((d) => d.versionNumber)).toEqual([1]);

    await removeDirRetry(tmp);
  });
});

describe("models/revision.pruneRevisions autoPrune:false with protected revisions", () => {
  it("deletes nothing when unprotected candidates cannot meet the count, and prunes when they can", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rev-prot-"));
    const resourceId = generateUUID();
    await writeRevision(tmp, resourceId, 1, "one", {
      metadata: { preserve: true },
    });
    await writeRevision(tmp, resourceId, 2, "two", {
      metadata: { preserve: true },
    });
    await writeRevision(tmp, resourceId, 3, "three");
    await writeRevision(tmp, resourceId, 4, "four", { isCanonical: true });

    // count = 4 - 2 protected non-canonical = 2; max 2 -> nothing required.
    expect(
      await pruneRevisions(tmp, resourceId, 2, { autoPrune: false }),
    ).toEqual([]);
    expect((await listRevisions(tmp, resourceId)).length).toBe(4);

    // max 1 -> required 1, candidate v3 available -> prunes it.
    const deleted = await pruneRevisions(tmp, resourceId, 1, {
      autoPrune: false,
    });
    expect(deleted.map((r) => r.versionNumber)).toEqual([3]);
    expect((await listRevisions(tmp, resourceId)).length).toBe(3);

    // max 0 -> required 2 but no candidates remain -> aborts, nothing deleted.
    expect(
      await pruneRevisions(tmp, resourceId, 0, { autoPrune: false }),
    ).toEqual([]);
    expect((await listRevisions(tmp, resourceId)).length).toBe(3);

    await removeDirRetry(tmp);
  });
});

import { setRevisionPreserve } from "../../src/lib/models/revision-core";

describe("revision-core.setRevisionPreserve", () => {
  async function fixture() {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rev-pres-"));
    const resourceId = generateUUID();
    await writeRevision(tmp, resourceId, 1, "one", {
      metadata: { name: "before the duel", note: { a: 1 } },
    });
    await writeRevision(tmp, resourceId, 2, "two", { isCanonical: true });
    const revs = await listRevisions(tmp, resourceId);
    return {
      tmp,
      resourceId,
      nonCanonical: revs.find((r) => r.versionNumber === 1)!,
      canonical: revs.find((r) => r.versionNumber === 2)!,
    };
  }

  async function readMetaOnDisk(
    tmp: string,
    resourceId: string,
    version: number,
  ): Promise<{ metadata?: Record<string, unknown>; isCanonical: boolean }> {
    return JSON.parse(
      await fs.readFile(
        path.join(
          revisionsBaseDir(tmp, resourceId),
          `v-${version}`,
          "metadata.json",
        ),
        "utf8",
      ),
    );
  }

  it("protects a non-canonical revision, keeping name and other keys", async () => {
    const { tmp, resourceId, nonCanonical } = await fixture();
    const updated = await setRevisionPreserve(
      tmp,
      resourceId,
      nonCanonical.id,
      true,
    );
    expect(updated.metadata).toEqual({
      name: "before the duel",
      note: { a: 1 },
      preserve: true,
    });
    expect(updated.isCanonical).toBe(false);
    const onDisk = await readMetaOnDisk(tmp, resourceId, 1);
    expect(onDisk.metadata).toEqual({
      name: "before the duel",
      note: { a: 1 },
      preserve: true,
    });
    await removeDirRetry(tmp);
  });

  it("clearing makes the revision a prune candidate again", async () => {
    const { tmp, resourceId, nonCanonical } = await fixture();
    await setRevisionPreserve(tmp, resourceId, nonCanonical.id, true);
    let revs = await listRevisions(tmp, resourceId);
    expect(selectPruneCandidates(revs, 1)).toEqual([]);

    const cleared = await setRevisionPreserve(
      tmp,
      resourceId,
      nonCanonical.id,
      false,
    );
    expect(cleared.metadata?.preserve).toBeFalsy();
    expect(cleared.metadata?.name).toBe("before the duel");
    revs = await listRevisions(tmp, resourceId);
    expect(selectPruneCandidates(revs, 1).map((r) => r.versionNumber)).toEqual([
      1,
    ]);
    const onDisk = await readMetaOnDisk(tmp, resourceId, 1);
    expect(onDisk.metadata?.preserve).toBeFalsy();
    expect(onDisk.metadata?.name).toBe("before the duel");
    await removeDirRetry(tmp);
  });

  it("works on the canonical revision without changing isCanonical", async () => {
    const { tmp, resourceId, canonical } = await fixture();
    const updated = await setRevisionPreserve(
      tmp,
      resourceId,
      canonical.id,
      true,
    );
    expect(updated.isCanonical).toBe(true);
    expect(updated.metadata?.preserve).toBe(true);
    expect((await readMetaOnDisk(tmp, resourceId, 2)).isCanonical).toBe(true);
    expect((await readMetaOnDisk(tmp, resourceId, 1)).isCanonical).toBe(false);
    await removeDirRetry(tmp);
  });

  it("throws for an unknown revision id", async () => {
    const { tmp, resourceId } = await fixture();
    await expect(
      setRevisionPreserve(tmp, resourceId, "nope", true),
    ).rejects.toThrow("Revision nope not found.");
    await removeDirRetry(tmp);
  });
});

import {
  deleteRevision,
  PROTECTED_REVISION_DELETE_MESSAGE,
} from "../../src/lib/models/revision-core";

describe("revision-core.deleteRevision with protected revisions", () => {
  async function fixture() {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-rev-del-"));
    const resourceId = generateUUID();
    await writeRevision(tmp, resourceId, 1, "one");
    await writeRevision(tmp, resourceId, 2, "two", { isCanonical: true });
    const revs = await listRevisions(tmp, resourceId);
    return {
      tmp,
      resourceId,
      nonCanonical: revs.find((r) => r.versionNumber === 1)!,
      canonical: revs.find((r) => r.versionNumber === 2)!,
    };
  }

  async function exists(p: string): Promise<boolean> {
    return fs.access(p).then(
      () => true,
      () => false,
    );
  }

  it("exposes a stable, user-readable message", () => {
    expect(PROTECTED_REVISION_DELETE_MESSAGE).toBe(
      "Protected revisions cannot be deleted. Unprotect it first.",
    );
  });

  it("refuses to delete a protected revision and keeps its directory", async () => {
    const { tmp, resourceId, nonCanonical } = await fixture();
    await setRevisionPreserve(tmp, resourceId, nonCanonical.id, true);
    await expect(
      deleteRevision(tmp, resourceId, nonCanonical.id),
    ).rejects.toThrow(PROTECTED_REVISION_DELETE_MESSAGE);
    expect(
      await exists(path.join(revisionsBaseDir(tmp, resourceId), "v-1")),
    ).toBe(true);
    await removeDirRetry(tmp);
  });

  it("deletes after unprotecting", async () => {
    const { tmp, resourceId, nonCanonical } = await fixture();
    await setRevisionPreserve(tmp, resourceId, nonCanonical.id, true);
    await setRevisionPreserve(tmp, resourceId, nonCanonical.id, false);
    await deleteRevision(tmp, resourceId, nonCanonical.id);
    expect(
      await exists(path.join(revisionsBaseDir(tmp, resourceId), "v-1")),
    ).toBe(false);
    await removeDirRetry(tmp);
  });

  it("keeps not-found and canonical errors unchanged", async () => {
    const { tmp, resourceId, canonical } = await fixture();
    await expect(deleteRevision(tmp, resourceId, "nope")).rejects.toThrow(
      "Revision nope not found.",
    );
    await setRevisionPreserve(tmp, resourceId, canonical.id, true);
    await expect(deleteRevision(tmp, resourceId, canonical.id)).rejects.toThrow(
      "Cannot delete the canonical revision; promote another revision first.",
    );
    await removeDirRetry(tmp);
  });
});
