/**
 * Feature 103 Task 19 (FR-18 storage half, FR-30): the native attachment
 * byte-read backend, its web-stub, and the web-bundle exclusion. The native
 * read runs over an in-memory fake Capacitor filesystem at a size far below
 * the cap; nothing here is a device run and no size or speed is claimed.
 * Native lock parity with the server is reasoned from both calling the same
 * core, not run on a device.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as nativeBackend from "../../src/store/transport/native-source-attachment-bytes-backend";
import * as webStub from "../../src/store/transport/native-source-attachment-bytes-backend.web-stub";
import * as bytesCore from "../../src/lib/models/source-attachment-bytes-core";
import { createNativeAttachmentsTransport } from "../../src/store/transport/native-source-attachments-backend";
import { createNativeResourcesTransport } from "../../src/store/transport/native-resource-backend";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import {
  isLockedAccessError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";

const PROJECTS_DIR = "/projects";
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);

afterEach(async () => {
  vi.restoreAllMocks();
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
  return { deps, projectId, sourceId };
}

describe("native attachment byte-read backend", () => {
  it("reads an attachment added through the native transport, over the in-memory filesystem", async () => {
    const { deps, projectId, sourceId } = await seedSource();
    const entry = await createNativeAttachmentsTransport(deps).addAttachment(
      projectId,
      sourceId,
      new File([PNG as BlobPart], "photo.png", { type: "image/png" }),
    );
    const view = await nativeBackend
      .createNativeAttachmentBytesTransport(deps)
      .readAttachmentBytes(projectId, sourceId, entry.id);
    expect(view.kind).toBe("image");
    expect(view.mime).toBe("image/png");
    expect(Buffer.from(view.bytes).equals(Buffer.from(PNG))).toBe(true);
  });

  it("refuses a path-like attachment id with the shared message", async () => {
    const { deps, projectId, sourceId } = await seedSource();
    await expect(
      nativeBackend
        .createNativeAttachmentBytesTransport(deps)
        .readAttachmentBytes(projectId, sourceId, "../../project.json"),
    ).rejects.toThrow("An attachment id must be a valid id.");
  });

  it("calls the core and propagates a locked-access error unchanged", async () => {
    const { deps, projectId, sourceId } = await seedSource();
    const aid = generateUUID();
    const spy = vi
      .spyOn(bytesCore, "readAttachmentBytesCore")
      .mockRejectedValue(new ProjectLockedError(projectId));
    const err = await nativeBackend
      .createNativeAttachmentBytesTransport(deps)
      .readAttachmentBytes(projectId, sourceId, aid)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(spy).toHaveBeenCalledWith(projectId, sourceId, aid);
    expect(isLockedAccessError(err)).toBe(true);
  });
});

describe("web-stub", () => {
  it("exports the same names as the native backend and throws if reached", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
    expect(() => webStub.createNativeAttachmentBytesTransport()).toThrow(
      /web-stub/,
    );
  });
});

describe("native-source-attachment-bytes-backend web-bundle exclusion", () => {
  const root = path.resolve(__dirname, "..", "..");
  const BACKEND = path.join(
    "src",
    "store",
    "transport",
    "native-source-attachment-bytes-backend.ts",
  );
  const CLIENT = path.join("src", "lib", "api", "source-attachment-bytes.ts");
  const STUB = path.join(
    "src",
    "store",
    "transport",
    "native-source-attachment-bytes-backend.web-stub.ts",
  );

  function collect(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return ["node_modules", ".next", "dist"].includes(entry.name)
          ? []
          : collect(full);
      }
      return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
  }

  it("is referenced only from lib/api/source-attachment-bytes.ts", () => {
    const re = /native-source-attachment-bytes-backend(?!\.web-stub)["']/;
    const offenders: string[] = [];
    for (const d of ["src", "app"]) {
      for (const file of collect(path.join(root, d))) {
        const rel = path.relative(root, file);
        if ([CLIENT, BACKEND, STUB].includes(rel)) continue;
        if (re.test(fs.readFileSync(file, "utf8"))) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the client carries the literal specifier and next.config.mjs aliases it to the stub", () => {
    expect(fs.readFileSync(path.join(root, CLIENT), "utf8")).toContain(
      'import("../../store/transport/native-source-attachment-bytes-backend")',
    );
    const cfg = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    expect(cfg).toContain(
      '"../../store/transport/native-source-attachment-bytes-backend"',
    );
    expect(cfg).toContain("native-source-attachment-bytes-backend.web-stub");
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
