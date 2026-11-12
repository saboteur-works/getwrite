// Feature 109, Task 35 (FR-18, OQ-11, OQ-12): project creation seeds a type's
// and the enabled modules' Organizer arrangements, resolving folder names to
// the created folders' ids with a second project.json write.
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createProjectFromType,
  type ProjectTypeSpec,
} from "../../src/lib/models/project-creator";
import {
  createProjectCore,
  createProjectCoreNative,
} from "../../src/lib/models/project-crud-core";
import type { ModuleManifestEntry } from "../../src/lib/models/modules/registry";
import type { OrganizerArrangement } from "../../src/lib/models/organizer-grid-types";
import { MODULE_MANIFEST } from "../../src/lib/models/modules/manifest";
import {
  createSavedProjectType,
  replaceSavedProjectType,
} from "../../src/lib/project-types-write-core";
import { clearProjectTypeCache } from "../../src/lib/projectTypes";
import * as io from "../../src/lib/models/io";

const nativeSpec = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock("../../src/lib/models/project-types-static", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/models/project-types-static")
    >();
  return {
    ...actual,
    getStaticProjectType: (id: string) =>
      id === "static-arr"
        ? nativeSpec.current
        : actual.getStaticProjectType(id),
  };
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENV_KEYS = [
  "GETWRITE_PROJECTS_DIR",
  "GETWRITE_SAVED_PROJECT_TYPES_DIR",
  "GETWRITE_PROJECT_TYPES_DIR",
  "GETWRITE_TEMPLATES_DIR",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
] as const;

type SeedLike = NonNullable<ModuleManifestEntry["arrangements"]>[number];

function seed(
  name: string,
  folderName: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name,
    source: { kind: "folder", folderName, scope: "children" },
    rows: "none",
    columns: "order",
    ...extra,
  };
}

function typeSpec(
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    name: id,
    folders: [{ name: "Workspace" }, { name: "Characters" }],
    ...extra,
  };
}

function asSpec(raw: Record<string, unknown>): ProjectTypeSpec {
  return raw as unknown as ProjectTypeSpec;
}

function moduleWith(
  id: string,
  arrangements: Record<string, unknown>[],
  defaultEnabled?: boolean,
): ModuleManifestEntry {
  return {
    id,
    indexSteps: [],
    arrangements: arrangements as unknown as SeedLike[],
    ...(defaultEnabled === undefined ? {} : { defaultEnabled }),
  };
}

async function readConfig(
  root: string,
): Promise<{ organizerArrangements?: OrganizerArrangement[] }> {
  const raw = JSON.parse(
    await fsp.readFile(path.join(root, "project.json"), "utf8"),
  ) as { config: { organizerArrangements?: OrganizerArrangement[] } };
  return raw.config;
}

function projectDir(projectsDir: string, rootPath: string | undefined): string {
  return path.join(projectsDir, path.basename(rootPath ?? ""));
}

describe("createProjectFromType: seeded arrangements (Feature 109, FR-18)", () => {
  let tmp: string;
  const extraDirs: string[] = [];
  beforeEach(async () => {
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "gw-arr-create-"));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fsp.rm(tmp, { recursive: true, force: true });
    for (const d of extraDirs.splice(0)) {
      await fsp.rm(d, { recursive: true, force: true });
    }
  });

  async function extraRoot(): Promise<string> {
    const d = await fsp.mkdtemp(path.join(os.tmpdir(), "gw-arr-create-"));
    extraDirs.push(d);
    return d;
  }

  it("copies a type's arrangements with fresh UUIDs and folder ids that exist", async () => {
    const result = await createProjectFromType({
      projectRoot: tmp,
      spec: asSpec(
        typeSpec("t", {
          arrangements: [
            seed("By status", "Characters", { rows: { kind: "status" } }),
            seed("Slug match", "characters"),
          ],
        }),
      ),
      name: "P",
    });
    const stored = (await readConfig(tmp)).organizerArrangements ?? [];
    expect(stored).toHaveLength(2);
    const characters = result.folders.find((f) => f.name === "Characters");
    for (const a of stored) {
      expect(a.id).toMatch(UUID_RE);
      expect(a.source).toEqual({
        kind: "folder",
        folderId: characters?.id,
        scope: "children",
      });
    }
    expect(new Set(stored.map((a) => a.id)).size).toBe(2);
    expect(stored[0].rows).toEqual({ kind: "status" });
    expect(result.project.config?.organizerArrangements).toEqual(stored);
    expect(result.skippedArrangements).toEqual([]);
  });

  it("writes project.json a second time, after the folders exist", async () => {
    const calls: string[] = [];
    const real = io.writeFile;
    vi.spyOn(io, "writeFile").mockImplementation(async (...args) => {
      if (String(args[0]).endsWith("project.json")) {
        const hasFolderJson = await fsp
          .stat(path.join(tmp, "folders", "characters", "folder.json"))
          .then(() => true)
          .catch(() => false);
        calls.push(hasFolderJson ? "after-folders" : "before-folders");
      }
      return real(...args);
    });
    await createProjectFromType({
      projectRoot: tmp,
      spec: asSpec(typeSpec("t", { arrangements: [seed("A", "Characters")] })),
    });
    expect(calls).toEqual(["before-folders", "after-folders"]);
  });

  it("leaves out a name resolving to no folder, records the reason, writes no dangling id", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await createProjectFromType({
      projectRoot: tmp,
      spec: asSpec(
        typeSpec("t", {
          arrangements: [seed("Ghost", "Nowhere"), seed("Real", "Workspace")],
        }),
      ),
    });
    const stored = (await readConfig(tmp)).organizerArrangements ?? [];
    expect(stored.map((a) => a.name)).toEqual(["Real"]);
    expect(result.skippedArrangements).toEqual([
      { name: "Ghost", reason: "folder-not-found" },
    ]);
    expect(warn).toHaveBeenCalled();
    const folderIds = new Set(result.folders.map((f) => f.id));
    for (const a of stored) {
      expect(
        a.source.kind === "folder" && folderIds.has(a.source.folderId),
      ).toBe(true);
    }
  });

  it("writes no key when every seed is unresolvable", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await createProjectFromType({
      projectRoot: tmp,
      spec: asSpec(typeSpec("t", { arrangements: [seed("Ghost", "Nowhere")] })),
    });
    expect("organizerArrangements" in (await readConfig(tmp))).toBe(false);
    expect(result.skippedArrangements).toHaveLength(1);
  });

  it("does not seed a smart-folder source (the type schema refuses it; nothing is written)", async () => {
    await expect(
      createProjectFromType({
        projectRoot: tmp,
        spec: asSpec(
          typeSpec("t", {
            arrangements: [
              {
                name: "Q",
                source: { kind: "smart-folder", queryId: "x" },
                rows: "none",
                columns: "order",
              },
            ],
          }),
        ),
      }),
    ).rejects.toThrow();
    expect(
      await fsp.stat(path.join(tmp, "project.json")).catch(() => null),
    ).toBeNull();
  });

  it("an invalid seed (blank name, via a module) is left out with a reason", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await createProjectFromType({
      projectRoot: tmp,
      spec: asSpec(typeSpec("t")),
      moduleManifest: [
        moduleWith("m", [seed("   ", "Workspace"), seed("Ok", "Workspace")]),
      ],
    });
    expect(
      ((await readConfig(tmp)).organizerArrangements ?? []).map((a) => a.name),
    ).toEqual(["Ok"]);
    expect(result.skippedArrangements).toEqual([
      { name: "   ", reason: "invalid" },
    ]);
  });

  it("adds enabled modules' arrangements after the type's; the type wins a duplicate name", async () => {
    const result = await createProjectFromType({
      projectRoot: tmp,
      spec: asSpec(
        typeSpec("t", { arrangements: [seed("Shared", "Characters")] }),
      ),
      moduleManifest: [
        moduleWith("m", [
          seed("shared", "Workspace"),
          seed("From module", "Workspace"),
        ]),
      ],
    });
    const stored = (await readConfig(tmp)).organizerArrangements ?? [];
    expect(stored.map((a) => a.name)).toEqual(["Shared", "From module"]);
    const characters = result.folders.find((f) => f.name === "Characters");
    expect(stored[0].source).toMatchObject({ folderId: characters?.id });
    expect(result.skippedArrangements).toEqual([
      { name: "shared", reason: "duplicate-name" },
    ]);
  });

  it("a module explicitly off adds none", async () => {
    await createProjectFromType({
      projectRoot: tmp,
      spec: asSpec(typeSpec("t", { modules: { m: false } })),
      moduleManifest: [moduleWith("m", [seed("X", "Workspace")])],
    });
    expect("organizerArrangements" in (await readConfig(tmp))).toBe(false);
  });

  it("a module with defaultEnabled false adds none unless the type turns it on", async () => {
    const off = await extraRoot();
    await createProjectFromType({
      projectRoot: off,
      spec: asSpec(typeSpec("t")),
      moduleManifest: [moduleWith("m", [seed("X", "Workspace")], false)],
    });
    expect("organizerArrangements" in (await readConfig(off))).toBe(false);

    const on = await extraRoot();
    await createProjectFromType({
      projectRoot: on,
      spec: asSpec(typeSpec("t", { modules: { m: true } })),
      moduleManifest: [moduleWith("m", [seed("X", "Workspace")], false)],
    });
    expect(
      ((await readConfig(on)).organizerArrangements ?? []).map((a) => a.name),
    ).toEqual(["X"]);
  });

  it("no shipped module seeds an arrangement", () => {
    for (const m of MODULE_MANIFEST) expect(m.arrangements).toBeUndefined();
  });

  it("a type with none creates a project with no key and one project.json write", async () => {
    const spy = vi.spyOn(io, "writeFile");
    const { project } = await createProjectFromType({
      projectRoot: tmp,
      spec: asSpec(typeSpec("t")),
    });
    expect("organizerArrangements" in (project.config ?? {})).toBe(false);
    expect("organizerArrangements" in (await readConfig(tmp))).toBe(false);
    expect(
      spy.mock.calls.filter((c) => String(c[0]).endsWith("project.json")),
    ).toHaveLength(1);
  });

  it("caps at 50: seeds past the limit are skipped with a reason", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const many = Array.from({ length: 52 }, (_, i) =>
      seed(`M${i}`, "Workspace"),
    );
    const result = await createProjectFromType({
      projectRoot: tmp,
      spec: asSpec(typeSpec("t")),
      moduleManifest: [moduleWith("m", many)],
    });
    expect((await readConfig(tmp)).organizerArrangements).toHaveLength(50);
    expect(result.skippedArrangements.map((s) => s.reason)).toEqual([
      "limit-reached",
      "limit-reached",
    ]);
  });
});

describe("creation through createProjectCore, native static path and no re-apply", () => {
  let root: string;
  let projectsDir: string;
  let savedDir: string;
  const original: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
    root = await fsp.mkdtemp(path.join(os.tmpdir(), "gw-arr-core-"));
    projectsDir = path.join(root, "projects");
    savedDir = path.join(root, "saved");
    const builtInDir = path.join(root, "builtin");
    await fsp.mkdir(projectsDir);
    await fsp.mkdir(builtInDir);
    delete process.env.GETWRITE_TEMPLATES_DIR;
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    process.env.GETWRITE_PROJECT_TYPES_DIR = builtInDir;
    process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = savedDir;
    clearProjectTypeCache();
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
    clearProjectTypeCache();
    await fsp.rm(root, { recursive: true, force: true });
  });

  it("createProjectCore seeds a saved type's arrangements", async () => {
    const saved = await createSavedProjectType(
      typeSpec("mine", { arrangements: [seed("A", "Characters")] }),
      false,
    );
    expect(saved.ok).toBe(true);
    const { project, folders } = await createProjectCore("P", "mine", false);
    const stored =
      (await readConfig(projectDir(projectsDir, project.rootPath)))
        .organizerArrangements ?? [];
    expect(stored).toHaveLength(1);
    expect(stored[0].source).toMatchObject({
      folderId: folders.find((f) => f.name === "Characters")?.id,
    });
  });

  it("createProjectCoreNative (static registry spec) yields the same result", async () => {
    nativeSpec.current = typeSpec("static-arr", {
      arrangements: [seed("A", "Characters")],
    });
    const { project, folders } = await createProjectCoreNative(
      "N",
      "static-arr",
    );
    const stored =
      (await readConfig(projectDir(projectsDir, project.rootPath)))
        .organizerArrangements ?? [];
    expect(stored.map((a) => a.name)).toEqual(["A"]);
    expect(stored[0].id).toMatch(UUID_RE);
    expect(stored[0].source).toMatchObject({
      kind: "folder",
      folderId: folders.find((f) => f.name === "Characters")?.id,
    });
  });

  it("saving or editing a type leaves an existing project's arrangements unchanged", async () => {
    await createSavedProjectType(
      typeSpec("mine", { arrangements: [seed("A", "Characters")] }),
      false,
    );
    const { project } = await createProjectCore("P", "mine", false);
    const file = path.join(
      projectDir(projectsDir, project.rootPath),
      "project.json",
    );
    const before = await fsp.readFile(file, "utf8");
    const replaced = await replaceSavedProjectType(
      typeSpec("mine", { arrangements: [seed("Changed", "Workspace")] }),
      false,
    );
    expect(replaced.ok).toBe(true);
    await createSavedProjectType(
      typeSpec("other", { arrangements: [seed("Z", "Workspace")] }),
      false,
    );
    expect(await fsp.readFile(file, "utf8")).toBe(before);
  });
});
