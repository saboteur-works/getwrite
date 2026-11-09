/**
 * Feature 105 Task 3: the resource byte-read client, native backend, web-stub
 * and web-bundle exclusion. The native read runs over an in-memory fake
 * Capacitor filesystem; nothing here is a device run. New file because the
 * existing attachment-bytes tests are attachment-specific and an unrelated
 * transport file would be the wrong home.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as nativeBackend from "../../src/store/transport/native-resource-bytes-backend";
import * as webStub from "../../src/store/transport/native-resource-bytes-backend.web-stub";
import * as bytesCore from "../../src/lib/models/resource-bytes-core";
import {
  readResourceBytes,
  ResourceBytesUnsupportedError,
} from "../../src/lib/api/resource-bytes";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import {
  isLockedAccessError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { generateUUID } from "../../src/lib/models/uuid";
import { ANDROID_VERIFIED_MAX_MEDIA_READ_BYTES } from "../../src/lib/models/media-validation";

const PROJECTS_DIR = "/projects";
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function seedImage(): Promise<{
  deps: {
    fs: ReturnType<typeof createFakeCapacitorFilesystem>;
    projectsDir: string;
  };
  projectId: string;
  resourceId: string;
}> {
  const nativeFs = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(nativeFs);
  const projectId = generateUUID();
  const resourceId = generateUUID();
  const root = `${PROJECTS_DIR}/${projectId}`;
  await adapter.mkdir(`${root}/meta`, { recursive: true });
  await adapter.mkdir(`${root}/resources/${resourceId}`, { recursive: true });
  await adapter.writeFile(
    `${root}/project.json`,
    JSON.stringify({ id: projectId, name: "p" }),
  );
  await adapter.writeFile(
    `${root}/meta/resource-${resourceId}.meta.json`,
    JSON.stringify({ id: resourceId, type: "image", file: "pic.png" }),
  );
  await adapter.writeFile(
    `${root}/resources/${resourceId}/pic.png`,
    Buffer.from(PNG),
  );
  return {
    deps: { fs: nativeFs, projectsDir: PROJECTS_DIR },
    projectId,
    resourceId,
  };
}

describe("native resource byte-read backend", () => {
  it("reads an image resource over the in-memory filesystem", async () => {
    const { deps, projectId, resourceId } = await seedImage();
    const view = await nativeBackend
      .createNativeResourceBytesTransport(deps)
      .readResourceBytes(projectId, resourceId);
    expect(view.kind).toBe("image");
    expect(view.mime).toBe("image/png");
    expect(Buffer.from(view.bytes).equals(Buffer.from(PNG))).toBe(true);
  });

  it("establishes the storage context; a context-less core call fails closed", async () => {
    const { projectId, resourceId } = await seedImage();
    await expect(
      bytesCore.readResourceBytesCore(projectId, resourceId),
    ).rejects.toThrow();
  });

  it("returns the typed refusal error unchanged", async () => {
    const { deps, projectId, resourceId } = await seedImage();
    const refusal = new bytesCore.ResourceBytesTooLargeError(
      ANDROID_VERIFIED_MAX_MEDIA_READ_BYTES + 1,
    );
    vi.spyOn(bytesCore, "readResourceBytesCore").mockRejectedValue(refusal);
    await expect(
      nativeBackend
        .createNativeResourceBytesTransport(deps)
        .readResourceBytes(projectId, resourceId),
    ).rejects.toBe(refusal);
  });

  it("returns the typed failure error unchanged", async () => {
    const { deps, projectId, resourceId } = await seedImage();
    const failure = new bytesCore.ResourceBytesFailedError();
    vi.spyOn(bytesCore, "readResourceBytesCore").mockRejectedValue(failure);
    await expect(
      nativeBackend
        .createNativeResourceBytesTransport(deps)
        .readResourceBytes(projectId, resourceId),
    ).rejects.toBe(failure);
  });

  it("propagates a locked-access error unchanged", async () => {
    const { deps, projectId, resourceId } = await seedImage();
    vi.spyOn(bytesCore, "readResourceBytesCore").mockRejectedValue(
      new ProjectLockedError(projectId),
    );
    const err = await nativeBackend
      .createNativeResourceBytesTransport(deps)
      .readResourceBytes(projectId, resourceId)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isLockedAccessError(err)).toBe(true);
  });
});

describe("readResourceBytes runtime dispatch", () => {
  it("native: calls the in-process core and returns its result", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const result = {
      kind: "image" as const,
      mime: "image/png",
      size: 1,
      bytes: Uint8Array.from([1]),
    };
    const core = vi
      .spyOn(bytesCore, "readResourceBytesCore")
      .mockResolvedValue(result);
    // The production runner awaits the native bootstrap; stub it out.
    const bootstrap = await import("../../src/lib/models/native-bootstrap");
    vi.spyOn(bootstrap, "ensureNativeStorageContext").mockResolvedValue(
      undefined as never,
    );
    await expect(readResourceBytes("p", "r")).resolves.toBe(result);
    expect(core).toHaveBeenCalledWith("p", "r");
  });

  it("not native: never calls the native backend or fetch, rejects with the typed unsupported error", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    const core = vi.spyOn(bytesCore, "readResourceBytesCore");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(readResourceBytes("p", "r")).rejects.toBeInstanceOf(
      ResourceBytesUnsupportedError,
    );
    expect(core).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("web-stub", () => {
  it("exports the same names as the native backend and throws if reached", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
    expect(() => webStub.createNativeResourceBytesTransport()).toThrow(
      /web-stub/,
    );
  });
});

describe("native-resource-bytes-backend web-bundle exclusion", () => {
  const root = path.resolve(__dirname, "..", "..");
  const CLIENT = path.join("src", "lib", "api", "resource-bytes.ts");
  const STUB = path.join(
    "src",
    "store",
    "transport",
    "native-resource-bytes-backend.web-stub.ts",
  );

  it("the client carries the literal specifier, no fetch and no file-route URL", () => {
    const src = fs.readFileSync(path.join(root, CLIENT), "utf8");
    expect(src).toContain(
      'import("../../store/transport/native-resource-bytes-backend")',
    );
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toContain("/api/resource/");
    expect(src).not.toContain("resolveRuntime");
  });

  it("next.config.mjs aliases the specifier to the web-stub", () => {
    const cfg = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    expect(cfg).toContain(
      '"../../store/transport/native-resource-bytes-backend":\n            "./src/store/transport/native-resource-bytes-backend.web-stub"',
    );
  });

  it("the web-stub has no node:* reference and no imports beyond types", () => {
    const stub = fs.readFileSync(path.join(root, STUB), "utf8");
    expect(stub).not.toMatch(/from\s+["']node:/);
    const values = stub
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    expect(values).toEqual([]);
  });
});
