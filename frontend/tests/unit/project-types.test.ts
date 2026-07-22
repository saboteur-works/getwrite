import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  listProjectTypes,
  getProjectType,
  clearProjectTypeCache,
} from "../../src/lib/projectTypes";

// Project-type templates are app-bundled config read from the real filesystem
// (never the tenant storage adapter), so the loader is pointed at a real temp
// directory via GETWRITE_PROJECT_TYPES_DIR rather than a virtualized adapter.
describe("projectTypes loader (T005)", () => {
  let templatesDir: string;
  let savedDir: string | undefined;

  beforeEach(async () => {
    templatesDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-projtypes-"));
    savedDir = process.env.GETWRITE_PROJECT_TYPES_DIR;
    process.env.GETWRITE_PROJECT_TYPES_DIR = templatesDir;
    clearProjectTypeCache();
  });

  afterEach(async () => {
    if (savedDir === undefined) delete process.env.GETWRITE_PROJECT_TYPES_DIR;
    else process.env.GETWRITE_PROJECT_TYPES_DIR = savedDir;
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
});
