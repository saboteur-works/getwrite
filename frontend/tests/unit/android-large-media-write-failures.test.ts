/**
 * android-large-media-writes Task 4: a chunked (multi-piece) binary write that
 * fails part-way, run through the real cores over `capacitorFsAdapter` and the
 * failing Capacitor Filesystem fake. Add and replace leave the Source as it
 * was; a failed create leaves no resource directory; the error raised is
 * always the original piece error.
 *
 * New file rather than an extension of an existing core test: the existing
 * source-attachment / resource-crud core tests run on a real temp directory,
 * and none binds a Capacitor-backed StorageAdapter.
 */
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import {
  capacitorFsAdapter,
  CAPACITOR_WRITE_PIECE_BYTES,
} from "../../src/lib/models/capacitorFsAdapter";
import {
  createFakeCapacitorFilesystem,
  type CapacitorFilesystemLike,
} from "../../src/lib/models/capacitor-filesystem";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  addAttachmentCore,
  listAttachmentsCore,
  replaceAttachmentCore,
} from "../../src/lib/models/source-attachments-core";
import { uploadMediaResourceCore } from "../../src/lib/models/resource-crud-core";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { createFailingCapacitorFs } from "../helpers/failing-capacitor-fs";

const PROJECTS = "/projects";
/** Three pieces: 4 MiB + 4 MiB + 1 MiB. */
const BIG_BYTES = CAPACITOR_WRITE_PIECE_BYTES * 2 + 1_048_576;
const PIECES = [
  ["first", 1],
  ["middle", 2],
  ["last", 3],
] as const;
const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngBytes(size: number, fill: number): Uint8Array {
  const bytes = new Uint8Array(size).fill(fill);
  bytes.set(PNG_HEAD, 0);
  return bytes;
}

/** The media files a test writes: only these count toward the failing piece. */
const isMediaPath = (p: string): boolean =>
  /\/(attachment-[^/]+|original)\.png$/.test(p);

interface ArmOptions {
  failAtPiece: number;
  error: Error;
  deleteError?: Error;
  rmdirError?: Error;
}

interface Harness {
  inner: CapacitorFilesystemLike;
  projectId: string;
  projectRoot: string;
  /** Arms the failure for media writes from now on. */
  arm: (opts: ArmOptions) => { deleteAttempts: () => number };
  run: <T>(fn: () => Promise<T>) => Promise<T>;
}

function createHarness(): Harness {
  const inner = createFakeCapacitorFilesystem();
  const projectId = generateUUID();
  const projectRoot = path.join(PROJECTS, projectId);
  let active: CapacitorFilesystemLike = inner;
  const routed: CapacitorFilesystemLike = {
    ...inner,
    writeFile: (o) =>
      isMediaPath(o.path) ? active.writeFile(o) : inner.writeFile(o),
    appendFile: (o) =>
      isMediaPath(o.path) ? active.appendFile(o) : inner.appendFile(o),
    deleteFile: (o) => active.deleteFile(o),
    rmdir: (o) => active.rmdir(o),
  };
  const adapter = capacitorFsAdapter(routed);
  return {
    inner,
    projectId,
    projectRoot,
    arm: (opts) => {
      const failing = createFailingCapacitorFs(
        {
          failAtPiece: opts.failAtPiece,
          error: opts.error,
          deleteError: opts.deleteError,
        },
        inner,
      );
      active = opts.rmdirError
        ? {
            ...failing.fs,
            rmdir: async () => {
              throw opts.rmdirError;
            },
          }
        : failing.fs;
      return { deleteAttempts: failing.deleteAttempts };
    },
    run: (fn) => runInStorageContext({ tenantRoot: PROJECTS, adapter }, fn),
  };
}

async function seedSource(h: Harness): Promise<string> {
  const resourceId = generateUUID();
  await writeSidecar(h.projectRoot, resourceId, {
    id: resourceId,
    name: "Src",
    type: "source",
  });
  return resourceId;
}

async function seedProject(h: Harness): Promise<void> {
  await h.inner.mkdir({ path: `projects/${h.projectId}`, recursive: true });
  await h.inner.writeFile({
    path: `projects/${h.projectId}/project.json`,
    data: Buffer.from("{}").toString("base64"),
    recursive: true,
  });
}

async function listNames(h: Harness, rel: string): Promise<string[]> {
  try {
    const { files } = await h.inner.readdir({
      path: `projects/${h.projectId}/${rel}`,
    });
    return files.map((f) => f.name).sort();
  } catch {
    return [];
  }
}

const input = (bytes: Uint8Array) => ({
  fileName: "big.png",
  mimeType: "image/png",
  fileBytes: bytes,
});

describe("addAttachmentCore: chunked write failure", () => {
  it.each(PIECES)(
    "fails at the %s piece: no file, no new entry, original error",
    async (_name, piece) => {
      const h = createHarness();
      await h.run(async () => {
        const rid = await seedSource(h);
        const before = await readSidecar(h.projectRoot, rid);
        const boom = new Error(`piece ${piece} failed`);
        h.arm({ failAtPiece: piece, error: boom });

        await expect(
          addAttachmentCore(h.projectId, rid, input(pngBytes(BIG_BYTES, 7))),
        ).rejects.toBe(boom);

        expect(await listNames(h, `resources/${rid}`)).toEqual([]);
        expect(await readSidecar(h.projectRoot, rid)).toEqual(before);
        expect(await listAttachmentsCore(h.projectId, rid)).toEqual([]);
      });
    },
  );
});

describe("replaceAttachmentCore: chunked write failure", () => {
  it.each(PIECES)(
    "fails at the %s piece: previous attachment restored, original error",
    async (_name, piece) => {
      const h = createHarness();
      await h.run(async () => {
        const rid = await seedSource(h);
        const added = await addAttachmentCore(
          h.projectId,
          rid,
          input(pngBytes(64, 3)),
        );
        const oldPath = `projects/${h.projectId}/resources/${rid}/${added.fileName}`;
        const beforeSidecar = await readSidecar(h.projectRoot, rid);
        const beforeFiles = await listNames(h, `resources/${rid}`);
        const beforeBytes = (await h.inner.readFile({ path: oldPath })).data;
        const boom = new Error(`piece ${piece} failed`);
        h.arm({ failAtPiece: piece, error: boom });

        await expect(
          replaceAttachmentCore(
            h.projectId,
            rid,
            added.id,
            input(pngBytes(BIG_BYTES, 9)),
          ),
        ).rejects.toBe(boom);

        expect((await h.inner.readFile({ path: oldPath })).data).toBe(
          beforeBytes,
        );
        expect(await listNames(h, `resources/${rid}`)).toEqual(beforeFiles);
        expect(await readSidecar(h.projectRoot, rid)).toEqual(beforeSidecar);
        expect(await listAttachmentsCore(h.projectId, rid)).toEqual([added]);
      });
    },
  );
});

describe("uploadMediaResourceCore: chunked write failure", () => {
  const upload = (bytes: Uint8Array, projectId: string) =>
    uploadMediaResourceCore(projectId, {
      fileBytes: bytes,
      fileName: "big.png",
      mimeType: "image/png",
      fileSize: bytes.byteLength,
    });

  it.each(PIECES)(
    "fails at the %s piece: no resource directory, original error",
    async (_name, piece) => {
      const h = createHarness();
      await h.run(async () => {
        await seedProject(h);
        const boom = new Error(`piece ${piece} failed`);
        h.arm({ failAtPiece: piece, error: boom });

        await expect(upload(pngBytes(BIG_BYTES, 5), h.projectId)).rejects.toBe(
          boom,
        );

        expect(await listNames(h, "resources")).toEqual([]);
      });
    },
  );

  it("raises the original error when a partial-file delete also fails", async () => {
    const h = createHarness();
    await h.run(async () => {
      await seedProject(h);
      const boom = new Error("piece 2 failed");
      const armed = h.arm({
        failAtPiece: 2,
        error: boom,
        deleteError: new Error("delete failed"),
      });

      await expect(upload(pngBytes(BIG_BYTES, 5), h.projectId)).rejects.toBe(
        boom,
      );
      expect(armed.deleteAttempts()).toBeGreaterThan(0);
    });
  });

  it("swallows a directory-removal failure and still raises the original error", async () => {
    const h = createHarness();
    await h.run(async () => {
      await seedProject(h);
      const boom = new Error("piece 2 failed");
      h.arm({
        failAtPiece: 2,
        error: boom,
        rmdirError: new Error("rmdir failed"),
      });

      await expect(upload(pngBytes(BIG_BYTES, 5), h.projectId)).rejects.toBe(
        boom,
      );
    });
  });

  it("a successful multi-piece create is unchanged", async () => {
    const h = createHarness();
    await h.run(async () => {
      await seedProject(h);
      const bytes = pngBytes(BIG_BYTES, 5);
      const resource = await upload(bytes, h.projectId);
      const dir = `projects/${h.projectId}/resources/${resource.id}`;
      expect(await listNames(h, `resources/${resource.id}`)).toEqual([
        "original.png",
      ]);
      const stored = Buffer.from(
        (await h.inner.readFile({ path: `${dir}/original.png` })).data,
        "base64",
      );
      expect(stored.equals(Buffer.from(bytes))).toBe(true);
      expect((await readSidecar(h.projectRoot, resource.id))?.id).toBe(
        resource.id,
      );
    });
  });
});
