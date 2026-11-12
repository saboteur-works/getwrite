/**
 * Feature 109 Task 28 (FR-14): the native organizer arrangements backend and
 * its web stub, over an in-memory fake Capacitor filesystem with the
 * arrangements core spied (the real core is Task 25's, built in another lane;
 * real-core parity is verified at integration). Nothing here is a device run.
 */
import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as nativeBackend from "../../src/store/transport/native-organizer-arrangements-backend";
import * as webStub from "../../src/store/transport/native-organizer-arrangements-backend.web-stub";
import * as core from "../../src/lib/models/organizer-arrangements-core";
import { isEncryptedProjectCaptureRefusal } from "../../src/lib/api/encrypted-project-refusal";
import {
  createFakeCapacitorFilesystem,
  type CapacitorFilesystemLike,
} from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { PROJECT_MARKER_FILENAME } from "../../src/lib/models/crypto/project-marker";
import type {
  OrganizerArrangementAddInput,
  OrganizerArrangementAddResult,
  OrganizerArrangementDeleteInput,
  OrganizerArrangementDeleteResult,
  OrganizerArrangementRenameInput,
  OrganizerArrangementRenameResult,
} from "../../src/lib/models/organizer-grid-types";

const PROJECTS_DIR = "/projects";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const ARRANGEMENT_ID = "arr-1";
const ROOT = `${PROJECTS_DIR}/${PROJECT_ID}`;
const MARKER = JSON.stringify({
  version: 1,
  encrypted: true,
  encryptedAt: "2026-01-01T00:00:00.000Z",
});

/** Opaque to the transport: the (spied) core owns validation. */
const ADD_INPUT = {
  name: "By status",
  source: { kind: "folder" },
  rows: { kind: "none" },
  columns: { kind: "order" },
} as unknown as OrganizerArrangementAddInput;
const RENAME_INPUT: OrganizerArrangementRenameInput = {
  id: ARRANGEMENT_ID,
  name: "Renamed",
};
const DELETE_INPUT: OrganizerArrangementDeleteInput = { id: ARRANGEMENT_ID };
const ADD_OK: OrganizerArrangementAddResult = { ok: true, id: ARRANGEMENT_ID };
const RENAME_OK: OrganizerArrangementRenameResult = {
  ok: true,
  id: ARRANGEMENT_ID,
};
const DELETE_OK: OrganizerArrangementDeleteResult = {
  ok: true,
  id: ARRANGEMENT_ID,
};
const REFUSAL: OrganizerArrangementAddResult = {
  ok: false,
  reason: "name-blank",
  message: "Give the arrangement a name.",
};
const NOT_FOUND: OrganizerArrangementDeleteResult = {
  ok: false,
  reason: "not-found",
  message: "That arrangement no longer exists.",
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
  t: nativeBackend.NativeOrganizerArrangementsTransport;
  writes: string[];
}> {
  const rec = await recordedFs(marked);
  return {
    t: nativeBackend.createNativeOrganizerArrangementsTransport({
      fs: rec.fs,
      projectsDir: PROJECTS_DIR,
    }),
    writes: rec.writes,
  };
}

describe("native organizer arrangements backend", () => {
  it("passes add, rename and delete to their cores and returns each result unchanged", async () => {
    const { t } = await transport();
    const add = vi
      .spyOn(core, "addOrganizerArrangementCore")
      .mockResolvedValue(ADD_OK);
    const rename = vi
      .spyOn(core, "renameOrganizerArrangementCore")
      .mockResolvedValue(RENAME_OK);
    const del = vi
      .spyOn(core, "deleteOrganizerArrangementCore")
      .mockResolvedValue(DELETE_OK);
    await expect(t.add(PROJECT_ID, ADD_INPUT)).resolves.toBe(ADD_OK);
    await expect(t.rename(PROJECT_ID, RENAME_INPUT)).resolves.toBe(RENAME_OK);
    await expect(t.delete(PROJECT_ID, DELETE_INPUT)).resolves.toBe(DELETE_OK);
    expect(add).toHaveBeenCalledWith(PROJECT_ID, ADD_INPUT);
    expect(rename).toHaveBeenCalledWith(PROJECT_ID, RENAME_INPUT);
    expect(del).toHaveBeenCalledWith(PROJECT_ID, DELETE_INPUT);
  });

  it("returns a core refusal as the same result value, not an error", async () => {
    const { t } = await transport();
    vi.spyOn(core, "addOrganizerArrangementCore").mockResolvedValue(REFUSAL);
    vi.spyOn(core, "renameOrganizerArrangementCore").mockResolvedValue(REFUSAL);
    vi.spyOn(core, "deleteOrganizerArrangementCore").mockResolvedValue(
      NOT_FOUND,
    );
    await expect(t.add(PROJECT_ID, ADD_INPUT)).resolves.toEqual(REFUSAL);
    await expect(t.rename(PROJECT_ID, RENAME_INPUT)).resolves.toEqual(REFUSAL);
    await expect(t.delete(PROJECT_ID, DELETE_INPUT)).resolves.toEqual(
      NOT_FOUND,
    );
  });

  it("propagates any core error unchanged (never an ok or empty result)", async () => {
    const { t } = await transport();
    const boom = new Error("boom");
    vi.spyOn(core, "addOrganizerArrangementCore").mockRejectedValue(boom);
    vi.spyOn(core, "renameOrganizerArrangementCore").mockRejectedValue(boom);
    vi.spyOn(core, "deleteOrganizerArrangementCore").mockRejectedValue(boom);
    expect(await outcome(t.add(PROJECT_ID, ADD_INPUT))).toBe(boom);
    expect(await outcome(t.rename(PROJECT_ID, RENAME_INPUT))).toBe(boom);
    expect(await outcome(t.delete(PROJECT_ID, DELETE_INPUT))).toBe(boom);
  });

  it("refuses every operation in an encrypted-marked project: typed error, no write, no core call", async () => {
    const { t, writes } = await transport(true);
    const spies = [
      vi.spyOn(core, "addOrganizerArrangementCore"),
      vi.spyOn(core, "renameOrganizerArrangementCore"),
      vi.spyOn(core, "deleteOrganizerArrangementCore"),
    ];
    const errors = [
      await outcome(t.add(PROJECT_ID, ADD_INPUT)),
      await outcome(t.rename(PROJECT_ID, RENAME_INPUT)),
      await outcome(t.delete(PROJECT_ID, DELETE_INPUT)),
    ];
    for (const e of errors) {
      expect(isEncryptedProjectCaptureRefusal(e)).toBe(true);
      expect((e as Error).message).toMatch(
        /^Arrangements can't be changed in an encrypted project on this device\./,
      );
      expect((e as Error).message).not.toMatch(/captur|claim|field/i);
    }
    expect(writes).toEqual([]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});

describe("native organizer arrangements backend web exclusion", () => {
  const root = path.resolve(__dirname, "..", "..");
  const STUB = path.join(
    root,
    "src/store/transport/native-organizer-arrangements-backend.web-stub.ts",
  );
  const KEY = '"../../store/transport/native-organizer-arrangements-backend"';

  it("the web stub exports the same names and throws a native-only message", () => {
    expect(Object.keys(webStub).sort()).toEqual(
      Object.keys(nativeBackend).sort(),
    );
    expect(() => webStub.createNativeOrganizerArrangementsTransport()).toThrow(
      /web-stub/,
    );
    expect(() => webStub.createNativeOrganizerArrangementsTransport()).toThrow(
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
    expect(cfg).toContain(`${KEY}:`);
    expect(cfg).toContain(
      '"./src/store/transport/native-organizer-arrangements-backend.web-stub"',
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
