/**
 * Feature 109 Task 14 (FR-7, FR-13): the native organizer field-write backend
 * and its web stub, over an in-memory fake Capacitor filesystem with the
 * field-write core spied (the real core is Task 10's, built in another lane;
 * the real-core parity check is left to integration). Nothing here is a
 * device run.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as nativeBackend from "../../src/store/transport/native-organizer-field-write-backend";
import * as webStub from "../../src/store/transport/native-organizer-field-write-backend.web-stub";
import * as core from "../../src/lib/models/organizer-field-write-core";
import { ResourceGoneError } from "../../src/lib/models/resource-gone-error";
import { isEncryptedProjectCaptureRefusal } from "../../src/lib/api/encrypted-project-refusal";
import {
  createFakeCapacitorFilesystem,
  type CapacitorFilesystemLike,
} from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { PROJECT_MARKER_FILENAME } from "../../src/lib/models/crypto/project-marker";
import type {
  OrganizerFieldWriteInput,
  OrganizerFieldWriteResult,
} from "../../src/lib/models/organizer-grid-types";

const PROJECTS_DIR = "/projects";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const RESOURCE_ID = "22222222-2222-4222-8222-222222222222";
const ROOT = `${PROJECTS_DIR}/${PROJECT_ID}`;
const MARKER = JSON.stringify({
  version: 1,
  encrypted: true,
  encryptedAt: "2026-01-01T00:00:00.000Z",
});

const SET_INPUT: OrganizerFieldWriteInput = {
  resourceId: RESOURCE_ID,
  changes: [
    { target: { kind: "status" }, op: "set", value: "Draft" },
    { target: { kind: "field", key: "mood" }, op: "set", value: "calm" },
  ],
};
const CLEAR_INPUT: OrganizerFieldWriteInput = {
  resourceId: RESOURCE_ID,
  changes: [{ target: { kind: "status" }, op: "clear" }],
};
const OK: OrganizerFieldWriteResult = { ok: true, resourceId: RESOURCE_ID };
const REFUSAL: OrganizerFieldWriteResult = {
  ok: false,
  reason: "value-not-in-list",
  message: "That value is not one of the field's options.",
};

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

async function transport(
  marked = false,
): Promise<{
  t: nativeBackend.NativeOrganizerFieldWriteTransport;
  writes: string[];
}> {
  const rec = await recordedFs(marked);
  return {
    t: nativeBackend.createNativeOrganizerFieldWriteTransport({
      fs: rec.fs,
      projectsDir: PROJECTS_DIR,
    }),
    writes: rec.writes,
  };
}

describe("native organizer field-write backend", () => {
  it("passes a set to the core and returns its result unchanged", async () => {
    const { t } = await transport();
    const spy = vi.spyOn(core, "setOrganizerFieldsCore").mockResolvedValue(OK);
    await expect(t.setOrganizerFields(PROJECT_ID, SET_INPUT)).resolves.toBe(OK);
    expect(spy).toHaveBeenCalledWith(PROJECT_ID, SET_INPUT);
  });

  it("passes a clear to the core and returns its result unchanged", async () => {
    const { t } = await transport();
    const spy = vi.spyOn(core, "setOrganizerFieldsCore").mockResolvedValue(OK);
    await expect(t.setOrganizerFields(PROJECT_ID, CLEAR_INPUT)).resolves.toBe(
      OK,
    );
    expect(spy).toHaveBeenCalledWith(PROJECT_ID, CLEAR_INPUT);
  });

  it("returns a core refusal as the same result value, not an error", async () => {
    const { t } = await transport();
    vi.spyOn(core, "setOrganizerFieldsCore").mockResolvedValue(REFUSAL);
    await expect(t.setOrganizerFields(PROJECT_ID, SET_INPUT)).resolves.toEqual(
      REFUSAL,
    );
  });

  it("lets ResourceGoneError propagate as the typed error the route maps to 404", async () => {
    const { t } = await transport();
    const gone = new ResourceGoneError(RESOURCE_ID);
    vi.spyOn(core, "setOrganizerFieldsCore").mockRejectedValue(gone);
    expect(await outcome(t.setOrganizerFields(PROJECT_ID, SET_INPUT))).toBe(
      gone,
    );
  });

  it("propagates any other core error unchanged (never an ok or empty result)", async () => {
    const { t } = await transport();
    const boom = new Error("boom");
    vi.spyOn(core, "setOrganizerFieldsCore").mockRejectedValue(boom);
    expect(await outcome(t.setOrganizerFields(PROJECT_ID, SET_INPUT))).toBe(
      boom,
    );
  });

  it("refuses a write in an encrypted-marked project: typed error, no write, no core call", async () => {
    const { t, writes } = await transport(true);
    const spy = vi.spyOn(core, "setOrganizerFieldsCore");
    const e = await outcome(t.setOrganizerFields(PROJECT_ID, SET_INPUT));
    expect(isEncryptedProjectCaptureRefusal(e)).toBe(true);
    expect((e as Error).message).toMatch(
      /^Fields can't be changed in an encrypted project on this device\./,
    );
    expect((e as Error).message).not.toMatch(/captur|claim/i);
    expect(writes).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("native organizer field-write backend web exclusion", () => {
  const root = path.resolve(__dirname, "..", "..");
  const STUB = path.join(
    root,
    "src/store/transport/native-organizer-field-write-backend.web-stub.ts",
  );

  it("the web stub exports the same names and throws a native-only message", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
    expect(() => webStub.createNativeOrganizerFieldWriteTransport()).toThrow(
      /web-stub/,
    );
    expect(() => webStub.createNativeOrganizerFieldWriteTransport()).toThrow(
      /native/,
    );
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
    expect(cfg).toContain(
      '"../../store/transport/native-organizer-field-write-backend":',
    );
    expect(cfg).toContain(
      '"./src/store/transport/native-organizer-field-write-backend.web-stub"',
    );
  });

  it("the alias sits in the web branch of resolveAlias, not the native one", () => {
    const cfg = fs.readFileSync(path.join(root, "next.config.mjs"), "utf8");
    const start = cfg.indexOf("resolveAlias: isNativeTarget");
    const webBranch = cfg.indexOf("\n      : {", start);
    const key = cfg.indexOf(
      '"../../store/transport/native-organizer-field-write-backend"',
    );
    expect(start).toBeGreaterThan(-1);
    expect(webBranch).toBeGreaterThan(start);
    expect(key).toBeGreaterThan(webBranch);
  });
});
