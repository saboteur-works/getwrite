/**
 * Android large-media writes, Task 6: an oversized file is refused before its
 * bytes are read into memory (`file.arrayBuffer()`), on the native Source
 * attachment backend and on the shared `uploadMediaResource` client when the
 * runtime is native. The non-native path keeps its order (read, then the
 * server validates).
 *
 * The native cap (31,457,280) is reached with a small real `File` whose `size`
 * getter is overridden and whose `arrayBuffer` is spied, so no 30 MiB buffer
 * is allocated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { maxMediaFileBytes } from "../../src/lib/models/media-validation";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { AttachmentValidationError } from "../../src/lib/models/source-attachments-core";
import { MediaUploadValidationError } from "../../src/lib/models/resource-crud-core";
import { createNativeAttachmentsTransport } from "../../src/store/transport/native-source-attachments-backend";
import { createNativeResourcesTransport } from "../../src/store/transport/native-resource-backend";

const uploadMedia = vi.fn();
vi.mock("../../src/store/transport/native-resource-backend", async (orig) => {
  const actual =
    await orig<
      typeof import("../../src/store/transport/native-resource-backend")
    >();
  return {
    ...actual,
    createNativeResourcesTransport: (
      ...args: Parameters<typeof actual.createNativeResourcesTransport>
    ) => {
      const real = actual.createNativeResourcesTransport(...args);
      return args.length === 0 ? { ...real, uploadMedia } : real;
    },
  };
});

const { uploadMediaResource } = await import("../../src/lib/api/resources");

const PROJECTS_DIR = "/projects";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const TOO_LARGE = "File exceeds the 30 MB limit.";
const TOO_LARGE_NON_NATIVE = "File exceeds the 100 MB limit.";

function fileOfSize(name: string, type: string, size: number) {
  const file = new File([new Uint8Array(PNG_SIGNATURE)], name, { type });
  Object.defineProperty(file, "size", { get: () => size });
  const arrayBuffer = vi.spyOn(file, "arrayBuffer");
  return { file, arrayBuffer };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
  uploadMedia.mockReset();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await flushIndexer();
});

async function seedSource() {
  const nativeFs = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(nativeFs);
  const projectId = generateUUID();
  const root = `${PROJECTS_DIR}/${projectId}`;
  await adapter.mkdir(root, { recursive: true });
  await adapter.writeFile(
    `${root}/project.json`,
    JSON.stringify({ id: projectId, name: "p" }),
  );
  const deps = { fs: nativeFs, projectsDir: PROJECTS_DIR };
  const sourceId = (
    await createNativeResourcesTransport(deps).create(projectId, {
      type: "source",
      name: "S",
      text: { plainText: "words" },
    })
  ).resource.id;
  return {
    projectId,
    sourceId,
    transport: createNativeAttachmentsTransport(deps),
  };
}

describe("native Source attachment backend", () => {
  it("refuses one byte over the cap without reading the file", async () => {
    const { projectId, sourceId, transport } = await seedSource();
    const { file, arrayBuffer } = fileOfSize(
      "a.png",
      "image/png",
      maxMediaFileBytes() + 1,
    );
    await expect(
      transport.addAttachment(projectId, sourceId, file),
    ).rejects.toMatchObject({
      name: "AttachmentValidationError",
      reason: "file-too-large",
      message: TOO_LARGE,
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("refuses a replace one byte over the cap without reading the file", async () => {
    const { projectId, sourceId, transport } = await seedSource();
    const { file, arrayBuffer } = fileOfSize(
      "a.png",
      "image/png",
      maxMediaFileBytes() + 1,
    );
    const attachmentId = generateUUID();
    const rejection = transport.replaceAttachment(
      projectId,
      sourceId,
      attachmentId,
      file,
    );
    await expect(rejection).rejects.toBeInstanceOf(AttachmentValidationError);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("reads a file exactly at the cap once and adds it", async () => {
    const { projectId, sourceId, transport } = await seedSource();
    const { file, arrayBuffer } = fileOfSize(
      "a.png",
      "image/png",
      maxMediaFileBytes(),
    );
    const entry = await transport.addAttachment(projectId, sourceId, file);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(entry.originalName).toBe("a.png");
  });
});

describe("uploadMediaResource (native runtime)", () => {
  it("refuses one byte over the cap without reading the file", async () => {
    const { file, arrayBuffer } = fileOfSize(
      "a.png",
      "image/png",
      maxMediaFileBytes() + 1,
    );
    await expect(uploadMediaResource("p", file)).rejects.toMatchObject({
      name: "MediaUploadValidationError",
      reason: "file-too-large",
      message: TOO_LARGE,
    });
    await expect(uploadMediaResource("p", file)).rejects.toBeInstanceOf(
      MediaUploadValidationError,
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(uploadMedia).not.toHaveBeenCalled();
  });

  it("reads a file exactly at the cap once and hands it to the backend", async () => {
    uploadMedia.mockResolvedValue({ resource: { id: "r" } });
    const { file, arrayBuffer } = fileOfSize(
      "a.png",
      "image/png",
      maxMediaFileBytes(),
    );
    await uploadMediaResource("p", file);
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(uploadMedia).toHaveBeenCalledTimes(1);
  });
});

describe("uploadMediaResource (non-native runtime)", () => {
  it("still reads the file and lets the server decide, at the 100 MiB cap", async () => {
    vi.unstubAllEnvs();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: TOO_LARGE_NON_NATIVE,
          reason: "file-too-large",
        }),
      } as Response);
    const { file, arrayBuffer } = fileOfSize(
      "a.png",
      "image/png",
      100 * 1024 * 1024 + 1,
    );
    await expect(uploadMediaResource("p", file)).rejects.toThrow(
      TOO_LARGE_NON_NATIVE,
    );
    expect(arrayBuffer).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });
});
