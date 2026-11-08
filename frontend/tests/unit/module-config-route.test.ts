/**
 * Feature 103 Task 8: PUT /api/project/modules route. Sets
 * config.modules[moduleId]. projectId and module id are validated; no client
 * path is accepted; an unknown body key is refused with the core's message;
 * locked-access errors propagate to withStorageContext (401/409); switching a
 * module off then on changes only that config entry on disk (FR-6 a).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/module-config-core", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../src/lib/models/module-config-core")
    >();
  return {
    ...actual,
    setModuleEnabledCore: vi.fn(actual.setModuleEnabledCore),
  };
});

import { PUT } from "../../app/api/project/modules/route";
import {
  MODULE_SWITCH_MESSAGES,
  setModuleEnabledCore,
} from "../../src/lib/models/module-config-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";
import { getStorageContext } from "../../src/lib/models/storage-context";

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.mocked(setModuleEnabledCore).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-mod-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "mods" }), null, 2),
    "utf8",
  );
  return { dir, id, root };
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

function put(body: unknown): never {
  return new Request("http://localhost/api/project/modules", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

async function snapshot(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const walk = async (d: string): Promise<void> => {
    for (const e of await fs.readdir(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else
        out.set(
          path.relative(root, full),
          (await fs.readFile(full)).toString("base64"),
        );
    }
  };
  await walk(root);
  return out;
}

const parse = (b64: string | undefined): { config: Record<string, unknown> } =>
  JSON.parse(Buffer.from(b64 ?? "", "base64").toString("utf8"));

describe("PUT /api/project/modules", () => {
  it("sets the entry and returns the stored map", async () => {
    const { dir, id } = await setup();
    const res = await withDir(dir, () =>
      PUT(put({ projectId: id, moduleId: "sources", enabled: false })),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ modules: { sources: false } });
    expect(setModuleEnabledCore).toHaveBeenLastCalledWith({
      projectId: id,
      moduleId: "sources",
      enabled: false,
    });
  });

  it("leaves every file but the config.modules entry byte-identical across off then on (FR-6 a)", async () => {
    const { dir, id, root } = await setup();
    const sourceId = generateUUID();
    await fs.mkdir(path.join(root, "resources", sourceId), { recursive: true });
    await fs.mkdir(path.join(root, "meta", "index"), { recursive: true });
    await fs.mkdir(path.join(root, "revisions", sourceId, "v-1"), {
      recursive: true,
    });
    const files: Record<string, string> = {
      [path.join("resources", sourceId, "content.txt")]: "A source body.\n",
      [path.join("resources", sourceId, "content.tiptap.json")]:
        '{"type":"doc"}',
      [path.join("meta", `resource-${sourceId}.meta.json`)]: JSON.stringify(
        { id: sourceId, type: "source", attachments: [] },
        null,
        2,
      ),
      [path.join("meta", "index", "inverted.json")]: `{"a":["${sourceId}"]}`,
      [path.join("revisions", sourceId, "v-1", "content.txt")]: "old body\n",
    };
    for (const [rel, body] of Object.entries(files)) {
      await fs.writeFile(path.join(root, rel), body);
    }

    const before = await snapshot(root);
    const beforeProject = parse(before.get(PROJECT_FILENAME));

    for (const isEnabled of [false, true]) {
      const res = await withDir(dir, () =>
        PUT(put({ projectId: id, moduleId: "sources", enabled: isEnabled })),
      );
      expect(res.status).toBe(200);
      const after = await snapshot(root);
      expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
      for (const [file, bytes] of before) {
        if (file === PROJECT_FILENAME) continue;
        expect(after.get(file), file).toBe(bytes);
      }
      const project = parse(after.get(PROJECT_FILENAME));
      expect(project.config.modules).toEqual({ sources: isEnabled });
      delete project.config.modules;
      expect(project).toEqual(beforeProject);
    }
  });

  it("returns the uniform 400 for an invalid projectId and 400 for bad JSON", async () => {
    const { dir } = await setup();
    const res = await withDir(dir, () =>
      PUT(put({ projectId: "nope", moduleId: "sources", enabled: true })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
    const bad = await withDir(dir, () =>
      PUT(
        new Request("http://localhost/api/project/modules", {
          method: "PUT",
          body: "{",
        }) as never,
      ),
    );
    expect(bad.status).toBe(400);
  });

  it("returns the core's message as the 400 body for a bad module id, enabled and an unknown key", async () => {
    const { dir, id, root } = await setup();
    const before = await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8");
    const cases: Array<[unknown, string]> = [
      [
        { projectId: id, moduleId: "../x", enabled: true },
        MODULE_SWITCH_MESSAGES.moduleId,
      ],
      [
        { projectId: id, moduleId: "sources", enabled: "yes" },
        MODULE_SWITCH_MESSAGES.enabled,
      ],
      [
        { projectId: id, moduleId: "sources", enabled: true, path: "/tmp" },
        MODULE_SWITCH_MESSAGES.unknownKey,
      ],
      [["x"], MODULE_SWITCH_MESSAGES.shape],
    ];
    for (const [body, message] of cases) {
      const res = await withDir(dir, () => PUT(put(body)));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: message });
    }
    expect(await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8")).toBe(
      before,
    );
  });

  it("refuses a client-supplied path and writes nothing outside the project", async () => {
    const { dir, id } = await setup();
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "gw-mod-other-"));
    tmpDirs.push(other);
    const res = await withDir(dir, () =>
      PUT(
        put({
          projectId: id,
          moduleId: "sources",
          enabled: true,
          path: other,
          projectRoot: other,
        }),
      ),
    );
    expect(res.status).toBe(400);
    expect(await fs.readdir(other)).toEqual([]);
  });

  it("runs the core inside a request-scoped StorageContext (withStorageContext)", async () => {
    const { dir, id } = await setup();
    let seenRoot: string | undefined;
    vi.mocked(setModuleEnabledCore).mockImplementationOnce(async () => {
      seenRoot = getStorageContext()?.tenantRoot;
      return { modules: { sources: true } };
    });
    const res = await withDir(dir, () =>
      PUT(put({ projectId: id, moduleId: "sources", enabled: true })),
    );
    expect(res.status).toBe(200);
    expect(seenRoot).toBe(dir);
    const source = await fs.readFile(
      path.resolve(__dirname, "../../app/api/project/modules/route.ts"),
      "utf8",
    );
    expect(source).toMatch(/export const PUT = withStorageContext\(/);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409", async () => {
    const { dir, id } = await setup();
    vi.mocked(setModuleEnabledCore).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    const locked = await withDir(dir, () =>
      PUT(put({ projectId: id, moduleId: "sources", enabled: true })),
    );
    expect(locked.status).toBe(401);
    vi.mocked(setModuleEnabledCore).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    const keyless = await withDir(dir, () =>
      PUT(put({ projectId: id, moduleId: "sources", enabled: true })),
    );
    expect(keyless.status).toBe(409);
  });
});
