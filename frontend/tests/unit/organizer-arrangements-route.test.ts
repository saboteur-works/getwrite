/**
 * Feature 109 Task 26: POST /api/project/organizer-arrangements. One dispatch
 * route for arrangement add, rename and delete (FR-14, OQ-3). The core is
 * mocked here (Task 25 builds the real one), so these tests pin the route's own
 * behaviour: envelope validation, dispatch, the result mapping, locked-access
 * propagation under withStorageContext, and that no paired-device limit is
 * consulted. Real-core integration is verified at wave integration.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/organizer-arrangements-core", () => ({
  validateOrganizerArrangementDraft: vi.fn(),
  addOrganizerArrangementCore: vi.fn(),
  renameOrganizerArrangementCore: vi.fn(),
  deleteOrganizerArrangementCore: vi.fn(),
}));

import { POST } from "../../app/api/project/organizer-arrangements/route";
import {
  addOrganizerArrangementCore,
  deleteOrganizerArrangementCore,
  renameOrganizerArrangementCore,
} from "../../src/lib/models/organizer-arrangements-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { generateUUID } from "../../src/lib/models/uuid";
import { getStorageContext } from "../../src/lib/models/storage-context";

const add = vi.mocked(addOrganizerArrangementCore);
const rename = vi.mocked(renameOrganizerArrangementCore);
const del = vi.mocked(deleteOrganizerArrangementCore);

const tmpDirs: string[] = [];

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function tenantDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-arr-route-"));
  tmpDirs.push(dir);
  return dir;
}

async function withDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

function post(body: unknown, raw?: string): never {
  return new Request("http://localhost/api/project/organizer-arrangements", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  }) as never;
}

async function call(body: unknown, raw?: string): Promise<Response> {
  return withDir(await tenantDir(), () => POST(post(body, raw)));
}

const projectId = generateUUID();
const addBody = {
  projectId,
  op: "add",
  name: "Plot by status",
  source: { kind: "folder", folderId: generateUUID(), scope: "children" },
  rows: { kind: "status" },
  columns: "none",
};

describe("POST /api/project/organizer-arrangements", () => {
  it("dispatches add with the operation fields and returns { ok, id }", async () => {
    const id = generateUUID();
    add.mockResolvedValueOnce({ ok: true, id });
    const res = await call(addBody);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, id });
    expect(add).toHaveBeenCalledWith(projectId, {
      name: addBody.name,
      source: addBody.source,
      rows: addBody.rows,
      columns: addBody.columns,
    });
    expect(rename).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
  });

  it("dispatches rename and delete", async () => {
    const id = generateUUID();
    rename.mockResolvedValueOnce({ ok: true, id });
    const r = await call({ projectId, op: "rename", id, name: "New" });
    expect(await r.json()).toEqual({ ok: true, id });
    expect(rename).toHaveBeenCalledWith(projectId, { id, name: "New" });

    del.mockResolvedValueOnce({ ok: true, id });
    const d = await call({ projectId, op: "delete", id });
    expect(await d.json()).toEqual({ ok: true, id });
    expect(del).toHaveBeenCalledWith(projectId, { id });
  });

  it("returns a core refusal as { ok: false, reason, message } with a non-locked status", async () => {
    const refusal = {
      ok: false as const,
      reason: "name-duplicate" as const,
      message: "An arrangement with that name already exists.",
    };
    add.mockResolvedValueOnce(refusal);
    const res = await call(addBody);
    expect([200, 400, 422]).toContain(res.status);
    expect(await res.json()).toEqual(refusal);
  });

  it("passes unknown operation keys through so the core refuses them", async () => {
    add.mockResolvedValueOnce({
      ok: false,
      reason: "invalid-input",
      message: "Invalid arrangement.",
    });
    await call({ ...addBody, path: "/tmp/x" });
    expect(add).toHaveBeenCalledWith(
      projectId,
      expect.objectContaining({ path: "/tmp/x" }),
    );
  });

  it("returns 400 with the uniform message for an invalid projectId", async () => {
    const res = await call({ ...addBody, projectId: "../etc" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid projectId" });
    expect(add).not.toHaveBeenCalled();
  });

  it("returns 400 with a constant message that echoes no input for malformed bodies", async () => {
    const secret = "SECRET-MARKER-123";
    const cases: Array<[unknown, string?]> = [
      [undefined, "{"],
      [[secret]],
      [null],
      [secret],
      [{ projectId, op: secret }],
      [{ projectId, op: 7 }],
      [{ projectId }],
      [{ projectId: 5, op: "delete", id: secret }],
    ];
    const messages = new Set<string>();
    for (const [body, raw] of cases) {
      const res = await call(body, raw);
      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).not.toContain(secret);
      const parsed = JSON.parse(text) as { error: string };
      messages.add(parsed.error);
    }
    expect(add).not.toHaveBeenCalled();
    expect(rename).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    // Envelope failures share one constant message, except the projectId one.
    expect([...messages].filter((m) => m !== "Invalid projectId")).toHaveLength(
      1,
    );
  });

  it("runs the core inside a request-scoped StorageContext", async () => {
    const dir = await tenantDir();
    let seenRoot: string | undefined;
    add.mockImplementationOnce(async () => {
      seenRoot = getStorageContext()?.tenantRoot;
      return { ok: true, id: generateUUID() };
    });
    const res = await withDir(dir, () => POST(post(addBody)));
    expect(res.status).toBe(200);
    expect(seenRoot).toBe(dir);
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../../app/api/project/organizer-arrangements/route.ts",
      ),
      "utf8",
    );
    expect(source).toMatch(/export const POST = withStorageContext\(/);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409", async () => {
    add.mockRejectedValueOnce(new ProjectLockedError(projectId));
    expect((await call(addBody)).status).toBe(401);
    rename.mockRejectedValueOnce(new MissingProjectKeyError(projectId));
    expect(
      (await call({ projectId, op: "rename", id: generateUUID(), name: "x" }))
        .status,
    ).toBe(409);
  });

  it("does not turn an unexpected core failure into a refusal or success", async () => {
    del.mockRejectedValueOnce(new Error("disk exploded"));
    // withStorageContext rethrows a non-locked error (Next.js answers 500); the
    // route must not catch it into a refusal body or an ok:true body.
    await expect(
      call({ projectId, op: "delete", id: generateUUID() }),
    ).rejects.toThrow("disk exploded");
  });

  it("calls no paired-device limit check (FR-14)", async () => {
    const source = await fs.readFile(
      path.resolve(
        __dirname,
        "../../app/api/project/organizer-arrangements/route.ts",
      ),
      "utf8",
    );
    expect(source).not.toMatch(/checkLimit|limits-check|refusalFor/);
  });
});
