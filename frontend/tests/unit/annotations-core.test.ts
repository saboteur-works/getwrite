/**
 * Feature 101, Task 12 (FR-10, FR-11, FR-15 core half, FR-23 core refusal,
 * FR-32): the annotation core writes only through `mutateSidecar`, refuses
 * non-text resources, validates before any lock or write, and leaves text,
 * word count, `content.txt` and revisions alone. Real files, real locks.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/sidecar", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/sidecar")
  >("../../src/lib/models/sidecar");
  return { ...actual, mutateSidecar: vi.fn(actual.mutateSidecar) };
});

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import {
  mutateSidecar,
  readSidecar,
  writeSidecar,
} from "../../src/lib/models/sidecar";
import * as io from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  runInStorageContext,
  type StorageContext,
} from "../../src/lib/models/storage-context";
import {
  createKeyring,
  type Keyring,
} from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { __resetIndexerForTests } from "../../src/lib/models/indexer-queue";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { listRevisions, writeRevision } from "../../src/lib/models/revision";
import { updateSidecarCore } from "../../src/lib/models/resource-crud-core";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import {
  indexResource,
  reindexMissingResources,
  removeResourceFromIndex,
  search,
} from "../../src/lib/models/inverted-index";
import { executeSearch } from "../../src/lib/search/execute-search";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import {
  addAnnotationCore,
  deleteAnnotationCore,
  listAnnotationsCore,
  reattachAnnotationCore,
  updateAnnotationCore,
  AnnotationNotFoundError,
  AnnotationResourceNotFoundError,
  AnnotationResourceTypeError,
  InvalidAnnotationError,
  InvalidAnnotationResourceIdError,
  InvalidProjectIdCoreError,
} from "../../src/lib/models/annotations-core";
import { removeDirRetry } from "./helpers/fs-utils";

const T0 = "1970-01-01T00:00:00.000Z";
const CONTENT = "the quick brown fox";

let batchRoot = "";
let projectId = "";
let projectRoot = "";
let resourceId = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

async function makeResource(type: string): Promise<string> {
  const id = generateUUID();
  await writeSidecar(projectRoot, id, {
    id,
    slug: "r",
    type,
    name: "R",
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
    wordCount: 4,
    userMetadata: { mood: "calm" },
  } as Record<string, MetadataValue>);
  return id;
}

async function readStored(
  id: string = resourceId,
): Promise<Record<string, unknown>> {
  const file = path.join(projectRoot, "meta", `resource-${id}.meta.json`);
  return JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
}

async function sidecarBytes(id: string = resourceId): Promise<string> {
  return fs.readFile(
    path.join(projectRoot, "meta", `resource-${id}.meta.json`),
    "utf8",
  );
}

const newInput = (over: Record<string, unknown> = {}) => ({
  id: generateUUID(),
  body: "check this",
  quote: "quick brown",
  ...over,
});

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-annotations-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "annotations" })),
    "utf8",
  );
  resourceId = await makeResource("text");
  await fs.mkdir(path.join(projectRoot, "resources", resourceId), {
    recursive: true,
  });
  await fs.writeFile(
    path.join(projectRoot, "resources", resourceId, "content.txt"),
    CONTENT,
    "utf8",
  );
  await writeRevision(projectRoot, resourceId, 1, CONTENT, {
    isCanonical: true,
  });
  vi.mocked(mutateSidecar).mockClear();
});

afterEach(async () => {
  await flushIndexer();
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  await removeDirRetry(batchRoot);
});

describe("annotation core, add / update / delete", () => {
  it("adds, updates and deletes through mutateSidecar", async () => {
    const input = newInput();
    const added = await addAnnotationCore(projectId, resourceId, input);
    expect(added).toMatchObject({
      id: input.id,
      body: "check this",
      quote: "quick brown",
    });
    expect(added.createdAt).toBe(added.updatedAt);
    expect((await readStored()).annotations).toEqual([added]);

    const updated = await updateAnnotationCore(
      projectId,
      resourceId,
      input.id,
      "new body",
    );
    expect(updated.body).toBe("new body");
    expect(updated.quote).toBe("quick brown");
    expect(updated.createdAt).toBe(added.createdAt);
    expect((await readStored()).annotations).toEqual([updated]);

    await deleteAnnotationCore(projectId, resourceId, input.id);
    expect((await readStored()).annotations).toEqual([]);

    expect(mutateSidecar).toHaveBeenCalledTimes(3);
  });

  it("refuses an unknown annotation id on update and delete", async () => {
    await expect(
      updateAnnotationCore(projectId, resourceId, generateUUID(), "x"),
    ).rejects.toBeInstanceOf(AnnotationNotFoundError);
    await expect(
      deleteAnnotationCore(projectId, resourceId, generateUUID()),
    ).rejects.toBeInstanceOf(AnnotationNotFoundError);
  });

  it("refuses a collision and the per-resource cap inside the lock", async () => {
    const input = newInput();
    await addAnnotationCore(projectId, resourceId, input);
    await expect(
      addAnnotationCore(projectId, resourceId, input),
    ).rejects.toThrow("already exists");
    const full = Array.from({ length: 500 }, () => ({
      id: generateUUID(),
      body: "b",
      quote: "",
      createdAt: T0,
      updatedAt: T0,
    }));
    await mutateSidecar(projectRoot, resourceId as never, (cur) => ({
      ...cur!,
      annotations: full as unknown as MetadataValue,
    }));
    await expect(
      addAnnotationCore(projectId, resourceId, newInput()),
    ).rejects.toThrow("more than 500");
  });
});

describe("annotation core, reattach (Task 18, FR-16)", () => {
  it("replaces quote and bumps updatedAt; body, createdAt and the original quote are not kept", async () => {
    const input = newInput({ quote: "quick brown" });
    const added = await addAnnotationCore(projectId, resourceId, input);
    await new Promise((r) => setTimeout(r, 5));
    const moved = await reattachAnnotationCore(
      projectId,
      resourceId,
      input.id,
      "lazy dog",
    );
    expect(moved).toEqual({
      ...added,
      quote: "lazy dog",
      updatedAt: moved.updatedAt,
    });
    expect(moved.updatedAt > added.updatedAt).toBe(true);
    expect((await readStored()).annotations).toEqual([moved]);
    expect(JSON.stringify(await readStored())).not.toContain("quick brown");
  });

  it("refuses an unknown id, a bad id, an over-long or non-string quote before any write", async () => {
    const input = newInput();
    await addAnnotationCore(projectId, resourceId, input);
    const before = await sidecarBytes();
    vi.mocked(mutateSidecar).mockClear();
    await expect(
      reattachAnnotationCore(projectId, resourceId, generateUUID(), "q"),
    ).rejects.toBeInstanceOf(AnnotationNotFoundError);
    for (const [id, quote] of [
      ["x", "q"],
      [input.id, "q".repeat(501)],
      [input.id, 5],
    ] as const) {
      await expect(
        reattachAnnotationCore(projectId, resourceId, id, quote),
      ).rejects.toBeInstanceOf(InvalidAnnotationError);
    }
    expect(mutateSidecar).toHaveBeenCalledTimes(1);
    expect(await sidecarBytes()).toBe(before);
  });
});

describe("annotation core, FR-10 isolation from updateSidecarCore", () => {
  it("leaves the stored array unchanged for a different or missing annotations key", async () => {
    const added = await addAnnotationCore(projectId, resourceId, newInput());
    await updateSidecarCore(projectId, resourceId, {
      annotations: [{ id: generateUUID(), body: "forged" }],
      wordCountGoal: 7,
    });
    expect((await readStored()).annotations).toEqual([added]);
    await updateSidecarCore(projectId, resourceId, { wordCountGoal: 8 });
    const stored = await readStored();
    expect(stored.annotations).toEqual([added]);
    expect(stored.wordCountGoal).toBe(8);
  });

  it("loses neither a concurrent annotation write nor a sidecar field save", async () => {
    for (let i = 0; i < 30; i += 1) {
      const id = await makeResource("text");
      const input = newInput();
      await Promise.all([
        addAnnotationCore(projectId, id, input),
        updateSidecarCore(projectId, id, { wordCountGoal: i + 1 }),
      ]);
      const stored = await readStored(id);
      expect((stored.annotations as { id: string }[]).map((a) => a.id)).toEqual(
        [input.id],
      );
      expect(stored.wordCountGoal).toBe(i + 1);
    }
  });
});

describe("annotation core, refusals", () => {
  it.each(["image", "audio"])(
    "refuses a write for a %s resource",
    async (t) => {
      const id = await makeResource(t);
      const before = await sidecarBytes(id);
      await expect(
        addAnnotationCore(projectId, id, newInput()),
      ).rejects.toBeInstanceOf(AnnotationResourceTypeError);
      await expect(
        updateAnnotationCore(projectId, id, generateUUID(), "x"),
      ).rejects.toBeInstanceOf(AnnotationResourceTypeError);
      await expect(
        deleteAnnotationCore(projectId, id, generateUUID()),
      ).rejects.toBeInstanceOf(AnnotationResourceTypeError);
      expect(await sidecarBytes(id)).toBe(before);
    },
  );

  it("refuses a resource with no sidecar and writes nothing", async () => {
    const id = generateUUID();
    await expect(
      addAnnotationCore(projectId, id, newInput()),
    ).rejects.toBeInstanceOf(AnnotationResourceNotFoundError);
    await expect(
      fs.access(path.join(projectRoot, "meta", `resource-${id}.meta.json`)),
    ).rejects.toThrow();
  });

  it("refuses invalid input with a message before any lock or write", async () => {
    const before = await sidecarBytes();
    const bad: Array<() => Promise<unknown>> = [
      () => addAnnotationCore(projectId, resourceId, newInput({ body: "" })),
      () =>
        addAnnotationCore(
          projectId,
          resourceId,
          newInput({ body: "x".repeat(5001) }),
        ),
      () =>
        addAnnotationCore(
          projectId,
          resourceId,
          newInput({ quote: "q".repeat(501) }),
        ),
      () => addAnnotationCore(projectId, resourceId, newInput({ id: "nope" })),
      () => addAnnotationCore(projectId, resourceId, newInput({ extra: 1 })),
      () => addAnnotationCore(projectId, resourceId, "string"),
      () => updateAnnotationCore(projectId, resourceId, generateUUID(), ""),
      () => updateAnnotationCore(projectId, resourceId, "bad-id", "ok"),
      () => deleteAnnotationCore(projectId, resourceId, "bad-id"),
    ];
    for (const run of bad) {
      const err = await run().catch((e: unknown) => e);
      expect(err).toBeInstanceOf(InvalidAnnotationError);
      expect((err as Error).message.length).toBeGreaterThan(0);
    }
    expect(mutateSidecar).not.toHaveBeenCalled();
    expect(await sidecarBytes()).toBe(before);
  });

  it("takes the resource id as a validated parameter, never a path", async () => {
    await expect(
      addAnnotationCore(projectId, "../../etc/passwd", newInput()),
    ).rejects.toBeInstanceOf(InvalidAnnotationResourceIdError);
    expect(mutateSidecar).not.toHaveBeenCalled();
  });

  it("refuses an invalid project id", async () => {
    await expect(
      addAnnotationCore("../x", resourceId, newInput()),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
    expect(mutateSidecar).not.toHaveBeenCalled();
  });
});

describe("annotation core, FR-15 no effect on text", () => {
  it("creates no revision and leaves content.txt, word count and text keys untouched", async () => {
    const contentPath = path.join(
      projectRoot,
      "resources",
      resourceId,
      "content.txt",
    );
    const revisionsBefore = (await listRevisions(projectRoot, resourceId))
      .length;
    const before = await readStored();
    const input = newInput();

    await addAnnotationCore(projectId, resourceId, input);
    await updateAnnotationCore(projectId, resourceId, input.id, "edited");
    await deleteAnnotationCore(projectId, resourceId, input.id);

    expect(await fs.readFile(contentPath, "utf8")).toBe(CONTENT);
    expect((await listRevisions(projectRoot, resourceId)).length).toBe(
      revisionsBefore,
    );
    const rest = await readStored();
    delete rest.annotations;
    const restBefore = { ...before };
    delete restBefore.annotations;
    expect(rest).toEqual(restBefore);
    expect(rest.wordCount).toBe(4);
  });
});

describe("annotation core, read (Task 14, FR-22)", () => {
  it("returns the stored annotations, or an empty list when there are none", async () => {
    expect(await listAnnotationsCore(projectId, resourceId)).toEqual([]);
    const added = await addAnnotationCore(projectId, resourceId, newInput());
    expect(await listAnnotationsCore(projectId, resourceId)).toEqual([added]);
  });

  it("refuses an invalid project id, an invalid resource id, a missing and a non-text resource", async () => {
    await expect(
      listAnnotationsCore("not-a-uuid", resourceId),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
    await expect(listAnnotationsCore(projectId, "x")).rejects.toBeInstanceOf(
      InvalidAnnotationResourceIdError,
    );
    await expect(
      listAnnotationsCore(projectId, generateUUID()),
    ).rejects.toBeInstanceOf(AnnotationResourceNotFoundError);
    const image = await makeResource("image");
    await expect(listAnnotationsCore(projectId, image)).rejects.toBeInstanceOf(
      AnnotationResourceTypeError,
    );
  });

  it("rejects, rather than returning an empty list, when the sidecar cannot be read", async () => {
    await fs.writeFile(
      path.join(projectRoot, "meta", `resource-${resourceId}.meta.json`),
      "{ not json",
      "utf8",
    );
    await expect(listAnnotationsCore(projectId, resourceId)).rejects.toThrow();
  });
});

// Feature 101, Task 13 (FR-21): an encrypted project seals annotation bodies
// as it seals the sidecar, and a locked project refuses reads and writes.
// Fixture as in revision-locked-access.test.ts: an in-memory adapter routed
// through the real `workspaceEncryptionAdapter`.
describe("annotations in an encrypted project (FR-21)", () => {
  const WORKSPACE = "/ws";
  const SECRET = "the sealed note body";
  let base: StorageAdapter;
  let keyring: Keyring;
  let encProjectId: string;
  let encRoot: string;
  let ctx: StorageContext;
  let encResourceId: string;
  const previousAdapter = io.getStorageAdapter();

  beforeEach(async () => {
    __resetIndexerForTests();
    base = createMemoryAdapter();
    encProjectId = generateUUID();
    encRoot = `${WORKSPACE}/${encProjectId}`;
    await base.mkdir(encRoot, { recursive: true });
    keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(encProjectId);
    await writeProjectMarker(encRoot, base);
    ctx = {
      tenantRoot: WORKSPACE,
      adapter: workspaceEncryptionAdapter(base, WORKSPACE, keyring),
      projectRoot: encRoot,
    };
    encResourceId = generateUUID();
    await runInStorageContext(ctx, () =>
      writeSidecar(encRoot, encResourceId, {
        id: encResourceId,
        slug: "r",
        type: "text",
        name: "R",
        orderIndex: 0,
        folderId: null,
        createdAt: T0,
        updatedAt: T0,
      } as Record<string, MetadataValue>),
    );
  });

  afterEach(() => {
    io.setStorageAdapter(previousAdapter);
    __resetIndexerForTests();
  });

  it("stores the body sealed, as the sidecar is, and reads it back unlocked", async () => {
    await runInStorageContext(ctx, () =>
      addAnnotationCore(
        encProjectId,
        encResourceId,
        newInput({ body: SECRET }),
      ),
    );
    const sidecarFile = `${encRoot}/meta/resource-${encResourceId}.meta.json`;
    const raw = await base.readFile(sidecarFile, "utf8");
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain("annotations");
    const read = await runInStorageContext(ctx, () =>
      readSidecar(encRoot, encResourceId),
    );
    expect((read?.annotations as unknown as { body: string }[])[0]?.body).toBe(
      SECRET,
    );
  });

  it("refuses annotation writes and reads once the workspace is locked", async () => {
    await runInStorageContext(ctx, () =>
      addAnnotationCore(
        encProjectId,
        encResourceId,
        newInput({ body: SECRET }),
      ),
    );
    keyring.lock();
    const locked = (err: unknown): boolean => isLockedAccessError(err);
    await expect(
      runInStorageContext(ctx, () =>
        addAnnotationCore(encProjectId, encResourceId, newInput()),
      ),
    ).rejects.toSatisfy(locked);
    await expect(
      runInStorageContext(ctx, () =>
        updateAnnotationCore(encProjectId, encResourceId, generateUUID(), "x"),
      ),
    ).rejects.toSatisfy(locked);
    await expect(
      runInStorageContext(ctx, () =>
        deleteAnnotationCore(encProjectId, encResourceId, generateUUID()),
      ),
    ).rejects.toSatisfy(locked);
    await expect(
      runInStorageContext(ctx, () => readSidecar(encRoot, encResourceId)),
    ).rejects.toSatisfy(locked);
  });
});

describe("annotation core, index (Task 22, FR-20 index half)", () => {
  const found = async (query: string): Promise<string[]> =>
    (await executeSearch(projectRoot, query, {}, 10)).map((h) => h.resourceId);

  it("a body-only match reaches the candidate list, under a source separate from prose", async () => {
    // The quote is not in the text: this annotation is detached.
    await addAnnotationCore(
      projectId,
      resourceId,
      newInput({ body: "zephyrwort needs a citation", quote: "not in text" }),
    );
    await flushIndexer();
    expect(await found("zephyrwort")).toEqual([resourceId]);
    expect(await search(projectRoot, "zephyrwort")).toEqual([]);
    const indexDir = path.join(projectRoot, "meta", "index");
    expect(
      await fs.readFile(path.join(indexDir, "inverted.json"), "utf8"),
    ).not.toContain("zephyrwort");
    expect(
      await fs.readFile(path.join(indexDir, "annotations.json"), "utf8"),
    ).toContain("zephyrwort");
  });

  it("a body edit and a body delete change the index with no manual reindex", async () => {
    const input = newInput({ body: "alpharune first" });
    await addAnnotationCore(projectId, resourceId, input);
    await flushIndexer();
    expect(await found("alpharune")).toEqual([resourceId]);
    await updateAnnotationCore(projectId, resourceId, input.id, "betarune now");
    await flushIndexer();
    expect(await found("alpharune")).toEqual([]);
    expect(await found("betarune")).toEqual([resourceId]);
    await deleteAnnotationCore(projectId, resourceId, input.id);
    await flushIndexer();
    expect(await found("betarune")).toEqual([]);
  });

  it("keeps annotation terms across a from-scratch prose reindex and the missing-resource pass", async () => {
    await addAnnotationCore(
      projectId,
      resourceId,
      newInput({ body: "gammarune kept" }),
    );
    await flushIndexer();
    // What `reindex` does per resource: rebuild the prose entry.
    await indexResource(projectRoot, {
      id: resourceId,
      name: "R",
      type: "text",
      plainText: CONTENT,
    } as unknown as Parameters<typeof indexResource>[1]);
    await reindexMissingResources(projectRoot);
    await flushIndexer();
    expect(await found("gammarune")).toEqual([resourceId]);
  });

  it("returns a resource matching in prose and in a body once", async () => {
    await indexResource(projectRoot, {
      id: resourceId,
      name: "R",
      type: "text",
      plainText: CONTENT,
    } as unknown as Parameters<typeof indexResource>[1]);
    await addAnnotationCore(
      projectId,
      resourceId,
      newInput({ body: "the fox is a metaphor" }),
    );
    await flushIndexer();
    expect(await found("fox")).toEqual([resourceId]);
  });

  it("drops a resource's annotation terms when the resource leaves the index", async () => {
    await addAnnotationCore(
      projectId,
      resourceId,
      newInput({ body: "deltarune gone" }),
    );
    await flushIndexer();
    expect(await found("deltarune")).toEqual([resourceId]);
    await removeResourceFromIndex(projectRoot, resourceId);
    expect(await found("deltarune")).toEqual([]);
  });
});

describe("annotation core on a Source (Feature 102, Task 32, FR-38)", () => {
  let sourceId = "";

  beforeEach(async () => {
    sourceId = await makeResource("source");
    await fs.mkdir(path.join(projectRoot, "resources", sourceId), {
      recursive: true,
    });
    await fs.writeFile(
      path.join(projectRoot, "resources", sourceId, "content.txt"),
      CONTENT,
      "utf8",
    );
    await writeRevision(projectRoot, sourceId, 1, CONTENT, {
      isCanonical: true,
    });
  });

  it("adds, lists, updates and deletes an annotation on a Source body", async () => {
    const input = newInput();
    const added = await addAnnotationCore(projectId, sourceId, input);
    expect((await readStored(sourceId)).annotations).toEqual([added]);
    expect(await listAnnotationsCore(projectId, sourceId)).toEqual([added]);

    const updated = await updateAnnotationCore(
      projectId,
      sourceId,
      input.id,
      "new body",
    );
    expect(updated.body).toBe("new body");
    await deleteAnnotationCore(projectId, sourceId, input.id);
    expect(await listAnnotationsCore(projectId, sourceId)).toEqual([]);
  });

  it("leaves the Source body, revisions and word count alone, as for text", async () => {
    const revisionsBefore = (await listRevisions(projectRoot, sourceId)).length;
    await addAnnotationCore(projectId, sourceId, newInput());
    expect(
      await fs.readFile(
        path.join(projectRoot, "resources", sourceId, "content.txt"),
        "utf8",
      ),
    ).toBe(CONTENT);
    expect((await listRevisions(projectRoot, sourceId)).length).toBe(
      revisionsBefore,
    );
    expect((await readStored(sourceId)).wordCount).toBe(4);
  });

  it("finds a Source annotation body in search, as for text", async () => {
    await addAnnotationCore(
      projectId,
      sourceId,
      newInput({ body: "sourcerune needs a citation", quote: "not in text" }),
    );
    await flushIndexer();
    const hits = (await executeSearch(projectRoot, "sourcerune", {}, 10)).map(
      (h) => h.resourceId,
    );
    expect(hits).toEqual([sourceId]);
  });
});
