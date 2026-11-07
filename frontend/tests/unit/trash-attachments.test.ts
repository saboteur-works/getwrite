/**
 * Feature 102, Task 24 (FR-25, FR-26, OQ-8): removing or replacing a Source
 * attachment moves the previous file to Trash as the `attachment` item kind,
 * and restore returns it to the end of the Source's list. Purge, empty Trash
 * and the Trash tab entry are covered by the Task 25 block at the end.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  addAttachmentCore,
  listAttachmentsCore,
  removeAttachmentCore,
  replaceAttachmentCore,
  restoreTrashedAttachment,
  AttachmentNotFoundError,
  AttachmentValidationError,
  MAX_ATTACHMENTS_PER_SOURCE,
} from "../../src/lib/models/source-attachments-core";
import {
  createResourceCore,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import {
  purgeResource,
  resolveTrashedItemKind,
  softDeleteResource,
} from "../../src/lib/models/trash";
import {
  listTrashCore,
  purgeBatchCore,
  purgeOneCore,
  restoreOneCore,
} from "../../src/lib/models/trash-core";
import { mutateSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import type { MetadataValue } from "../../src/lib/models/types";
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

const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const PNG2 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7, 6, 5,
]);
const MP3_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 3, 3,
]);
const MP3 = Uint8Array.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0, 9, 9]);

let projectsDir: string;
let projectId: string;
let projectRoot: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-trash-attach-"));
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  projectId = generateUUID();
  projectRoot = path.join(projectsDir, projectId);
  await createAndAssertProject(SPEC_PATH, {
    projectRoot,
    name: "Trash Attachment Test",
  });
});

afterEach(async () => {
  await flushIndexer();
  if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  await removeDirRetry(projectsDir);
});

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

async function listTree(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(d: string): Promise<void> {
    for (const name of await filesIn(d)) {
      const full = path.join(d, name);
      if ((await fs.stat(full)).isDirectory()) await walk(full);
      else out.push(path.relative(dir, full));
    }
  }
  await walk(dir);
  return out;
}

function png(name: string, bytes: Uint8Array = PNG) {
  return { fileName: name, mimeType: "image/png", fileBytes: bytes };
}

describe("remove to Trash and restore", () => {
  it("moves the file out of the Source directory as an attachment-kind entry", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, png("a.png"));
    const { trashId } = await removeAttachmentCore(projectId, id, a.id);

    expect(trashId).toBe(a.id);
    expect(await filesIn(resourceDir(id))).not.toContain(a.fileName);
    expect(await listAttachmentsCore(projectId, id)).toEqual([]);
    expect(await resolveTrashedItemKind(projectRoot, trashId)).toBe(
      "attachment",
    );
    expect(await listTree(path.join(projectRoot, ".trash"))).toEqual(
      expect.arrayContaining([expect.stringContaining(a.fileName)]),
    );
  });

  it("restores the attachment to the Source's list with identical bytes", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, png("a.png"));
    const { trashId } = await removeAttachmentCore(projectId, id, a.id);

    const result = await restoreOneCore(projectRoot, trashId);
    expect(result.ok).toBe(true);

    const listed = await listAttachmentsCore(projectId, id);
    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(a.id);
    const bytes = await fs.readFile(
      path.join(resourceDir(id), listed[0].fileName),
    );
    expect(new Uint8Array(bytes)).toEqual(PNG);
    expect(await resolveTrashedItemKind(projectRoot, trashId)).toBe("unknown");
    expect(await listTree(path.join(projectRoot, ".trash"))).toEqual([]);
  });

  it("restores to the end of the list", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, png("a.png"));
    const b = await addAttachmentCore(projectId, id, png("b.png"));
    const c = await addAttachmentCore(projectId, id, {
      fileName: "c.mp3",
      mimeType: "audio/mpeg",
      fileBytes: MP3,
    });
    const { trashId } = await removeAttachmentCore(projectId, id, a.id);
    expect((await listAttachmentsCore(projectId, id)).map((e) => e.id)).toEqual(
      [b.id, c.id],
    );
    await restoreOneCore(projectRoot, trashId);
    expect((await listAttachmentsCore(projectId, id)).map((e) => e.id)).toEqual(
      [b.id, c.id, a.id],
    );
  });

  it("uses the ' (restored)' suffix on a name clash, then ' (restored 2)'", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, png("photo.png"));
    const first = await removeAttachmentCore(projectId, id, a.id);
    await addAttachmentCore(projectId, id, png("photo.png", PNG2));
    const r1 = await restoreOneCore(projectRoot, first.trashId);
    expect(r1.ok).toBe(true);
    expect(r1.renamed).toBe(true);
    expect(r1.restoredName).toBe("photo.png (restored)");

    // Trash a second "photo.png" while "(restored)" is already listed.
    const c = await addAttachmentCore(projectId, id, png("photo.png", MP3_PNG));
    const second = await removeAttachmentCore(projectId, id, c.id);
    const r2 = await restoreOneCore(projectRoot, second.trashId);
    expect(r2.restoredName).toBe("photo.png (restored 2)");
    const names = (await listAttachmentsCore(projectId, id)).map(
      (e) => e.originalName,
    );
    expect(names).toEqual([
      "photo.png",
      "photo.png (restored)",
      "photo.png (restored 2)",
    ]);
  });

  it("refuses to remove an attachment the Source does not list", async () => {
    const id = await createSource();
    await expect(
      removeAttachmentCore(projectId, id, generateUUID()),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError);
  });
});

describe("replace to Trash and restore", () => {
  it("replaces in place, trashes the previous file, and restoring it keeps its bytes", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, png("a.png"));
    const b = await addAttachmentCore(projectId, id, png("b.png"));

    const { entry, trashId } = await replaceAttachmentCore(
      projectId,
      id,
      a.id,
      png("a2.png", PNG2),
    );
    expect(trashId).toBe(a.id);
    expect(entry.id).not.toBe(a.id);
    expect(entry.originalName).toBe("a2.png");
    const afterReplace = await listAttachmentsCore(projectId, id);
    expect(afterReplace.map((e) => e.id)).toEqual([entry.id, b.id]);
    expect(
      new Uint8Array(
        await fs.readFile(path.join(resourceDir(id), entry.fileName)),
      ),
    ).toEqual(PNG2);
    expect(await filesIn(resourceDir(id))).not.toContain(a.fileName);
    expect(await resolveTrashedItemKind(projectRoot, trashId)).toBe(
      "attachment",
    );

    const restored = await restoreOneCore(projectRoot, trashId);
    expect(restored.ok).toBe(true);
    const listed = await listAttachmentsCore(projectId, id);
    expect(listed.map((e) => e.id)).toEqual([entry.id, b.id, a.id]);
    const old = listed[2];
    expect(
      new Uint8Array(
        await fs.readFile(path.join(resourceDir(id), old.fileName)),
      ),
    ).toEqual(PNG);
  });

  it("refuses an invalid replacement and changes nothing", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, png("a.png"));
    const before = await filesIn(resourceDir(id));
    await expect(
      replaceAttachmentCore(projectId, id, a.id, {
        fileName: "bad.png",
        mimeType: "image/png",
        fileBytes: MP3,
      }),
    ).rejects.toBeInstanceOf(AttachmentValidationError);
    expect(await filesIn(resourceDir(id))).toEqual(before);
    expect(await listTree(path.join(projectRoot, ".trash"))).toEqual([]);
    expect((await listAttachmentsCore(projectId, id)).map((e) => e.id)).toEqual(
      [a.id],
    );
  });

  it("refuses to replace an attachment the Source does not list", async () => {
    const id = await createSource();
    await expect(
      replaceAttachmentCore(projectId, id, generateUUID(), png("x.png")),
    ).rejects.toBeInstanceOf(AttachmentNotFoundError);
    expect(await listTree(path.join(projectRoot, ".trash"))).toEqual([]);
  });
});

describe("restore refusal", () => {
  async function trashedEntry() {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, png("a.png"));
    const { trashId } = await removeAttachmentCore(projectId, id, a.id);
    return { id, trashId };
  }

  it("refuses with a message and keeps the entry when the Source is in Trash", async () => {
    const { id, trashId } = await trashedEntry();
    await softDeleteResource(projectRoot, id);
    const before = await listTree(path.join(projectRoot, ".trash"));

    const result = await restoreOneCore(projectRoot, trashId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Source/);
    expect(result.error).not.toBe("Not found in trash");
    expect(await resolveTrashedItemKind(projectRoot, trashId)).toBe(
      "attachment",
    );
    expect(await listTree(path.join(projectRoot, ".trash"))).toEqual(before);
  });

  it("refuses with a message and keeps the entry when the Source is purged", async () => {
    const { id, trashId } = await trashedEntry();
    await softDeleteResource(projectRoot, id);
    await purgeResource(projectRoot, id);

    const result = await restoreOneCore(projectRoot, trashId);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Source/);
    expect(await resolveTrashedItemKind(projectRoot, trashId)).toBe(
      "attachment",
    );
  });

  it("refuses at the cap and keeps the entry", async () => {
    const { id, trashId } = await trashedEntry();
    const fillers = Array.from({ length: MAX_ATTACHMENTS_PER_SOURCE }, () => ({
      id: generateUUID(),
      fileName: `attachment-${generateUUID()}.png`,
      originalName: "f.png",
      mime: "image/png",
      size: 1,
      addedAt: new Date().toISOString(),
    }));
    await mutateSidecar(projectRoot, id, (current) => ({
      ...(current as Record<string, MetadataValue>),
      attachments: fillers as unknown as MetadataValue,
    }));
    await expect(
      restoreTrashedAttachment(projectRoot, trashId),
    ).rejects.toThrow(/at most/);
    expect(await resolveTrashedItemKind(projectRoot, trashId)).toBe(
      "attachment",
    );
  });

  it("reports an unknown attachment id as not found", async () => {
    const result = await restoreOneCore(projectRoot, generateUUID());
    expect(result).toMatchObject({ ok: false, error: "Not found in trash" });
  });
});

describe("revisions", () => {
  it("creates no revision and copies no bytes into revisions/ on remove, replace or restore", async () => {
    const id = await createSource();
    const revDir = path.join(projectRoot, "revisions", id);
    const baseline = await listTree(revDir);
    const a = await addAttachmentCore(projectId, id, png("a.png"));

    const removed = await removeAttachmentCore(projectId, id, a.id);
    expect(await listTree(revDir)).toEqual(baseline);
    await restoreOneCore(projectRoot, removed.trashId);
    expect(await listTree(revDir)).toEqual(baseline);
    const replaced = await replaceAttachmentCore(
      projectId,
      id,
      a.id,
      png("n.png", PNG2),
    );
    expect(await listTree(revDir)).toEqual(baseline);
    await restoreOneCore(projectRoot, replaced.trashId);
    expect(await listTree(revDir)).toEqual(baseline);
    expect(
      (await listTree(path.join(projectRoot, "revisions"))).filter((f) =>
        f.includes("attachment-"),
      ),
    ).toEqual([]);
  });
});

describe("Trash list", () => {
  it("keeps resources and folders unchanged and adds the attachments list (Task 25)", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, png("a.png"));
    await removeAttachmentCore(projectId, id, a.id);
    const listed = await listTrashCore(projectRoot);
    expect(Object.keys(listed).sort()).toEqual([
      "attachments",
      "folders",
      "resources",
    ]);
    expect(listed.resources).toEqual([]);
    expect(listed.folders).toEqual([]);
  });

  it("keeps the sidecar write path unaffected by a concurrent field save", async () => {
    const id = await createSource();
    const a = await addAttachmentCore(projectId, id, png("a.png"));
    await Promise.all([
      removeAttachmentCore(projectId, id, a.id),
      updateSidecarCore(projectId, id, { userMetadata: { k: "v" } }),
    ]);
    expect(await listAttachmentsCore(projectId, id)).toEqual([]);
  });
});

describe("purge, empty Trash and listing (Task 25, FR-26)", () => {
  async function trashOne(sourceId: string, name: string) {
    const a = await addAttachmentCore(projectId, sourceId, png(name));
    const { trashId } = await removeAttachmentCore(projectId, sourceId, a.id);
    return trashId;
  }

  it("purging an attachment entry deletes its file and leaves nothing in .trash/", async () => {
    const id = await createSource();
    const trashId = await trashOne(id, "a.png");
    expect(await listTree(path.join(projectRoot, ".trash"))).not.toEqual([]);

    const result = await purgeOneCore(projectRoot, trashId);
    expect(result).toEqual({ id: trashId, ok: true });
    expect(await listTree(path.join(projectRoot, ".trash"))).toEqual([]);
    expect(
      await filesIn(path.join(projectRoot, ".trash", "attachments")),
    ).toEqual([]);
    expect(await resolveTrashedItemKind(projectRoot, trashId)).toBe("unknown");
  });

  it("empty Trash ({ all: true }) removes every attachment entry and file", async () => {
    const id = await createSource();
    const other = await createSource();
    const t1 = await trashOne(id, "a.png");
    const t2 = await trashOne(id, "b.png");
    const t3 = await trashOne(other, "c.png");

    const results = await purgeBatchCore(projectRoot, { all: true });
    expect(results.map((r) => r.id).sort()).toEqual([t1, t2, t3].sort());
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await listTree(path.join(projectRoot, ".trash"))).toEqual([]);
    const listing = await listTrashCore(projectRoot);
    expect(listing.attachments).toEqual([]);
  });

  it("lists an attachment entry as 'Attachment of <Source name>'", async () => {
    const id = await createSource();
    const trashId = await trashOne(id, "a.png");
    const listing = await listTrashCore(projectRoot);
    expect(listing.attachments).toHaveLength(1);
    expect(listing.attachments[0]).toMatchObject({
      id: trashId,
      sourceId: id,
      sourceName: "Interview",
      fileName: "a.png",
      label: "Attachment of Interview",
    });
  });

  it("names the Source from its trashed sidecar while the Source is in Trash", async () => {
    const id = await createSource();
    const trashId = await trashOne(id, "a.png");
    await softDeleteResource(projectRoot, id);
    const listing = await listTrashCore(projectRoot);
    const entry = listing.attachments.find((e) => e.id === trashId);
    expect(entry?.label).toBe("Attachment of Interview");
  });

  it("uses a non-blank fallback label when the Source has been purged", async () => {
    const id = await createSource();
    const trashId = await trashOne(id, "a.png");
    await softDeleteResource(projectRoot, id);
    await purgeResource(projectRoot, id);
    const listing = await listTrashCore(projectRoot);
    const entry = listing.attachments.find((e) => e.id === trashId);
    expect(entry?.sourceName).toBeNull();
    expect(entry?.label).toBe("Attachment of a deleted Source");
  });

  it("purges an entry whose Source is already purged", async () => {
    const id = await createSource();
    const trashId = await trashOne(id, "a.png");
    await softDeleteResource(projectRoot, id);
    await purgeResource(projectRoot, id);
    expect((await purgeOneCore(projectRoot, trashId)).ok).toBe(true);
    expect(await listTree(path.join(projectRoot, ".trash"))).toEqual([]);
  });

  it("leaves other kinds untouched when an attachment is purged", async () => {
    const id = await createSource();
    const other = await createSource();
    const trashId = await trashOne(id, "a.png");
    await softDeleteResource(projectRoot, other);
    await purgeOneCore(projectRoot, trashId);
    const listing = await listTrashCore(projectRoot);
    expect(listing.resources.map((r) => r.id)).toEqual([other]);
    expect(listing.attachments).toEqual([]);
  });
});
