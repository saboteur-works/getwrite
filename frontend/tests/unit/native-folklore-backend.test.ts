/**
 * Feature 110 Task 10 (FR-13, FR-21): the native folklore variant-read backend
 * and its web stub, over an in-memory fake Capacitor filesystem with the read
 * core spied. Nothing here is a device run.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as nativeBackend from "../../src/store/transport/native-folklore-backend";
import * as webStub from "../../src/store/transport/native-folklore-backend.web-stub";
import * as readCore from "../../src/lib/models/folklore-variant-read-core";
import {
  EncryptedProjectCaptureRefusedError,
  isEncryptedProjectCaptureRefusal,
} from "../../src/lib/api/encrypted-project-refusal";
import {
  createFakeCapacitorFilesystem,
  type CapacitorFilesystemLike,
} from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { PROJECT_MARKER_FILENAME } from "../../src/lib/models/crypto/project-marker";
import type { VariantTextResult } from "../../src/lib/models/folklore-types";

const PROJECTS_DIR = "/projects";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_ID = "22222222-2222-4222-8222-222222222222";
const ROOT = `${PROJECTS_DIR}/${PROJECT_ID}`;
const MARKER = JSON.stringify({
  version: 1,
  encrypted: true,
  encryptedAt: "2026-01-01T00:00:00.000Z",
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function fakeFs(marked: boolean): Promise<CapacitorFilesystemLike> {
  const base = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(base);
  await adapter.mkdir(ROOT, { recursive: true });
  if (marked) {
    await adapter.writeFile(`${ROOT}/${PROJECT_MARKER_FILENAME}`, MARKER);
  }
  return base;
}

const outcome = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => null,
    (e: unknown) => e,
  );

describe("native folklore backend", () => {
  it.each<VariantTextResult>([
    { kind: "text", text: "Once upon a time" },
    { kind: "none" },
    { kind: "unreadable", reason: "fixed reason" },
    { kind: "locked" },
  ])("returns the core's typed result unchanged: $kind", async (result) => {
    const read = vi
      .spyOn(readCore, "readVariantTextCore")
      .mockResolvedValue(result);
    const t = nativeBackend.createNativeFolkloreTransport({
      fs: await fakeFs(false),
      projectsDir: PROJECTS_DIR,
    });
    await expect(t.readVariantText(PROJECT_ID, RESOURCE_ID)).resolves.toBe(
      result,
    );
    expect(read).toHaveBeenCalledWith(PROJECT_ID, RESOURCE_ID);
  });

  it("refuses an encrypted-marked project with the typed error and no core call", async () => {
    const read = vi.spyOn(readCore, "readVariantTextCore");
    const t = nativeBackend.createNativeFolkloreTransport({
      fs: await fakeFs(true),
      projectsDir: PROJECTS_DIR,
    });
    const e = await outcome(t.readVariantText(PROJECT_ID, RESOURCE_ID));
    expect(isEncryptedProjectCaptureRefusal(e)).toBe(true);
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses with the variant-read wording, not the Claims wording", async () => {
    const t = nativeBackend.createNativeFolkloreTransport({
      fs: await fakeFs(true),
      projectsDir: PROJECTS_DIR,
    });
    const e = await outcome(t.readVariantText(PROJECT_ID, RESOURCE_ID));
    const claims = new EncryptedProjectCaptureRefusedError("encrypted", {
      subject: "claims",
    });
    const message = (e as Error).message;
    expect(message).not.toBe(claims.message);
    expect(message).not.toMatch(/claims/i);
    expect(message).toMatch(/variants/i);
    expect(message).toMatch(/encrypted/i);
    expect(message).not.toMatch(/nothing was saved/i);
    expect((e as EncryptedProjectCaptureRefusedError).reason).toBe("encrypted");
  });

  it("propagates a core error unchanged", async () => {
    const boom = new Error("boom");
    vi.spyOn(readCore, "readVariantTextCore").mockRejectedValue(boom);
    const t = nativeBackend.createNativeFolkloreTransport({
      fs: await fakeFs(false),
      projectsDir: PROJECTS_DIR,
    });
    expect(await outcome(t.readVariantText(PROJECT_ID, RESOURCE_ID))).toBe(
      boom,
    );
  });
});

describe("native folklore backend web exclusion", () => {
  const root = path.resolve(__dirname, "..", "..");
  const STUB = path.join(
    root,
    "src/store/transport/native-folklore-backend.web-stub.ts",
  );
  const KEY = '"../../store/transport/native-folklore-backend"';

  it("the web stub exports the same names and throws a native-only message", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
    expect(() => webStub.createNativeFolkloreTransport()).toThrow(
      /native-only/,
    );
    expect(() => webStub.createNativeFolkloreTransport()).toThrow(/web-stub/);
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
    expect(cfg).toContain(`${KEY}:`);
    expect(cfg).toContain(
      '"./src/store/transport/native-folklore-backend.web-stub"',
    );
  });

  it("the alias sits in the web branch of resolveAlias, not the native one", () => {
    const cfg = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    const start = cfg.indexOf("resolveAlias: isNativeTarget");
    const webBranch = cfg.indexOf("\n      : {", start);
    const key = cfg.indexOf(KEY);
    expect(start).toBeGreaterThan(-1);
    expect(webBranch).toBeGreaterThan(start);
    expect(key).toBeGreaterThan(webBranch);
  });
});
