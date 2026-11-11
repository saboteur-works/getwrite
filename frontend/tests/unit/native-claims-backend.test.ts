/**
 * Feature 108 Task 17 (FR-21): the native claims backend and its web stub,
 * over an in-memory fake Capacitor filesystem with the claims cores spied
 * (the real cores are stubs until Tasks 11-13). Nothing here is a device run.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as nativeBackend from "../../src/store/transport/native-claims-backend";
import * as webStub from "../../src/store/transport/native-claims-backend.web-stub";
import * as addCore from "../../src/lib/models/claims-add-core";
import * as updateCore from "../../src/lib/models/claims-update-core";
import * as listCore from "../../src/lib/models/claims-list-core";
import { isEncryptedProjectCaptureRefusal } from "../../src/lib/api/encrypted-project-refusal";
import {
  createFakeCapacitorFilesystem,
  type CapacitorFilesystemLike,
} from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { PROJECT_MARKER_FILENAME } from "../../src/lib/models/crypto/project-marker";
import type { Annotation } from "../../src/lib/models/types";

const PROJECTS_DIR = "/projects";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_ID = "22222222-2222-4222-8222-222222222222";
const ROOT = `${PROJECTS_DIR}/${PROJECT_ID}`;
const MARKER = JSON.stringify({
  version: 1,
  encrypted: true,
  encryptedAt: "2026-01-01T00:00:00.000Z",
});
const STORED = { id: "a1", body: "x" } as unknown as Annotation;
const NEW_CLAIM = { id: "a1", statement: "x", quote: "q" };

afterEach(() => {
  vi.restoreAllMocks();
});

/** A fake filesystem recording every write-like call. */
async function recordedFs(
  marked: boolean,
): Promise<{ fs: CapacitorFilesystemLike; writes: string[] }> {
  const base = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(base);
  await adapter.mkdir(ROOT, { recursive: true });
  if (marked) {
    await adapter.writeFile(`${ROOT}/${PROJECT_MARKER_FILENAME}`, MARKER);
  }
  const writes: string[] = [];
  const wrapped: CapacitorFilesystemLike = {
    ...base,
    writeFile: async (o) => {
      writes.push(o.path);
      return base.writeFile(o);
    },
    appendFile: async (o) => {
      writes.push(o.path);
      return base.appendFile(o);
    },
    mkdir: async (o) => {
      writes.push(o.path);
      return base.mkdir(o);
    },
    deleteFile: async (o) => {
      writes.push(o.path);
      return base.deleteFile(o);
    },
    rename: async (o) => {
      writes.push(o.to);
      return base.rename(o);
    },
    copy: async (o) => {
      writes.push(o.to);
      return base.copy(o);
    },
  };
  return { fs: wrapped, writes };
}

const outcome = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe("native claims backend", () => {
  it("calls list, add and update cores with the ids and returns their results", async () => {
    const rec = await recordedFs(false);
    const list = vi
      .spyOn(listCore, "listClaimsCore")
      .mockResolvedValue({ claims: [], failures: [] });
    const add = vi.spyOn(addCore, "addClaimCore").mockResolvedValue(STORED);
    const update = vi
      .spyOn(updateCore, "updateClaimCore")
      .mockResolvedValue(STORED);
    const t = nativeBackend.createNativeClaimsTransport({
      fs: rec.fs,
      projectsDir: PROJECTS_DIR,
    });
    await expect(t.list(PROJECT_ID)).resolves.toEqual({
      claims: [],
      failures: [],
    });
    await expect(t.add(PROJECT_ID, RESOURCE_ID, NEW_CLAIM)).resolves.toBe(
      STORED,
    );
    await expect(
      t.update(PROJECT_ID, RESOURCE_ID, "a1", { status: "verified" }),
    ).resolves.toBe(STORED);
    expect(list).toHaveBeenCalledWith(PROJECT_ID);
    expect(add).toHaveBeenCalledWith(PROJECT_ID, RESOURCE_ID, NEW_CLAIM);
    expect(update).toHaveBeenCalledWith(PROJECT_ID, RESOURCE_ID, "a1", {
      status: "verified",
    });
  });

  it("refuses add and update in an encrypted-marked project: typed error, no write, no core call", async () => {
    const rec = await recordedFs(true);
    const add = vi.spyOn(addCore, "addClaimCore");
    const update = vi.spyOn(updateCore, "updateClaimCore");
    const t = nativeBackend.createNativeClaimsTransport({
      fs: rec.fs,
      projectsDir: PROJECTS_DIR,
    });
    const e1 = await outcome(t.add(PROJECT_ID, RESOURCE_ID, NEW_CLAIM));
    const e2 = await outcome(
      t.update(PROJECT_ID, RESOURCE_ID, "a1", { status: "disputed" }),
    );
    expect(isEncryptedProjectCaptureRefusal(e1)).toBe(true);
    expect(isEncryptedProjectCaptureRefusal(e2)).toBe(true);
    expect(rec.writes).toEqual([]);
    expect(add).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("allows the read-only list in an encrypted-marked project", async () => {
    const rec = await recordedFs(true);
    const result = { claims: [], failures: [] };
    const list = vi.spyOn(listCore, "listClaimsCore").mockResolvedValue(result);
    const t = nativeBackend.createNativeClaimsTransport({
      fs: rec.fs,
      projectsDir: PROJECTS_DIR,
    });
    await expect(t.list(PROJECT_ID)).resolves.toBe(result);
    expect(list).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("propagates a core error unchanged", async () => {
    const rec = await recordedFs(false);
    const boom = new Error("boom");
    vi.spyOn(addCore, "addClaimCore").mockRejectedValue(boom);
    const t = nativeBackend.createNativeClaimsTransport({
      fs: rec.fs,
      projectsDir: PROJECTS_DIR,
    });
    expect(await outcome(t.add(PROJECT_ID, RESOURCE_ID, NEW_CLAIM))).toBe(boom);
  });
});

describe("native claims backend web exclusion", () => {
  const root = path.resolve(__dirname, "..", "..");
  const STUB = path.join(
    root,
    "src/store/transport/native-claims-backend.web-stub.ts",
  );

  it("the web stub exports the same names and throws a native-only message", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
    expect(() => webStub.createNativeClaimsTransport()).toThrow(/native-only/);
    expect(() => webStub.createNativeClaimsTransport()).toThrow(/web-stub/);
  });

  it("the web stub has no node:* reference and imports only types", () => {
    const stub = fs.readFileSync(STUB, "utf8");
    expect(stub).not.toMatch(/node:/);
    const values = stub
      .split("\n")
      .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
    expect(values).toEqual([]);
  });

  it("next.config.mjs aliases the web-build specifier to the stub", () => {
    const cfg = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    expect(cfg).toContain('"../../store/transport/native-claims-backend":');
    expect(cfg).toContain(
      '"./src/store/transport/native-claims-backend.web-stub"',
    );
  });

  it("the alias sits in the web branch of resolveAlias, not the native one", () => {
    const cfg = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    const start = cfg.indexOf("resolveAlias: isNativeTarget");
    const webBranch = cfg.indexOf("\n      : {", start);
    const key = cfg.indexOf('"../../store/transport/native-claims-backend"');
    expect(start).toBeGreaterThan(-1);
    expect(webBranch).toBeGreaterThan(start);
    expect(key).toBeGreaterThan(webBranch);
  });
});
