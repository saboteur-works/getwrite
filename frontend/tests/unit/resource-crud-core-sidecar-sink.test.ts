/**
 * Feature 92 Task 17: `updateSidecarCore`, `setNoiseTermDismissedCore` and
 * `renameResourceSidecarCore` do their read-modify-write on the sidecar sink
 * (`mutateSidecar`), so the merge is computed from the value read inside the
 * lock. Real temp-dir project, no HTTP route or transport.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getStorageAdapter } from "../../src/lib/models/io";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  renameResourceSidecarCore,
  setNoiseTermDismissedCore,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import {
  readSidecar,
  sidecarPathForProject,
  writeSidecar,
} from "../../src/lib/models/sidecar";
import { softDeleteResource } from "../../src/lib/models/trash";
import { withFileLock } from "../../src/lib/models/file-lock";
import { ResourceGoneError } from "../../src/lib/models/resource-gone-error";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function withProject<T>(
  fn: (ctx: {
    projectId: string;
    projectPath: string;
    resourceId: string;
  }) => Promise<T>,
): Promise<T> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-resource-crud-core-sidecar-sink-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    return await fn({ projectId, projectPath, resourceId: generateUUID() });
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

describe("updateSidecarCore on the sidecar sink", () => {
  it("merges allowlisted keys over the stored value, drops wordCount and name, keeps orderIndex and folderId", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "Old",
        orderIndex: 3,
        folderId: "folder-a",
        keep: "kept",
      });

      await updateSidecarCore(projectId, resourceId, {
        entityKind: "character",
        name: "New",
        orderIndex: 9,
        folderId: "folder-b",
        wordCount: 99,
      });

      const stored = await readSidecar(projectPath, resourceId);
      expect(stored).toMatchObject({
        entityKind: "character",
        name: "Old",
        orderIndex: 3,
        folderId: "folder-a",
        keep: "kept",
      });
      expect(stored).not.toHaveProperty("wordCount");
    });
  });

  it("keeps the stored media file name when an update sends another", async () => {
    // The file route joins `file` into a path; only upload sets it.
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "Pic",
        type: "image",
        file: "original.png",
      });

      await updateSidecarCore(projectId, resourceId, {
        wordCountGoal: 100,
        file: "../other.png",
      });

      expect(await readSidecar(projectPath, resourceId)).toMatchObject({
        name: "Pic",
        wordCountGoal: 100,
        file: "original.png",
      });
    });
  });

  it("applies clearKeys after the merge", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "Fresh",
        orderIndex: 4,
        folderId: null,
        entityKind: "character",
      });

      await updateSidecarCore(projectId, resourceId, {}, ["entityKind"]);
      const stored = await readSidecar(projectPath, resourceId);
      expect(stored).not.toHaveProperty("entityKind");
      expect(stored?.name).toBe("Fresh");
    });
  });

  it("refuses with ResourceGoneError and creates nothing when no sidecar exists", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await expect(
        updateSidecarCore(projectId, resourceId, { name: "Ghost" }),
      ).rejects.toBeInstanceOf(ResourceGoneError);
      expect(await readSidecar(projectPath, resourceId)).toBeNull();
    });
  });

  it("refuses a save that arrives after the resource was moved to Trash", async () => {
    // note_131ecc62: the late save used to recreate a live sidecar, and the
    // trashed resource reappeared in the tree with no content.
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "Ghost",
        orderIndex: 0,
        folderId: null,
      });
      await softDeleteResource(projectPath, resourceId);
      await expect(
        updateSidecarCore(projectId, resourceId, {
          userMetadata: { status: "Draft" },
        }),
      ).rejects.toBeInstanceOf(ResourceGoneError);
      expect(await readSidecar(projectPath, resourceId)).toBeNull();
    });
  });

  it("never leaves a live sidecar when a save overlaps the move to Trash", async () => {
    await withProject(async ({ projectId, projectPath }) => {
      const live: number[] = [];
      for (let rep = 0; rep < 50; rep += 1) {
        const id = generateUUID();
        await writeSidecar(projectPath, id, {
          name: `R${rep}`,
          orderIndex: 0,
          folderId: null,
        });
        const save = updateSidecarCore(projectId, id, {
          userMetadata: { status: "Draft" },
        }).catch((err: unknown) => {
          if (!(err instanceof ResourceGoneError)) throw err;
        });
        const remove = softDeleteResource(projectPath, id);
        // Alternate which starts first.
        await (rep % 2 === 0
          ? Promise.all([remove, save])
          : Promise.all([save, remove]));
        if ((await readSidecar(projectPath, id)) !== null) live.push(rep);
      }
      expect(live).toEqual([]);
    });
  }, 60000);

  it("moves the sidecar to Trash only once a running sidecar write releases its lock", async () => {
    await withProject(async ({ projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "Held",
        orderIndex: 0,
        folderId: null,
      });
      const sidecarPath = sidecarPathForProject(projectPath, resourceId);
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      let markEntered!: () => void;
      const entered = new Promise<void>((resolve) => {
        markEntered = resolve;
      });
      const holder = withFileLock(sidecarPath, async () => {
        markEntered();
        await held;
      });
      await entered;
      const removal = softDeleteResource(projectPath, resourceId);
      // Give the delete time to reach the move.
      await new Promise((resolve) => setTimeout(resolve, 100));
      const isStillLive = await fs.access(sidecarPath).then(
        () => true,
        () => false,
      );
      release();
      await Promise.all([holder, removal]);
      expect(isStillLive).toBe(true);
      expect(await readSidecar(projectPath, resourceId)).toBeNull();
    });
  });

  it("replaces an unreadable sidecar as before rather than throwing", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await fs.mkdir(path.join(projectPath, "meta"), { recursive: true });
      await fs.writeFile(
        sidecarPathForProject(projectPath, resourceId),
        "{not json",
        "utf8",
      );

      await updateSidecarCore(projectId, resourceId, { name: "Recovered" });

      expect(await readSidecar(projectPath, resourceId)).toMatchObject({
        name: "Recovered",
        orderIndex: 0,
        folderId: null,
      });
    });
  });

  it("keeps both changes when two updates of different keys run at once", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "N",
        orderIndex: 0,
        folderId: null,
      });
      // One update per allowlisted key; userMetadata is replaced wholesale,
      // so it is sent once.
      await Promise.all([
        updateSidecarCore(projectId, resourceId, { entityKind: "place" }),
        updateSidecarCore(projectId, resourceId, { aliases: ["A", "B"] }),
        updateSidecarCore(projectId, resourceId, { wordCountGoal: 250 }),
        updateSidecarCore(projectId, resourceId, { resourceSubtype: "Scene" }),
        updateSidecarCore(projectId, resourceId, {
          userMetadata: { status: "Draft" },
        }),
      ]);
      const stored = await readSidecar(projectPath, resourceId);
      expect(stored).toMatchObject({
        entityKind: "place",
        aliases: ["A", "B"],
        wordCountGoal: 250,
        resourceSubtype: "Scene",
        userMetadata: { status: "Draft" },
      });
    });
  });
});

describe("setNoiseTermDismissedCore on the sidecar sink", () => {
  it("refuses with ResourceGoneError when no sidecar exists", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await expect(
        setNoiseTermDismissedCore(projectId, resourceId, "case", true),
      ).rejects.toBeInstanceOf(ResourceGoneError);
      expect(await readSidecar(projectPath, resourceId)).toBeNull();
    });
  });

  it("returns the stored list, computed from the sidecar read inside the lock", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "E",
        orderIndex: 0,
        folderId: null,
        dismissedNoiseTerms: ["kept"],
      });
      expect(
        await setNoiseTermDismissedCore(projectId, resourceId, " Case ", true),
      ).toEqual(["kept", "case"]);
      expect(
        await setNoiseTermDismissedCore(projectId, resourceId, "kept", false),
      ).toEqual(["case"]);
    });
  });

  it("keeps both terms when two different terms are dismissed at once", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "E",
        orderIndex: 0,
        folderId: null,
      });
      const terms = Array.from({ length: 10 }, (_, i) => `term${i}`);
      await Promise.all(
        terms.map((t) =>
          setNoiseTermDismissedCore(projectId, resourceId, t, true),
        ),
      );
      const stored = await readSidecar(projectPath, resourceId);
      expect([...(stored?.dismissedNoiseTerms as string[])].sort()).toEqual(
        [...terms].sort(),
      );
    });
  });
});

describe("renameResourceSidecarCore on the sidecar sink", () => {
  it("returns the updated object and writes it", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "Old",
        orderIndex: 1,
        folderId: null,
      });
      const result = await renameResourceSidecarCore(
        projectId,
        resourceId,
        "Renamed",
      );
      expect(result).toEqual({
        name: "Renamed",
        orderIndex: 1,
        folderId: null,
      });
      expect(await readSidecar(projectPath, resourceId)).toEqual(result);
    });
  });

  it("returns null and writes nothing when the sidecar is missing", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      expect(
        await renameResourceSidecarCore(projectId, resourceId, "X"),
      ).toBeNull();
      expect(await readSidecar(projectPath, resourceId)).toBeNull();
    });
  });

  it("keeps a concurrent update's change when renaming at once", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        name: "Old",
        orderIndex: 0,
        folderId: null,
      });
      await Promise.all([
        renameResourceSidecarCore(projectId, resourceId, "Renamed"),
        updateSidecarCore(projectId, resourceId, { wordCountGoal: 7 }),
      ]);
      expect(await readSidecar(projectPath, resourceId)).toMatchObject({
        name: "Renamed",
        wordCountGoal: 7,
      });
    });
  });
});

describe("updateSidecarCore allowlist (Feature 93 Task 9)", () => {
  const stored = {
    id: "stored-id",
    slug: "stored-slug",
    name: "Stored name",
    type: "text",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-02-02T00:00:00.000Z",
    dismissedNoiseTerms: ["kept"],
    wordCount: 7,
    file: "stored.png",
    orderIndex: 3,
    folderId: "folder-a",
  };

  const writerOwned: ReadonlyArray<[string, unknown]> = [
    ["entityKind", "character"],
    ["aliases", ["Al", "Bo"]],
    ["wordCountGoal", 5000],
    ["resourceSubtype", "Scene"],
    ["userMetadata", { status: "Draft", mood: "calm" }],
  ];

  const ignored: ReadonlyArray<[string, unknown]> = [
    ["updatedAt", "2020-01-01T00:00:00.000Z"],
    ["name", "Client name"],
    ["dismissedNoiseTerms", ["client"]],
    ["wordCount", 999],
    ["file", "../client.png"],
    ["orderIndex", 42],
    ["folderId", "folder-client"],
    ["someUnlistedKey", "client value"],
  ];

  it.each(writerOwned)("(a) stores a client %s as sent", async (key, value) => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, { ...stored });
      await updateSidecarCore(projectId, resourceId, { [key]: value });
      const after = await readSidecar(projectPath, resourceId);
      expect(after?.[key]).toEqual(value);
    });
  });

  it.each(ignored)(
    "(a) ignores a client %s: stored value unchanged and the call succeeds",
    async (key, value) => {
      await withProject(async ({ projectId, projectPath, resourceId }) => {
        await writeSidecar(projectPath, resourceId, { ...stored });
        await expect(
          updateSidecarCore(projectId, resourceId, { [key]: value }),
        ).resolves.toBeUndefined();
        const after = await readSidecar(projectPath, resourceId);
        expect(after?.[key]).toEqual((stored as Record<string, unknown>)[key]);
      });
    },
  );

  it("(b) a stale whole-resource save after a rename leaves the new name, 20 of 20", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      let kept = 0;
      for (let rep = 0; rep < 20; rep += 1) {
        const id = generateUUID();
        await writeSidecar(projectPath, id, {
          id,
          name: "Old",
          type: "text",
          orderIndex: 0,
          folderId: null,
        });
        const staleCopy = (await readSidecar(projectPath, id)) ?? {};
        await renameResourceSidecarCore(projectId, id, `New${rep}`);
        await updateSidecarCore(projectId, id, {
          ...staleCopy,
          userMetadata: { status: "Draft" },
        });
        if ((await readSidecar(projectPath, id))?.name === `New${rep}`) {
          kept += 1;
        }
      }
      void resourceId;
      expect(kept).toBe(20);
    });
  }, 60000);

  it("(b) a stale whole-resource save after a canonical save leaves the newer updatedAt, 100 of 100", async () => {
    await withProject(async ({ projectId, projectPath }) => {
      let kept = 0;
      for (let rep = 0; rep < 100; rep += 1) {
        const id = generateUUID();
        const older = "2026-01-01T00:00:00.000Z";
        const newer = `2026-03-01T00:00:${String(rep % 60).padStart(2, "0")}.000Z`;
        await writeSidecar(projectPath, id, {
          id,
          name: "N",
          type: "text",
          updatedAt: older,
          orderIndex: 0,
          folderId: null,
        });
        const staleCopy = (await readSidecar(projectPath, id)) ?? {};
        // The canonical save writes a newer updatedAt after the copy was taken.
        await writeSidecar(projectPath, id, { ...staleCopy, updatedAt: newer });
        await updateSidecarCore(projectId, id, {
          ...staleCopy,
          userMetadata: { status: "Draft" },
        });
        if ((await readSidecar(projectPath, id))?.updatedAt === newer) {
          kept += 1;
        }
      }
      expect(kept).toBe(100);
    });
  }, 120000);

  it("(c) KNOWN GAP: a stale userMetadata is stored as sent (replaced wholesale)", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, {
        ...stored,
        userMetadata: { status: "Final", mood: "calm" },
      });
      await updateSidecarCore(projectId, resourceId, {
        userMetadata: { status: "Draft" },
      });
      const after = await readSidecar(projectPath, resourceId);
      expect(after?.userMetadata).toEqual({ status: "Draft" });
    });
  });

  it("(d) replaces a sidecar that is not valid JSON with identity keys plus allowlisted keys", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await fs.mkdir(path.join(projectPath, "meta"), { recursive: true });
      const file = sidecarPathForProject(projectPath, resourceId);
      await fs.writeFile(file, "{not json", "utf8");

      await updateSidecarCore(projectId, resourceId, {
        id: resourceId,
        slug: "client-slug",
        name: "Client name",
        type: "text",
        createdAt: "2026-01-01T00:00:00.000Z",
        entityKind: "character",
        userMetadata: { status: "Draft" },
        someUnlistedKey: "dropped",
      });

      const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
      expect(parsed).toMatchObject({
        id: resourceId,
        slug: "client-slug",
        name: "Client name",
        type: "text",
        createdAt: "2026-01-01T00:00:00.000Z",
        entityKind: "character",
        userMetadata: { status: "Draft" },
      });
      expect(parsed).not.toHaveProperty("someUnlistedKey");
      expect(await readSidecar(projectPath, resourceId)).not.toBeNull();
    });
  });

  it("(e) rejects and leaves the bytes unchanged when the read fails with EACCES", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, { ...stored });
      const file = sidecarPathForProject(projectPath, resourceId);
      const before = await fs.readFile(file);
      await fs.chmod(file, 0o000);
      try {
        await expect(
          updateSidecarCore(projectId, resourceId, { entityKind: "x" }),
        ).rejects.toMatchObject({ code: "EACCES" });
      } finally {
        await fs.chmod(file, 0o644);
      }
      expect((await fs.readFile(file)).equals(before)).toBe(true);
    });
  });

  it("(f) Gate 6 F2: rejects and leaves the file unchanged when the first read fails with EIO and the re-read succeeds", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await writeSidecar(projectPath, resourceId, { ...stored });
      const file = sidecarPathForProject(projectPath, resourceId);
      const before = await fs.readFile(file);
      const adapter = getStorageAdapter();
      const realRead = adapter.readFile.bind(adapter);
      let hasFailed = false;
      const spy = vi.spyOn(adapter, "readFile").mockImplementation(((
        p: string,
        e?: BufferEncoding,
      ) => {
        if (!hasFailed && p === file) {
          hasFailed = true;
          return Promise.reject(
            Object.assign(new Error("EIO: i/o error"), { code: "EIO" }),
          );
        }
        return realRead(p, e);
      }) as typeof adapter.readFile);
      try {
        await expect(
          updateSidecarCore(projectId, resourceId, { entityKind: "x" }),
        ).rejects.toBeInstanceOf(Error);
      } finally {
        spy.mockRestore();
      }
      expect(hasFailed).toBe(true);
      expect((await fs.readFile(file)).equals(before)).toBe(true);
    });
  });

  it("(g) Gate 6 F7: replacing an unparseable sidecar carries the client's folderId and orderIndex", async () => {
    await withProject(async ({ projectId, projectPath, resourceId }) => {
      await fs.mkdir(path.join(projectPath, "meta"), { recursive: true });
      const file = sidecarPathForProject(projectPath, resourceId);
      await fs.writeFile(file, "{not json", "utf8");
      await updateSidecarCore(projectId, resourceId, {
        id: resourceId,
        name: "Client name",
        type: "text",
        folderId: "folder-x",
        orderIndex: 3,
        userMetadata: { status: "Draft" },
      });
      const parsed: unknown = JSON.parse(await fs.readFile(file, "utf8"));
      expect(parsed).toMatchObject({ folderId: "folder-x", orderIndex: 3 });
    });
  });
});
