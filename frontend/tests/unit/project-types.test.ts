import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  listProjectTypes,
  getProjectType,
  clearProjectTypeCache,
  resolveBuiltInProjectTypesDir,
} from "../../src/lib/projectTypes";

// Project-type templates are app-bundled config read from the real filesystem
// (never the tenant storage adapter), so the loader is pointed at a real temp
// directory via GETWRITE_PROJECT_TYPES_DIR rather than a virtualized adapter.
describe("projectTypes loader (T005)", () => {
  let templatesDir: string;
  let savedDir: string | undefined;
  let savedTemplatesEnv: string | undefined;

  beforeEach(async () => {
    templatesDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-projtypes-"));
    savedDir = process.env.GETWRITE_PROJECT_TYPES_DIR;
    savedTemplatesEnv = process.env.GETWRITE_TEMPLATES_DIR;
    delete process.env.GETWRITE_TEMPLATES_DIR;
    process.env.GETWRITE_PROJECT_TYPES_DIR = templatesDir;
    clearProjectTypeCache();
  });

  afterEach(async () => {
    if (savedDir === undefined) delete process.env.GETWRITE_PROJECT_TYPES_DIR;
    else process.env.GETWRITE_PROJECT_TYPES_DIR = savedDir;
    if (savedTemplatesEnv === undefined)
      delete process.env.GETWRITE_TEMPLATES_DIR;
    else process.env.GETWRITE_TEMPLATES_DIR = savedTemplatesEnv;
    await fs.rm(templatesDir, { recursive: true, force: true });
  });

  it("loads valid project-type JSON files", async () => {
    const spec = {
      id: "novel",
      name: "Novel",
      folders: [{ name: "Workspace" }, { name: "Chapters" }],
    };
    await fs.writeFile(
      path.join(templatesDir, "novel.json"),
      JSON.stringify(spec),
    );

    const list = await listProjectTypes(true);
    expect(list.length).toBe(1);
    expect(list[0].spec.id).toBe("novel");

    const byId = await getProjectType("novel", false);
    expect(byId).toBeDefined();
    expect(byId?.spec.name).toBe("Novel");
  });

  it("skips invalid JSON or invalid specs", async () => {
    // invalid JSON
    await fs.writeFile(
      path.join(templatesDir, "bad.json"),
      "{ not: valid json",
    );

    // invalid schema (id violates the lowercase slug pattern)
    const invalidSpec = {
      id: "Bad ID!",
      name: "Bad",
      folders: [{ name: "Chapters" }],
    };
    await fs.writeFile(
      path.join(templatesDir, "invalid.json"),
      JSON.stringify(invalidSpec),
    );

    // valid one
    const ok = { id: "short", name: "Short", folders: [{ name: "Workspace" }] };
    await fs.writeFile(
      path.join(templatesDir, "short.json"),
      JSON.stringify(ok),
    );

    const list = await listProjectTypes(true);
    // only the valid one should be returned
    expect(list.map((l) => l.spec.id)).toEqual(["short"]);
  });
  it("lists entries carrying spec, filePath and source built-in", async () => {
    const spec = { id: "short", name: "Short", folders: [{ name: "W" }] };
    await fs.writeFile(
      path.join(templatesDir, "short.json"),
      JSON.stringify(spec),
    );
    const list = await listProjectTypes(true);
    expect(list).toHaveLength(1);
    expect(list[0].source).toBe("built-in");
    expect(list[0].filePath).toBe(path.join(templatesDir, "short.json"));
    expect(list[0].spec.id).toBe("short");
  });

  it("clearProjectTypeCache makes the next call re-read the directory", async () => {
    await fs.writeFile(
      path.join(templatesDir, "a.json"),
      JSON.stringify({ id: "a", name: "A", folders: [{ name: "W" }] }),
    );
    expect((await listProjectTypes()).map((l) => l.spec.id)).toEqual(["a"]);
    await fs.writeFile(
      path.join(templatesDir, "b.json"),
      JSON.stringify({ id: "b", name: "B", folders: [{ name: "W" }] }),
    );
    // cached: b not yet visible
    expect((await listProjectTypes()).map((l) => l.spec.id)).toEqual(["a"]);
    clearProjectTypeCache();
    expect((await listProjectTypes()).map((l) => l.spec.id).sort()).toEqual([
      "a",
      "b",
    ]);
  });

  describe("resolveBuiltInProjectTypesDir", () => {
    it("prefers GETWRITE_PROJECT_TYPES_DIR over GETWRITE_TEMPLATES_DIR", async () => {
      process.env.GETWRITE_TEMPLATES_DIR = "/somewhere/else";
      expect(await resolveBuiltInProjectTypesDir()).toBe(templatesDir);
    });

    it("uses GETWRITE_TEMPLATES_DIR when GETWRITE_PROJECT_TYPES_DIR is unset", async () => {
      delete process.env.GETWRITE_PROJECT_TYPES_DIR;
      process.env.GETWRITE_TEMPLATES_DIR = templatesDir;
      expect(await resolveBuiltInProjectTypesDir()).toBe(templatesDir);
      const spec = { id: "t", name: "T", folders: [{ name: "W" }] };
      await fs.writeFile(
        path.join(templatesDir, "t.json"),
        JSON.stringify(spec),
      );
      expect((await listProjectTypes(true)).map((l) => l.spec.id)).toEqual([
        "t",
      ]);
    });

    it("treats an empty GETWRITE_PROJECT_TYPES_DIR as unset", async () => {
      process.env.GETWRITE_PROJECT_TYPES_DIR = "";
      process.env.GETWRITE_TEMPLATES_DIR = templatesDir;
      expect(await resolveBuiltInProjectTypesDir()).toBe(templatesDir);
    });

    it("falls back to the existing probe order when neither is set", async () => {
      delete process.env.GETWRITE_PROJECT_TYPES_DIR;
      delete process.env.GETWRITE_TEMPLATES_DIR;
      const dir = await resolveBuiltInProjectTypesDir();
      expect(dir).toMatch(/getwrite-config[\\/]templates[\\/]project-types$/);
    });
  });
});
