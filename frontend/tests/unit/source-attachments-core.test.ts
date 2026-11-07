/**
 * Feature 102, Task 23 (FR-24 data half, FR-25, FR-31 (a2), FR-34): the
 * Source attachment core adds, lists and reorders attachments held inside the
 * Source's `resources/<id>/` directory and listed in its sidecar.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addAttachmentCore,
  listAttachmentsCore,
  reorderAttachmentsCore,
  AttachmentLimitError,
  AttachmentResourceTypeError,
  AttachmentValidationError,
  InvalidAttachmentOrderError,
  InvalidAttachmentResourceIdError,
  MAX_ATTACHMENTS_PER_SOURCE,
} from "../../src/lib/models/source-attachments-core";
import {
  CLIENT_WRITABLE_SIDECAR_KEYS,
  createResourceCore,
  fetchResourceContentCore,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import {
  createRevision,
  readRevision,
  updateRevisionInPlace,
} from "../../src/lib/models/revision-core";
import {
  listRevisions,
  pruneRevisions,
  setCanonicalRevision,
} from "../../src/lib/models/revision";
import { getLocalResources } from "../../src/lib/models/resource-persistence";
import { listResourceIds } from "../../src/lib/models/backlinks";
import { mutateSidecar, readSidecar } from "../../src/lib/models/sidecar";
import { ATTACHMENT_MESSAGES } from "../../src/lib/models/media-validation";
import { AttachmentListSchema } from "../../src/lib/models/schemas";
import { ResourceResponseSchema } from "../../src/lib/api/schemas";
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
import {
  __resetIndexerForTests,
  flushIndexer,
} from "../../src/lib/models/indexer-queue";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue, TipTapDocument } from "../../src/lib/models/types";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";

const SPEC_PATH = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);
const T0 = "1970-01-01T00:00:00.000Z";

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 9, 9]);

let projectsDir: string;
let projectId: string;
let projectRoot: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-attach-core-"));
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  projectId = generateUUID();
  projectRoot = path.join(projectsDir, projectId);
  await createAndAssertProject(SPEC_PATH, {
    projectRoot,
    name: "Attachment Core Test",
  });
});

afterEach(async () => {
  await flushIndexer();
  if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  await removeDirRetry(projectsDir);
});

function doc(text: string): TipTapDocument {
  return {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

async function createSource(): Promise<string> {
  const created = await createResourceCore(projectId, {
    type: "source",
    name: "Interview",
    text: { plainText: "first words" },
  });
  return created.id;
}

const resourceDir = (id: string): string =>
  path.join(projectRoot, "resources", id);

async function filesIn(dir: string): Promise<string[]> {
  try {
    return (await fs.readdir(dir)).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}

function pngInput(name = "photo.png") {
  return { fileName: name, mimeType: "image/png", fileBytes: PNG };
}

describe("add and list", () => {
  it("stores files inside the Source directory under server-generated names and lists them in order", async () => {
    const id = await createSource();
    const before = await filesIn(resourceDir(id));
    const resourceDirsBefore = await filesIn(
      path.join(projectRoot, "resources"),
    );
    const first = await addAttachmentCore(
      projectId,
      id,
      pngInput("../../evil.png"),
    );
    const second = await addAttachmentCore(projectId, id, {
      fileName: "voice.mp3",
      mimeType: "audio/mpeg",
      fileBytes: MP3,
    });

    for (const entry of [first, second]) {
      expect(entry.fileName).not.toContain("/");
      expect(entry.fileName).not.toContain("evil");
      expect(entry.fileName).not.toContain("voice");
      expect(entry.fileName).not.toContain("photo");
      const bytes = await fs.readFile(
        path.join(resourceDir(id), entry.fileName),
      );
      expect(bytes.length).toBeGreaterThan(0);
    }
    expect(first.originalName).toBe("evil.png");
    expect(first.mime).toBe("image/png");
    expect(second.mime).toBe("audio/mpeg");
    expect(first.size).toBe(PNG.length);

    const after = await filesIn(resourceDir(id));
    expect(after.filter((f) => !before.includes(f)).sort()).toEqual(
      [first.fileName, second.fileName].sort(),
    );
    // nothing escaped the directory
    expect(await filesIn(path.join(projectRoot, "resources"))).toEqual(
      resourceDirsBefore,
    );
    expect(await filesIn(projectRoot)).not.toContain("evil.png");

    const listed = await listAttachmentsCore(projectId, id);
    expect(listed.map((a) => a.id)).toEqual([first.id, second.id]);
    expect(AttachmentListSchema.safeParse(listed).success).toBe(true);
  });

  it("adds no entry to the resource tree or the resource list", async () => {
    const id = await createSource();
    const idsBefore = await listResourceIds(projectRoot);
    const resourcesBefore = (await getLocalResources(projectRoot)).length;
    await addAttachmentCore(projectId, id, pngInput());
    await addAttachmentCore(projectId, id, pngInput("b.png"));
    expect(await listResourceIds(projectRoot)).toEqual(idsBefore);
    const resources = await getLocalResources(projectRoot);
    expect(resources).toHaveLength(resourcesBefore);
    expect(resources.filter((r) => r.type === "source")).toHaveLength(1);
  });

  it("is declared in the client response schema, which does not strip it", async () => {
    const id = await createSource();
    const entry = await addAttachmentCore(projectId, id, pngInput());
    const stored = await readSidecar(projectRoot, id);
    const parsed = ResourceResponseSchema.parse({ resource: stored });
    expect((parsed.resource as { attachments?: unknown }).attachments).toEqual([
      entry,
    ]);
  });

  it("refuses a rejected file with the shared message and stores nothing", async () => {
    const id = await createSource();
    const before = await filesIn(resourceDir(id));
    const sidecarBefore = await readSidecar(projectRoot, id);
    const refusals: Array<
      [{ fileName: string; mimeType: string; fileBytes: Uint8Array }, string?]
    > = [
      [
        { fileName: "clip.mp4", mimeType: "video/mp4", fileBytes: PNG },
        ATTACHMENT_MESSAGES.videoNotSupported,
      ],
      [
        { fileName: "fake.png", mimeType: "image/png", fileBytes: MP3 },
        ATTACHMENT_MESSAGES.contentMismatch,
      ],
      [{ fileName: "notes.txt", mimeType: "text/plain", fileBytes: PNG }],
    ];
    for (const [input, message] of refusals) {
      const err = await addAttachmentCore(projectId, id, input).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(AttachmentValidationError);
      if (message) expect((err as Error).message).toBe(message);
    }
    expect(await filesIn(resourceDir(id))).toEqual(before);
    expect(await readSidecar(projectRoot, id)).toEqual(sidecarBefore);
  });

  it("refuses a non-Source resource and an invalid id, storing nothing", async () => {
    const text = await createResourceCore(projectId, {
      type: "text",
      name: "Plain",
      text: { plainText: "x" },
    });
    const before = await filesIn(resourceDir(text.id));
    await expect(
      addAttachmentCore(projectId, text.id, pngInput()),
    ).rejects.toBeInstanceOf(AttachmentResourceTypeError);
    await expect(
      listAttachmentsCore(projectId, text.id),
    ).rejects.toBeInstanceOf(AttachmentResourceTypeError);
    expect(await filesIn(resourceDir(text.id))).toEqual(before);
    expect(
      (await readSidecar(projectRoot, text.id))?.attachments,
    ).toBeUndefined();
    await expect(
      addAttachmentCore(projectId, "../x", pngInput()),
    ).rejects.toBeInstanceOf(InvalidAttachmentResourceIdError);
  });
});

describe("the 500 attachment cap", () => {
  it("refuses the 501st add with a visible message and stores nothing", async () => {
    const id = await createSource();
    const entries = Array.from(
      { length: MAX_ATTACHMENTS_PER_SOURCE },
      (_, i) => ({
        id: generateUUID(),
        fileName: `attachment-${i}.png`,
        originalName: `p${i}.png`,
        mime: "image/png",
        size: 1,
        addedAt: T0,
      }),
    );
    await mutateSidecar(projectRoot, id, (current) => ({
      ...(current as Record<string, MetadataValue>),
      attachments: entries as unknown as MetadataValue,
    }));
    const filesBefore = await filesIn(resourceDir(id));
    const err = await addAttachmentCore(projectId, id, pngInput()).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AttachmentLimitError);
    expect((err as Error).message).toMatch(/500/);
    expect(await filesIn(resourceDir(id))).toEqual(filesBefore);
    expect(await listAttachmentsCore(projectId, id)).toHaveLength(500);
  });
});

describe("reorder", () => {
  it("changes only the sidecar list and not the bytes", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, pngInput());
    const b = await addAttachmentCore(projectId, id, pngInput("b.png"));
    const c = await addAttachmentCore(projectId, id, pngInput("c.png"));
    const dir = resourceDir(id);
    const snapshot = async (): Promise<Record<string, string>> => {
      const out: Record<string, string> = {};
      for (const f of await filesIn(dir)) {
        out[f] = (await fs.readFile(path.join(dir, f))).toString("base64");
      }
      return out;
    };
    const bytesBefore = await snapshot();
    const sidecarBefore = (await readSidecar(projectRoot, id)) as Record<
      string,
      unknown
    >;

    const result = await reorderAttachmentsCore(projectId, id, [
      c.id,
      a.id,
      b.id,
    ]);
    expect(result.map((e) => e.id)).toEqual([c.id, a.id, b.id]);
    expect(await snapshot()).toEqual(bytesBefore);
    const sidecarAfter = (await readSidecar(projectRoot, id)) as Record<
      string,
      unknown
    >;
    const { attachments: afterList, ...restAfter } = sidecarAfter;
    const { attachments: beforeList, ...restBefore } = sidecarBefore;
    expect(restAfter).toEqual(restBefore);
    expect((afterList as { id: string }[]).map((e) => e.id)).toEqual([
      c.id,
      a.id,
      b.id,
    ]);
    expect((beforeList as { id: string }[]).map((e) => e.id)).toEqual([
      a.id,
      b.id,
      c.id,
    ]);
  });

  it("refuses an order that is not a permutation of the stored ids", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, pngInput());
    const b = await addAttachmentCore(projectId, id, pngInput("b.png"));
    for (const bad of [
      [a.id],
      [a.id, a.id],
      [a.id, generateUUID()],
      [a.id, b.id, b.id],
      "x",
    ]) {
      await expect(
        reorderAttachmentsCore(projectId, id, bad as unknown as string[]),
      ).rejects.toBeInstanceOf(InvalidAttachmentOrderError);
    }
    expect((await listAttachmentsCore(projectId, id)).map((e) => e.id)).toEqual(
      [a.id, b.id],
    );
  });
});

describe("the list is server-owned (FR-24)", () => {
  it("is not among the client-writable sidecar keys", () => {
    expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain("attachments");
  });

  it("is unchanged by a whole-sidecar client write with a different or missing list", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, pngInput());
    const stored = (await readSidecar(projectRoot, id)) as Record<
      string,
      unknown
    >;
    await updateSidecarCore(projectId, id, {
      ...stored,
      attachments: [],
      wordCountGoal: 7,
    });
    expect((await listAttachmentsCore(projectId, id)).map((e) => e.id)).toEqual(
      [a.id],
    );
    const { attachments: _dropped, ...withoutList } = stored;
    void _dropped;
    await updateSidecarCore(projectId, id, {
      ...withoutList,
      wordCountGoal: 8,
    });
    expect((await listAttachmentsCore(projectId, id)).map((e) => e.id)).toEqual(
      [a.id],
    );
    expect((await readSidecar(projectRoot, id))?.wordCountGoal).toBe(8);
  });

  it("loses neither a concurrent attachment write nor a sidecar field save", async () => {
    const id = await createSource();
    const stored = (await readSidecar(projectRoot, id)) as Record<
      string,
      unknown
    >;
    const [entry] = await Promise.all([
      addAttachmentCore(projectId, id, pngInput()),
      updateSidecarCore(projectId, id, { ...stored, wordCountGoal: 321 }),
      addAttachmentCore(projectId, id, pngInput("b.png")),
    ]);
    const after = await readSidecar(projectRoot, id);
    expect(after?.wordCountGoal).toBe(321);
    expect(await listAttachmentsCore(projectId, id)).toHaveLength(2);
    expect(
      (await listAttachmentsCore(projectId, id)).some((e) => e.id === entry.id),
    ).toBe(true);
  });
});

describe("revisions cover the body only (FR-25)", () => {
  const revisionFiles = async (id: string): Promise<string[]> => {
    const base = path.join(projectRoot, "revisions", id);
    const out: string[] = [];
    const walk = async (dir: string, prefix: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const rel = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
        else out.push(rel);
      }
    };
    await walk(base, "");
    return out.sort();
  };

  it("lists revisions before and after each operation and after a body save", async () => {
    const id = await createSource();
    const [rev] = await listRevisions(projectRoot, id);
    const base = await revisionFiles(id);
    const count = async (): Promise<number> =>
      (await listRevisions(projectRoot, id)).length;
    expect(await count()).toBe(1);

    const a = await addAttachmentCore(projectId, id, pngInput());
    expect(await revisionFiles(id)).toEqual(base);
    expect(await count()).toBe(1);
    const b = await addAttachmentCore(projectId, id, pngInput("b.png"));
    expect(await revisionFiles(id)).toEqual(base);
    await reorderAttachmentsCore(projectId, id, [b.id, a.id]);
    expect(await revisionFiles(id)).toEqual(base);
    expect(await count()).toBe(1);

    await updateRevisionInPlace(
      projectRoot,
      id,
      rev.id,
      JSON.stringify(doc("a new body")),
    );
    const afterSave = await revisionFiles(id);
    for (const f of afterSave) {
      expect(f).not.toContain(a.fileName);
      expect(f).not.toContain(b.fileName);
    }
    // the body save is the only operation allowed to change the count
    expect(await count()).toBeGreaterThanOrEqual(1);
    const fetched = await fetchResourceContentCore(projectId, id);
    expect(fetched.resourceContent.plaintextContent).toBe("a new body");
    expect((await listAttachmentsCore(projectId, id)).map((e) => e.id)).toEqual(
      [b.id, a.id],
    );
  });

  it("leaves attachments and the list alone on prune, restore and compare", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, pngInput());
    const b = await addAttachmentCore(projectId, id, pngInput("b.png"));
    const [first] = await listRevisions(projectRoot, id);
    const second = await createRevision(projectRoot, id, {
      content: JSON.stringify(doc("second body")),
    });
    const third = await createRevision(projectRoot, id, {
      content: JSON.stringify(doc("third body")),
    });
    const listBefore = await listAttachmentsCore(projectId, id);
    const sidecarBefore = await fs.readFile(
      path.join(projectRoot, "meta", `resource-${id}.meta.json`),
      "utf8",
    );
    const filesBefore = await filesIn(resourceDir(id));

    await readRevision(projectRoot, id, first.id);
    await readRevision(projectRoot, id, third.id);
    await setCanonicalRevision(projectRoot, id, second.versionNumber);
    await pruneRevisions(projectRoot, id, 1);

    expect(await filesIn(resourceDir(id))).toEqual(filesBefore);
    expect(await listAttachmentsCore(projectId, id)).toEqual(listBefore);
    expect(listBefore.map((e) => e.id)).toEqual([a.id, b.id]);
    const sidecarAfter = JSON.parse(
      await fs.readFile(
        path.join(projectRoot, "meta", `resource-${id}.meta.json`),
        "utf8",
      ),
    ) as Record<string, unknown>;
    expect(sidecarAfter.attachments).toEqual(
      (JSON.parse(sidecarBefore) as Record<string, unknown>).attachments,
    );
  });
});

describe("storage discipline (FR-31 a2, FR-34)", () => {
  it("never imports node:fs directly", async () => {
    const source = await fs.readFile(
      path.join(
        process.cwd(),
        "src",
        "lib",
        "models",
        "source-attachments-core.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'](node:)?fs(\/promises)?["']/);
    expect(source).not.toMatch(/require\(\s*["'](node:)?fs/);
    expect(source).toMatch(/from\s+["']\.\/io["']/);
  });
});

describe("attachments in an encrypted project (FR-31 a, a2)", () => {
  const WORKSPACE = "/ws";
  let base: StorageAdapter;
  let keyring: Keyring;
  let encProjectId: string;
  let encRoot: string;
  let ctx: StorageContext;
  let sourceId: string;
  const previousAdapter = io.getStorageAdapter();
  let savedEnv: string | undefined;

  beforeEach(async () => {
    __resetIndexerForTests();
    savedEnv = process.env.GETWRITE_PROJECTS_DIR;
    process.env.GETWRITE_PROJECTS_DIR = WORKSPACE;
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
    sourceId = generateUUID();
    await runInStorageContext(ctx, () =>
      writeSidecar(encRoot, sourceId, {
        id: sourceId,
        slug: "s",
        type: "source",
        name: "S",
        orderIndex: 0,
        folderId: null,
        createdAt: T0,
        updatedAt: T0,
      } as Record<string, MetadataValue>),
    );
  });

  afterEach(() => {
    io.setStorageAdapter(previousAdapter);
    if (savedEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = savedEnv;
    __resetIndexerForTests();
  });

  it("seals the attachment bytes at rest and rethrows locked-access errors", async () => {
    const entry = await runInStorageContext(ctx, () =>
      addAttachmentCore(encProjectId, sourceId, pngInput()),
    );
    const raw = await base.readFileBuffer(
      `${encRoot}/resources/${sourceId}/${entry.fileName}`,
    );
    expect(Buffer.from(raw).includes(Buffer.from(PNG))).toBe(false);

    keyring.lock();
    const locked = (err: unknown): boolean => isLockedAccessError(err);
    await expect(
      runInStorageContext(ctx, () =>
        addAttachmentCore(encProjectId, sourceId, pngInput()),
      ),
    ).rejects.toSatisfy(locked);
    await expect(
      runInStorageContext(ctx, () =>
        listAttachmentsCore(encProjectId, sourceId),
      ),
    ).rejects.toSatisfy(locked);
    await expect(
      runInStorageContext(ctx, () =>
        reorderAttachmentsCore(encProjectId, sourceId, [entry.id]),
      ),
    ).rejects.toSatisfy(locked);
  });
});
