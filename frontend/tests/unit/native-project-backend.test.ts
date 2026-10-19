// ADR-021 Phase 2 (Task 2): proves the native projects transport reuses the
// shared project CRUD core (`lib/models/project-crud-core.ts`) over a
// `capacitorFsAdapter`, with no HTTP at all — the projects analogue of
// `native-revision-backend.test.ts`.
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import * as io from "../../src/lib/models/io";
import { listProjectsCore } from "../../src/lib/models/project-crud-core";
import {
  createFakeCapacitorFilesystem,
  FsEncoding,
} from "../../src/lib/models/capacitor-filesystem";
import { createNativeProjectsTransport } from "../../src/store/transport/native-project-backend";

const PROJECTS_DIR = "/projects";

describe("native projects transport — in-process backend reuses the shared project CRUD core", () => {
  it("creates a project, lists it, opens it, and reindexes it with no HTTP", async () => {
    const fetchMock = guardAgainstFetch();
    const fs = createFakeCapacitorFilesystem();

    const transport = createNativeProjectsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    const created = await transport.create("My Blank Project", "blank");
    expect(created.project.name).toBe("My Blank Project");

    const list = await transport.list();
    expect(list).toHaveLength(1);
    // Native projects are never encrypted/locked, so this entry is always
    // the full-shaped variant of `ProjectListApiEntry` — asserted, not just
    // cast, so a real regression into the locked shape still fails loudly.
    expect(list[0].isLocked).toBeFalsy();
    const [listedEntry] = list;
    if (listedEntry.isLocked || "isUnusable" in listedEntry) {
      throw new Error("expected a non-locked, usable project entry");
    }
    expect(listedEntry.project.name).toBe("My Blank Project");

    const projectId = listedEntry.project.rootPath?.split("/").pop();
    expect(projectId).toBeDefined();

    const opened = await transport.open(String(projectId));
    expect(opened.project.name).toBe("My Blank Project");

    // Fire-and-forget: resolves without throwing regardless of whether the
    // internal `id` matches an actual project — mirrors the HTTP transport's
    // never-checked-response behavior.
    await expect(
      transport.reindex(created.project.id),
    ).resolves.toBeUndefined();
    await expect(
      transport.reindex("no-such-internal-id"),
    ).resolves.toBeUndefined();

    fetchMock.restore();
  });

  // Feature 89, Part 1 (FR-6): the native path calls `listProjectsCore`
  // directly, so it returns the same unusable entry the HTTP route's core call
  // returns for the same damage. Both sit on the one core.
  describe("unusable project parity with the HTTP path (Feature 89, FR-6)", () => {
    const originalAdapter = io.getStorageAdapter();
    const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
    let tmp: string | undefined;

    afterEach(async () => {
      io.setStorageAdapter(originalAdapter);
      if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
      else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
      if (tmp) await fsp.rm(tmp, { recursive: true, force: true });
      tmp = undefined;
    });

    it("lists an unparseable project.json as the same unusable entry as listProjectsCore on the node filesystem", async () => {
      const fs = createFakeCapacitorFilesystem();
      const transport = createNativeProjectsTransport({
        fs,
        projectsDir: PROJECTS_DIR,
      });
      const healthy = await transport.create("Healthy", "blank");
      const badId = "bad-project-folder";
      await fs.mkdir({ path: `${PROJECTS_DIR}/${badId}`, recursive: true });
      await fs.writeFile({
        path: `${PROJECTS_DIR}/${badId}/project.json`,
        data: "{ not json",
        encoding: FsEncoding.UTF8,
        recursive: true,
      });

      const nativeList = await transport.list();

      // The HTTP route returns `listProjectsCore()` serialized as JSON.
      io.setStorageAdapter(originalAdapter);
      tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "gw-f89-native-"));
      process.env.GETWRITE_PROJECTS_DIR = tmp;
      await fsp.mkdir(path.join(tmp, badId));
      await fsp.writeFile(path.join(tmp, badId, "project.json"), "{ not json");
      const httpList = JSON.parse(JSON.stringify(await listProjectsCore()));

      const expected = {
        project: { id: badId },
        folders: [],
        resources: [],
        isUnusable: true,
        unusableReason: "unparseable",
      };
      expect(httpList).toEqual([expected]);
      expect(nativeList).toHaveLength(2);
      expect(nativeList).toContainEqual(expected);
      expect(nativeList.some((e) => e.project.id === healthy.project.id)).toBe(
        true,
      );
    });
  });

  it("open rejects an invalid projectId without ever touching the filesystem", async () => {
    const fs = createFakeCapacitorFilesystem();
    const transport = createNativeProjectsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(transport.open("not-a-uuid")).rejects.toThrow(
      /Invalid projectId/,
    );
  });

  it("create rejects when name or projectType is missing", async () => {
    const fs = createFakeCapacitorFilesystem();
    const transport = createNativeProjectsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(transport.create("", "blank")).rejects.toThrow(
      "Missing name or projectType",
    );
  });

  it("create rejects when the projectType has no matching template", async () => {
    const fs = createFakeCapacitorFilesystem();
    const transport = createNativeProjectsTransport({
      fs,
      projectsDir: PROJECTS_DIR,
    });

    await expect(
      transport.create("Untyped", "not-a-real-type"),
    ).rejects.toThrow("Project type not found");
  });
});

/**
 * Fails the test if `fetch` is called — proves the native path never hits
 * HTTP, mirroring `native-revision-backend.test.ts`'s guard.
 */
function guardAgainstFetch(): { restore: () => void } {
  const original = globalThis.fetch;
  globalThis.fetch = (() => {
    throw new Error("fetch must not be called in-process");
  }) as unknown as typeof fetch;
  return {
    restore: () => {
      globalThis.fetch = original;
    },
  };
}
