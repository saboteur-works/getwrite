/**
 * Feature 105 Task 2: the resource-level byte read, with an in-memory fake
 * adapter whose `stat` and `readFileBuffer` are spies. A new file because the
 * existing attachment-bytes tests run on the real file system and cannot spy
 * the adapter's `stat` size or count reads.
 */
import fs from "node:fs";
import path from "node:path";
import type { Stats } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as io from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { ProjectLockedError } from "../../src/lib/models/crypto/locked-errors";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import {
  ANDROID_VERIFIED_MAX_MEDIA_READ_BYTES,
  mediaTooLargeToShowMessage,
} from "../../src/lib/models/media-validation";
import {
  readResourceBytesCore,
  ResourceBytesFailedError,
  ResourceBytesMissingError,
  ResourceBytesTooLargeError,
  ResourceBytesTypeError,
  ResourceBytesNotFoundError,
  InvalidResourceBytesIdError,
} from "../../src/lib/models/resource-bytes-core";
import { generateUUID } from "../../src/lib/models/uuid";

const PROJECTS_DIR = "/mem-projects";
const projectId = generateUUID();
const projectRoot = path.join(PROJECTS_DIR, projectId);
const BYTES = Buffer.from([1, 2, 3, 4, 5]);

let base: StorageAdapter;
let statSize: unknown;
let statSpy: ReturnType<typeof vi.fn>;
let readSpy: ReturnType<typeof vi.fn>;
let writeSpy: ReturnType<typeof vi.fn>;
let previous: StorageAdapter;
let previousEnv: string | undefined;

/** Seeds a sidecar (and optionally the file) through the unspied adapter. */
async function seeded(
  sidecar: Record<string, unknown>,
  fileName?: string,
): Promise<string> {
  const id = generateUUID();
  await base.mkdir(path.join(projectRoot, "meta"), { recursive: true });
  await base.writeFile(
    path.join(projectRoot, "meta", `resource-${id}.meta.json`),
    JSON.stringify({ id, ...sidecar }),
  );
  if (fileName) {
    await base.mkdir(path.join(projectRoot, "resources", id), {
      recursive: true,
    });
    await base.writeFile(
      path.join(projectRoot, "resources", id, fileName),
      BYTES,
    );
  }
  return id;
}

beforeEach(() => {
  previousEnv = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = PROJECTS_DIR;
  previous = io.getStorageAdapter();
  base = createMemoryAdapter();
  statSize = BYTES.byteLength;
  statSpy = vi.fn(async (p: string): Promise<Stats> => {
    await base.stat(p);
    return { size: statSize } as unknown as Stats;
  });
  readSpy = vi.fn((p: string) => base.readFileBuffer(p));
  writeSpy = vi.fn();
  const fake: StorageAdapter = {
    ...base,
    stat: statSpy as unknown as StorageAdapter["stat"],
    readFileBuffer: readSpy as unknown as StorageAdapter["readFileBuffer"],
    writeFile: writeSpy as unknown as StorageAdapter["writeFile"],
    rm: writeSpy as unknown as StorageAdapter["rm"],
    rename: writeSpy as unknown as StorageAdapter["rename"],
    mkdir: writeSpy as unknown as StorageAdapter["mkdir"],
  };
  io.setStorageAdapter(fake);
});

afterEach(() => {
  io.setStorageAdapter(previous);
  if (previousEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = previousEnv;
});

describe("readResourceBytesCore", () => {
  it("returns the file's bytes, mime from the extension and the kind from the sidecar type", async () => {
    const png = await seeded({ type: "image", file: "pic.PNG" }, "pic.PNG");
    const result = await readResourceBytesCore(projectId, png);
    expect(result.kind).toBe("image");
    expect(result.mime).toBe("image/png");
    expect(result.size).toBe(BYTES.byteLength);
    expect(Buffer.from(result.bytes).equals(BYTES)).toBe(true);
    const mp3 = await seeded({ type: "audio", file: "a.mp3" }, "a.mp3");
    const audio = await readResourceBytesCore(projectId, mp3);
    expect(audio.kind).toBe("audio");
    expect(audio.mime).toBe("audio/mpeg");
  });

  it("makes no leading-byte check: bytes that are not a PNG are returned for a .png", async () => {
    const id = await seeded({ type: "image", file: "x.png" }, "x.png");
    const result = await readResourceBytesCore(projectId, id);
    expect(result.mime).toBe("image/png");
    expect(result.bytes.byteLength).toBe(5);
  });

  it("falls back to application/octet-stream for an unknown extension, as the file route does", async () => {
    const id = await seeded({ type: "image", file: "x.zzz" }, "x.zzz");
    expect((await readResourceBytesCore(projectId, id)).mime).toBe(
      "application/octet-stream",
    );
  });

  it.each(["../x", "..\\x", "", "a/b", "not-a-uuid"])(
    "refuses the malformed resource id %j before any adapter call",
    async (bad) => {
      await expect(
        readResourceBytesCore(projectId, bad),
      ).rejects.toBeInstanceOf(InvalidResourceBytesIdError);
      expect(statSpy).not.toHaveBeenCalled();
      expect(readSpy).not.toHaveBeenCalled();
    },
  );

  it("refuses a malformed project id", async () => {
    await expect(readResourceBytesCore("../x", generateUUID())).rejects.toThrow(
      "Invalid projectId",
    );
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("reports an unknown resource as not found", async () => {
    await expect(
      readResourceBytesCore(projectId, generateUUID()),
    ).rejects.toBeInstanceOf(ResourceBytesNotFoundError);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it.each(["text", "source", "folder"])(
    "refuses a resource of type %s",
    async (type) => {
      const id = await seeded({ type, file: "x.png" }, "x.png");
      await expect(readResourceBytesCore(projectId, id)).rejects.toBeInstanceOf(
        ResourceBytesTypeError,
      );
      expect(statSpy).not.toHaveBeenCalled();
      expect(readSpy).not.toHaveBeenCalled();
    },
  );

  it.each(["../x.png", "a/b.png", "..", ".", "a\\b.png", "a\0b.png"])(
    "refuses the stored file name %j before any read",
    async (file) => {
      const id = await seeded({ type: "image", file });
      await expect(readResourceBytesCore(projectId, id)).rejects.toBeInstanceOf(
        ResourceBytesFailedError,
      );
      expect(statSpy).not.toHaveBeenCalled();
      expect(readSpy).not.toHaveBeenCalled();
    },
  );

  it("reports a media resource with no stored file name as a missing file", async () => {
    const id = await seeded({ type: "image" });
    await expect(readResourceBytesCore(projectId, id)).rejects.toBeInstanceOf(
      ResourceBytesMissingError,
    );
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("returns bytes at exactly 31,457,280 bytes of stat size", async () => {
    const id = await seeded({ type: "image", file: "x.png" }, "x.png");
    statSize = 31_457_280;
    expect(ANDROID_VERIFIED_MAX_MEDIA_READ_BYTES).toBe(31_457_280);
    const result = await readResourceBytesCore(projectId, id);
    expect(result.kind).toBe("image");
    expect(readSpy).toHaveBeenCalledTimes(1);
  });

  it("refuses 31,457,281 bytes by stat size and never reads the file", async () => {
    const id = await seeded({ type: "image", file: "x.png" }, "x.png");
    statSize = 31_457_281;
    const err = await readResourceBytesCore(projectId, id).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ResourceBytesTooLargeError);
    expect((err as ResourceBytesTooLargeError).sizeBytes).toBe(31_457_281);
    expect((err as Error).message).toBe(mediaTooLargeToShowMessage(31_457_281));
    expect(statSpy).toHaveBeenCalledTimes(1);
    expect(readSpy).toHaveBeenCalledTimes(0);
  });

  it.each([undefined, null, "100", Number.NaN, -1])(
    "treats a stat size of %j as a failure, not zero, and does not read",
    async (bad) => {
      const id = await seeded({ type: "audio", file: "x.mp3" }, "x.mp3");
      statSize = bad;
      await expect(readResourceBytesCore(projectId, id)).rejects.toBeInstanceOf(
        ResourceBytesFailedError,
      );
      expect(readSpy).not.toHaveBeenCalled();
    },
  );

  it("maps a missing file (ENOENT on stat) to the missing-file error, never empty bytes", async () => {
    const id = await seeded({ type: "image", file: "gone.png" });
    await expect(readResourceBytesCore(projectId, id)).rejects.toBeInstanceOf(
      ResourceBytesMissingError,
    );
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("maps ENOENT on the read to the missing-file error", async () => {
    const id = await seeded({ type: "image", file: "x.png" }, "x.png");
    readSpy.mockRejectedValueOnce(
      Object.assign(new Error("gone"), { code: "ENOENT" }),
    );
    await expect(readResourceBytesCore(projectId, id)).rejects.toBeInstanceOf(
      ResourceBytesMissingError,
    );
  });

  it("lets any other read error through unchanged", async () => {
    const id = await seeded({ type: "image", file: "x.png" }, "x.png");
    const boom = Object.assign(new Error("io"), { code: "EIO" });
    readSpy.mockRejectedValueOnce(boom);
    await expect(readResourceBytesCore(projectId, id)).rejects.toBe(boom);
  });

  it("propagates a locked-access error from stat uncaught", async () => {
    const id = await seeded({ type: "image", file: "x.png" }, "x.png");
    const locked = new ProjectLockedError(projectId);
    statSpy.mockRejectedValueOnce(locked);
    const err = await readResourceBytesCore(projectId, id).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBe(locked);
    expect(isLockedAccessError(err)).toBe(true);
    expect(readSpy).not.toHaveBeenCalled();
  });

  it("writes nothing, removes nothing and takes no lock", async () => {
    const id = await seeded({ type: "image", file: "x.png" }, "x.png");
    await readResourceBytesCore(projectId, id);
    expect(writeSpy).not.toHaveBeenCalled();
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/models/resource-bytes-core.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from "react"/);
    expect(source).not.toMatch(/withFileLock|withLock|mutateSidecar/);
    expect(source).not.toMatch(/\b(writeFile|rm|rename|atomicWriteFile)\(/);
  });
});
