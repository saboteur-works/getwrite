/**
 * Feature 107 Task 4 (FR-11, FR-7, FR-17): the native encrypted-project guard,
 * the image-capture backend, its client and web-stub. Over an in-memory fake
 * Capacitor filesystem; nothing here is a device run.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as imageBackend from "../../src/store/transport/native-inbox-image-capture-backend";
import * as imageWebStub from "../../src/store/transport/native-inbox-image-capture-backend.web-stub";
import * as textBackend from "../../src/store/transport/native-inbox-capture-backend";
import * as imageCore from "../../src/lib/models/inbox-image-capture-core";
import * as textCore from "../../src/lib/models/inbox-capture-core";
import {
  assertImageCaptureAllowed,
  captureImageToInbox,
} from "../../src/lib/api/inbox-image-capture";
import {
  EncryptedProjectCaptureRefusedError,
  isEncryptedProjectCaptureRefusal,
} from "../../src/lib/api/encrypted-project-refusal";
import {
  createFakeCapacitorFilesystem,
  type CapacitorFilesystemLike,
} from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import {
  isLockedAccessError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { PROJECT_MARKER_FILENAME } from "../../src/lib/models/crypto/project-marker";

const PROJECTS_DIR = "/projects";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ROOT = `${PROJECTS_DIR}/${PROJECT_ID}`;
const MARKER = JSON.stringify({
  version: 1,
  encrypted: true,
  encryptedAt: "2026-01-01T00:00:00.000Z",
});
const BYTES = new Uint8Array([1, 2, 3]);
const IMAGE_REQUEST = {
  projectId: PROJECT_ID,
  bytes: BYTES,
  name: "photo.png",
  mimeType: "image/png",
  size: 3,
};
const TEXT_REQUEST = {
  projectId: PROJECT_ID,
  text: "a thought",
  origin: "typed" as const,
};
const CREATED = {
  status: "created" as const,
  resourceId: "22222222-2222-4222-8222-222222222222",
  inboxFolderId: "33333333-3333-4333-8333-333333333333",
  notices: [],
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

interface Recorded {
  fs: CapacitorFilesystemLike;
  writes: string[];
  reads: string[];
}

/** A fake filesystem recording every write-like call and every read path. */
async function recordedFs(
  marker: "none" | "valid" | { readFails: Error },
): Promise<Recorded> {
  const base = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(base);
  await adapter.mkdir(ROOT, { recursive: true });
  if (marker === "valid") {
    await adapter.writeFile(`${ROOT}/${PROJECT_MARKER_FILENAME}`, MARKER);
  }
  const writes: string[] = [];
  const reads: string[] = [];
  const wrapped: CapacitorFilesystemLike = {
    ...base,
    readFile: async (opts) => {
      reads.push(opts.path);
      if (
        typeof marker === "object" &&
        opts.path.endsWith(PROJECT_MARKER_FILENAME)
      ) {
        throw marker.readFails;
      }
      return base.readFile(opts);
    },
    writeFile: async (opts) => {
      writes.push(opts.path);
      return base.writeFile(opts);
    },
    appendFile: async (opts) => {
      writes.push(opts.path);
      return base.appendFile(opts);
    },
    mkdir: async (opts) => {
      writes.push(opts.path);
      return base.mkdir(opts);
    },
    deleteFile: async (opts) => {
      writes.push(opts.path);
      return base.deleteFile(opts);
    },
    rename: async (opts) => {
      writes.push(opts.to);
      return base.rename(opts);
    },
    copy: async (opts) => {
      writes.push(opts.to);
      return base.copy(opts);
    },
  };
  return { fs: wrapped, writes, reads };
}

describe("encrypted-project refusal wording by subject", () => {
  it("keeps the capture wording by default and gives claims their own", () => {
    for (const reason of ["encrypted", "marker-unreadable"] as const) {
      expect(new EncryptedProjectCaptureRefusedError(reason).message).toMatch(
        /^Nothing was captured/,
      );
      const claims = new EncryptedProjectCaptureRefusedError(reason, {
        subject: "claims",
      });
      expect(claims.message).toMatch(/^Claims can't be changed/);
      expect(claims.message).not.toMatch(/captur/i);
      expect(isEncryptedProjectCaptureRefusal(claims)).toBe(true);
      expect(claims.reason).toBe(reason);
    }
  });
});

describe("native encrypted-project guard", () => {
  it("refuses a marked project on the text path, with no write and no core call", async () => {
    const rec = await recordedFs("valid");
    const core = vi.spyOn(textCore, "captureToInboxCore");
    const err = await textBackend
      .createNativeInboxCaptureTransport({
        fs: rec.fs,
        projectsDir: PROJECTS_DIR,
      })
      .capture(TEXT_REQUEST)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isEncryptedProjectCaptureRefusal(err)).toBe(true);
    expect((err as EncryptedProjectCaptureRefusedError).reason).toBe(
      "encrypted",
    );
    expect((err as Error).message).toMatch(/Nothing was captured/);
    expect((err as Error).message).toMatch(/encrypted/);
    expect(rec.writes).toEqual([]);
    expect(core).not.toHaveBeenCalled();
  });

  it("refuses a marked project on the image path, with no write and no read beyond the marker", async () => {
    const rec = await recordedFs("valid");
    const core = vi.spyOn(imageCore, "captureImageToInboxCore");
    const err = await imageBackend
      .createNativeInboxImageCaptureTransport({
        fs: rec.fs,
        projectsDir: PROJECTS_DIR,
      })
      .capture(IMAGE_REQUEST)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isEncryptedProjectCaptureRefusal(err)).toBe(true);
    expect((err as Error).message).toMatch(/Nothing was captured/);
    expect(rec.writes).toEqual([]);
    expect(
      rec.reads.filter((p) => !p.endsWith(PROJECT_MARKER_FILENAME)),
    ).toEqual([]);
    expect(core).not.toHaveBeenCalled();
  });

  it("proceeds on both paths when there is no marker", async () => {
    const rec = await recordedFs("none");
    const text = vi
      .spyOn(textCore, "captureToInboxCore")
      .mockResolvedValue(CREATED);
    const image = vi
      .spyOn(imageCore, "captureImageToInboxCore")
      .mockResolvedValue(CREATED);
    const deps = { fs: rec.fs, projectsDir: PROJECTS_DIR };
    await expect(
      textBackend.createNativeInboxCaptureTransport(deps).capture(TEXT_REQUEST),
    ).resolves.toBe(CREATED);
    await expect(
      imageBackend
        .createNativeInboxImageCaptureTransport(deps)
        .capture(IMAGE_REQUEST),
    ).resolves.toBe(CREATED);
    expect(text).toHaveBeenCalledWith(TEXT_REQUEST);
    expect(image).toHaveBeenCalledWith(IMAGE_REQUEST);
  });

  it("refuses when the marker read fails for a reason other than absence", async () => {
    const rec = await recordedFs({ readFails: new Error("EIO: disk error") });
    const text = vi.spyOn(textCore, "captureToInboxCore");
    const image = vi.spyOn(imageCore, "captureImageToInboxCore");
    const deps = { fs: rec.fs, projectsDir: PROJECTS_DIR };
    for (const attempt of [
      () =>
        textBackend
          .createNativeInboxCaptureTransport(deps)
          .capture(TEXT_REQUEST),
      () =>
        imageBackend
          .createNativeInboxImageCaptureTransport(deps)
          .capture(IMAGE_REQUEST),
    ]) {
      const err = await attempt().then(
        () => null,
        (e: unknown) => e,
      );
      expect(isEncryptedProjectCaptureRefusal(err)).toBe(true);
      expect((err as EncryptedProjectCaptureRefusedError).reason).toBe(
        "marker-unreadable",
      );
    }
    expect(text).not.toHaveBeenCalled();
    expect(image).not.toHaveBeenCalled();
    expect(rec.writes).toEqual([]);
  });

  it("refuses a corrupt marker", async () => {
    const rec = await recordedFs("none");
    await capacitorFsAdapter(rec.fs).writeFile(
      `${ROOT}/${PROJECT_MARKER_FILENAME}`,
      "{not json",
    );
    const err = await imageBackend
      .createNativeInboxImageCaptureTransport({
        fs: rec.fs,
        projectsDir: PROJECTS_DIR,
      })
      .capture(IMAGE_REQUEST)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isEncryptedProjectCaptureRefusal(err)).toBe(true);
  });

  it("uses the directory id for the marker path, not an id inside project.json", async () => {
    const dirId = "44444444-4444-4444-8444-444444444444";
    const manifestId = "55555555-5555-4555-8555-555555555555";
    const rec = await recordedFs("none");
    const adapter = capacitorFsAdapter(rec.fs);
    await adapter.mkdir(`${PROJECTS_DIR}/${dirId}`, { recursive: true });
    await adapter.writeFile(
      `${PROJECTS_DIR}/${dirId}/project.json`,
      JSON.stringify({ id: manifestId, name: "p", config: {} }),
    );
    await adapter.writeFile(
      `${PROJECTS_DIR}/${dirId}/${PROJECT_MARKER_FILENAME}`,
      MARKER,
    );
    const err = await imageBackend
      .createNativeInboxImageCaptureTransport({
        fs: rec.fs,
        projectsDir: PROJECTS_DIR,
      })
      .capture({ ...IMAGE_REQUEST, projectId: dirId })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isEncryptedProjectCaptureRefusal(err)).toBe(true);
  });

  it("passes a locked-access error from the core through unchanged", async () => {
    const rec = await recordedFs("none");
    const locked = new ProjectLockedError(PROJECT_ID);
    vi.spyOn(imageCore, "captureImageToInboxCore").mockRejectedValue(locked);
    const err = await imageBackend
      .createNativeInboxImageCaptureTransport({
        fs: rec.fs,
        projectsDir: PROJECTS_DIR,
      })
      .capture(IMAGE_REQUEST)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBe(locked);
    expect(isLockedAccessError(err)).toBe(true);
  });

  it("leaves a malformed project id to the core's own typed error", async () => {
    const rec = await recordedFs("none");
    await expect(
      imageBackend
        .createNativeInboxImageCaptureTransport({
          fs: rec.fs,
          projectsDir: PROJECTS_DIR,
        })
        .capture({ ...IMAGE_REQUEST, projectId: "../x" }),
    ).rejects.toThrow();
  });
});

describe("image capture client", () => {
  it("resolves the native backend, passes the request to the core and returns each typed result", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const bootstrap = await import("../../src/lib/models/native-bootstrap");
    vi.spyOn(bootstrap, "ensureNativeStorageContext").mockResolvedValue(
      undefined as never,
    );
    const guard =
      await import("../../src/store/transport/native-encrypted-project-guard");
    vi.spyOn(guard, "assertProjectNotEncrypted").mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const results: imageCore.ImageCaptureResult[] = [
      CREATED,
      { status: "needs-choice", state: "inbox-in-trash" },
      { status: "refused", reason: "too-large", message: "too big" },
    ];
    for (const result of results) {
      const core = vi
        .spyOn(imageCore, "captureImageToInboxCore")
        .mockResolvedValueOnce(result);
      await expect(captureImageToInbox(IMAGE_REQUEST)).resolves.toBe(result);
      expect(core).toHaveBeenCalledWith(IMAGE_REQUEST);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects as native-only on a non-native runtime and makes no fetch", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(captureImageToInbox(IMAGE_REQUEST)).rejects.toThrow(
      /native-only/,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("image capture pre-check (Feature 107 Task 8)", () => {
  it("the backend pre-check refuses a marked project with no write and no read beyond the marker", async () => {
    const rec = await recordedFs("valid");
    const core = vi.spyOn(imageCore, "captureImageToInboxCore");
    const err = await imageBackend
      .createNativeInboxImageCaptureTransport({
        fs: rec.fs,
        projectsDir: PROJECTS_DIR,
      })
      .assertAllowed(PROJECT_ID)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(isEncryptedProjectCaptureRefusal(err)).toBe(true);
    expect(rec.writes).toEqual([]);
    expect(
      rec.reads.filter((p) => !p.endsWith(PROJECT_MARKER_FILENAME)),
    ).toEqual([]);
    expect(core).not.toHaveBeenCalled();
  });

  it("the backend pre-check resolves for an unmarked project without calling the core", async () => {
    const rec = await recordedFs("none");
    const core = vi.spyOn(imageCore, "captureImageToInboxCore");
    await expect(
      imageBackend
        .createNativeInboxImageCaptureTransport({
          fs: rec.fs,
          projectsDir: PROJECTS_DIR,
        })
        .assertAllowed(PROJECT_ID),
    ).resolves.toBeUndefined();
    expect(core).not.toHaveBeenCalled();
    expect(rec.writes).toEqual([]);
  });

  it("the client pre-check rejects as native-only on a non-native runtime", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "web");
    await expect(assertImageCaptureAllowed(PROJECT_ID)).rejects.toThrow(
      /native-only/,
    );
  });
});

describe("image backend web-stub and bundle exclusion", () => {
  const root = path.resolve(__dirname, "..", "..");
  const CLIENT = path.join("src", "lib", "api", "inbox-image-capture.ts");
  const read = (rel: string): string =>
    fs.readFileSync(path.join(root, rel), "utf8");

  it("the stub exports the same names and throws if reached", () => {
    expect(Object.keys(imageWebStub).sort()).toEqual(
      Object.keys(imageBackend).sort(),
    );
    expect(() => imageWebStub.createNativeInboxImageCaptureTransport()).toThrow(
      /web-stub/,
    );
  });

  it("the client loads the backend by a literal dynamic import", () => {
    expect(read(CLIENT)).toContain(
      'import("../../store/transport/native-inbox-image-capture-backend")',
    );
  });

  it("next.config.mjs aliases the specifier to the web-stub", () => {
    expect(read("next.config.mjs")).toContain(
      '"../../store/transport/native-inbox-image-capture-backend":\n            "./src/store/transport/native-inbox-image-capture-backend.web-stub"',
    );
  });

  it("the stub has no node:* reference and no value imports", () => {
    const stub = read(
      path.join(
        "src",
        "store",
        "transport",
        "native-inbox-image-capture-backend.web-stub.ts",
      ),
    );
    expect(stub).not.toMatch(/from\s+["']node:/);
    expect(
      stub
        .split("\n")
        .filter(
          (l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l),
        ),
    ).toEqual([]);
  });

  it("adds no /api route for image capture", () => {
    const hits: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/capture/i.test(full) && /route\.ts$/.test(e.name)) {
          hits.push(path.relative(root, full));
        }
      }
    };
    walk(path.join(root, "app", "api"));
    expect(hits.filter((h) => /image/i.test(h))).toEqual([]);
  });

  it("the error module imports nothing", () => {
    expect(
      read(path.join("src", "lib", "api", "encrypted-project-refusal.ts")),
    ).not.toMatch(/^\s*import\s/m);
  });
});
