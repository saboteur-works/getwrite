/**
 * Unit tests for POST /api/resource/[resource-id]/sidecar (29-route tenant
 * enforcement, Batch F).
 *
 * Exercises the actual route `POST` handler against a `projectId`-scoped
 * `GETWRITE_PROJECTS_DIR`, per the pattern established in `tags-api.test.ts`.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function makeTmpProjectsDir(): Promise<{
  projectsDir: string;
  projectId: string;
  projectPath: string;
}> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-resource-sidecar-route-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  return { projectsDir, projectId, projectPath };
}

async function withProjectsDirEnv<T>(
  projectsDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    return await fn();
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  }
}

function sidecarRequest(resourceId: string, body: unknown): Request {
  return new Request(`http://localhost/api/resource/${resourceId}/sidecar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/resource/[resource-id]/sidecar (projectId-based)", () => {
  it("resolves projectId to the on-disk project and updates the sidecar", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
      });

      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId,
          updatedResource: { status: "in-progress" },
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(200);
      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.status).toBe("in-progress");
      expect(sidecar?.name).toBe("Original");
    });
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const { projectsDir } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId: "not-a-uuid",
          updatedResource: { status: "in-progress" },
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    });
  });
});

describe("POST /api/resource/[resource-id]/sidecar (resourceSubtype, FR-7/FR-8)", () => {
  async function post(
    projectId: string,
    resourceId: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    const { POST } =
      await import("../../app/api/resource/[resource-id]/sidecar/route");
    return POST(sidecarRequest(resourceId, { projectId, ...body }) as never, {
      params: Promise.resolve({ "resource-id": resourceId }),
    });
  }

  const independentFields = {
    entityKind: "character",
    aliases: ["Al"],
    dismissedNoiseTerms: ["may"],
    orderIndex: 3,
    folderId: "folder-1",
  };

  it("persists the trimmed subtype string", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
      });
      const res = await post(projectId, resourceId, {
        updatedResource: { resourceSubtype: "  Scene  " },
      });
      expect(res.status).toBe(200);
      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.resourceSubtype).toBe("Scene");
    });
  });

  it("clears resourceSubtype via clearKeys as an absent key, not an undefined-valued one", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        resourceSubtype: "Scene",
      });
      const res = await post(projectId, resourceId, {
        updatedResource: {},
        clearKeys: ["resourceSubtype"],
      });
      expect(res.status).toBe(200);
      const sidecar = await readSidecar(projectPath, resourceId);
      expect(
        Object.prototype.hasOwnProperty.call(sidecar, "resourceSubtype"),
      ).toBe(false);
      expect(sidecar?.name).toBe("Original");
    });
  });

  it.each([
    ["a number", 42],
    ["null", null],
    ["an array", ["Scene"]],
    ["an empty string", ""],
    ["a whitespace-only string", "   "],
  ])(
    "rejects %s as resourceSubtype with 400 and leaves the sidecar byte-identical",
    async (_label, value) => {
      const { projectsDir, projectId, projectPath } =
        await makeTmpProjectsDir();
      await withProjectsDirEnv(projectsDir, async () => {
        const resourceId = generateUUID();
        await writeSidecar(projectPath, resourceId, {
          id: resourceId,
          name: "Original",
          type: "text",
          resourceSubtype: "Scene",
        });
        const sidecarPath = path.join(
          projectPath,
          "meta",
          `resource-${resourceId}.meta.json`,
        );
        const before = await fs.readFile(sidecarPath, "utf-8");
        const res = await post(projectId, resourceId, {
          updatedResource: { name: "Changed", resourceSubtype: value },
        });
        expect(res.status).toBe(400);
        expect(await fs.readFile(sidecarPath, "utf-8")).toBe(before);
      });
    },
  );

  it("still rejects clearKeys naming a key outside the allowlist", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        resourceSubtype: "Scene",
      });
      const res = await post(projectId, resourceId, {
        updatedResource: {},
        clearKeys: ["resourceSubtype", "dismissedNoiseTerms"],
      });
      expect(res.status).toBe(400);
      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.resourceSubtype).toBe("Scene");
    });
  });

  it("setting, changing and clearing the subtype leaves folderId, entityKind, aliases and dismissedNoiseTerms unchanged, and does not add entityKind", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      const plainId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        ...independentFields,
      });
      await writeSidecar(projectPath, plainId, {
        id: plainId,
        name: "Plain",
        type: "text",
      });
      const pick = (s: Record<string, unknown> | null): string =>
        JSON.stringify(
          Object.keys(independentFields).map((k) => (s ? s[k] : undefined)),
        );
      const expected = pick(independentFields);

      await post(projectId, resourceId, {
        updatedResource: { resourceSubtype: "Scene" },
      });
      expect(pick(await readSidecar(projectPath, resourceId))).toBe(expected);
      await post(projectId, resourceId, {
        updatedResource: { resourceSubtype: "Chapter" },
      });
      expect(pick(await readSidecar(projectPath, resourceId))).toBe(expected);
      await post(projectId, resourceId, {
        updatedResource: {},
        clearKeys: ["resourceSubtype"],
      });
      expect(pick(await readSidecar(projectPath, resourceId))).toBe(expected);

      await post(projectId, plainId, {
        updatedResource: { resourceSubtype: "Scene" },
      });
      const plain = await readSidecar(projectPath, plainId);
      expect(plain?.resourceSubtype).toBe("Scene");
      expect(Object.prototype.hasOwnProperty.call(plain, "entityKind")).toBe(
        false,
      );
    });
  });

  it("Remove Entity (clearKeys entityKind and aliases) leaves resourceSubtype unchanged", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        resourceSubtype: "Scene",
        ...independentFields,
      });
      const res = await post(projectId, resourceId, {
        updatedResource: {},
        clearKeys: ["entityKind", "aliases"],
      });
      expect(res.status).toBe(200);
      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.resourceSubtype).toBe("Scene");
      expect(sidecar?.folderId).toBe("folder-1");
      expect(sidecar?.dismissedNoiseTerms).toEqual(["may"]);
    });
  });
});

describe("POST /api/resource/[resource-id]/sidecar (clearKeys, FR-20/FR-25)", () => {
  it("deletes the named keys from the persisted sidecar and leaves everything else, including orderIndex/folderId, unchanged", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        entityKind: "character",
        aliases: ["Al"],
        orderIndex: 3,
        folderId: "folder-1",
      });

      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId,
          updatedResource: {},
          clearKeys: ["entityKind", "aliases"],
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(200);
      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar).not.toBeNull();
      // Genuinely absent, not undefined-valued.
      expect(Object.prototype.hasOwnProperty.call(sidecar, "entityKind")).toBe(
        false,
      );
      expect(Object.prototype.hasOwnProperty.call(sidecar, "aliases")).toBe(
        false,
      );
      // Everything else, including the orderIndex/folderId carve-out, is
      // unchanged.
      expect(sidecar?.name).toBe("Original");
      expect(sidecar?.type).toBe("text");
      expect(sidecar?.orderIndex).toBe(3);
      expect(sidecar?.folderId).toBe("folder-1");
    });
  });

  it("deletes wordCountGoal from the persisted sidecar entirely, not as an undefined-valued key (Feature 61)", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        wordCountGoal: 5000,
        orderIndex: 3,
        folderId: "folder-1",
      });

      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId,
          updatedResource: {},
          clearKeys: ["wordCountGoal"],
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(200);
      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar).not.toBeNull();
      expect(
        Object.prototype.hasOwnProperty.call(sidecar, "wordCountGoal"),
      ).toBe(false);
      expect(sidecar?.name).toBe("Original");
      expect(sidecar?.orderIndex).toBe(3);
      expect(sidecar?.folderId).toBe("folder-1");
    });
  });

  it("behaves exactly as a pure merge when clearKeys is omitted", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        entityKind: "character",
        aliases: ["Al"],
        orderIndex: 3,
        folderId: "folder-1",
      });

      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId,
          updatedResource: { status: "in-progress" },
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(200);
      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.status).toBe("in-progress");
      expect(sidecar?.entityKind).toBe("character");
      expect(sidecar?.aliases).toEqual(["Al"]);
      expect(sidecar?.orderIndex).toBe(3);
      expect(sidecar?.folderId).toBe("folder-1");
    });
  });

  it("rejects a clearKeys entry outside the allowlist (folderId) with 400 and leaves the sidecar file byte-identical", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        orderIndex: 3,
        folderId: "folder-1",
      });

      const sidecarPath = path.join(
        projectPath,
        "meta",
        `resource-${resourceId}.meta.json`,
      );
      const before = await fs.readFile(sidecarPath, "utf-8");

      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId,
          updatedResource: {},
          clearKeys: ["folderId"],
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(400);
      const after = await fs.readFile(sidecarPath, "utf-8");
      expect(after).toBe(before);
    });
  });

  it("rejects a clearKeys entry outside the allowlist (id) with 400 and leaves the sidecar file byte-identical", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        orderIndex: 3,
        folderId: "folder-1",
      });

      const sidecarPath = path.join(
        projectPath,
        "meta",
        `resource-${resourceId}.meta.json`,
      );
      const before = await fs.readFile(sidecarPath, "utf-8");

      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId,
          updatedResource: {},
          clearKeys: ["id"],
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(400);
      const after = await fs.readFile(sidecarPath, "utf-8");
      expect(after).toBe(before);
    });
  });

  it("rejects a malformed clearKeys (a plain string) with 400 and leaves the sidecar file byte-identical", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        entityKind: "character",
      });

      const sidecarPath = path.join(
        projectPath,
        "meta",
        `resource-${resourceId}.meta.json`,
      );
      const before = await fs.readFile(sidecarPath, "utf-8");

      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId,
          updatedResource: {},
          clearKeys: "entityKind",
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(400);
      const after = await fs.readFile(sidecarPath, "utf-8");
      expect(after).toBe(before);
    });
  });

  it("rejects a malformed clearKeys (an array containing a number) with 400 and leaves the sidecar file byte-identical", async () => {
    const { projectsDir, projectId, projectPath } = await makeTmpProjectsDir();
    await withProjectsDirEnv(projectsDir, async () => {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        name: "Original",
        type: "text",
        entityKind: "character",
      });

      const sidecarPath = path.join(
        projectPath,
        "meta",
        `resource-${resourceId}.meta.json`,
      );
      const before = await fs.readFile(sidecarPath, "utf-8");

      const { POST } =
        await import("../../app/api/resource/[resource-id]/sidecar/route");
      const res = await POST(
        sidecarRequest(resourceId, {
          projectId,
          updatedResource: {},
          clearKeys: ["entityKind", 42],
        }) as never,
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );

      expect(res.status).toBe(400);
      const after = await fs.readFile(sidecarPath, "utf-8");
      expect(after).toBe(before);
    });
  });
});
