import fs, {
  readdir as readdirSpy,
  readFile as readFileSpy,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  resolveProjectTypes,
  listProjectTypes,
  getProjectType,
  clearProjectTypeCache,
  resolveBuiltInProjectTypesDir,
} from "../../src/lib/projectTypes";

// Passthrough spies so a test can assert which paths the resolver reads.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    default: actual,
    readdir: vi.fn(actual.readdir),
    readFile: vi.fn(actual.readFile),
  };
});

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

    const list = await listProjectTypes(false, true);
    expect(list.length).toBe(1);
    expect(list[0].spec.id).toBe("novel");

    const byId = await getProjectType("novel", false, false);
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

    const list = await listProjectTypes(false, true);
    // only the valid one should be returned
    expect(list.map((l) => l.spec.id)).toEqual(["short"]);
  });
  it("lists entries carrying spec, filePath and source built-in", async () => {
    const spec = { id: "short", name: "Short", folders: [{ name: "W" }] };
    await fs.writeFile(
      path.join(templatesDir, "short.json"),
      JSON.stringify(spec),
    );
    const list = await listProjectTypes(false, true);
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
    expect((await listProjectTypes(false)).map((l) => l.spec.id)).toEqual([
      "a",
    ]);
    await fs.writeFile(
      path.join(templatesDir, "b.json"),
      JSON.stringify({ id: "b", name: "B", folders: [{ name: "W" }] }),
    );
    // cached: b not yet visible
    expect((await listProjectTypes(false)).map((l) => l.spec.id)).toEqual([
      "a",
    ]);
    clearProjectTypeCache();
    expect(
      (await listProjectTypes(false)).map((l) => l.spec.id).sort(),
    ).toEqual(["a", "b"]);
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
      expect(
        (await listProjectTypes(false, true)).map((l) => l.spec.id),
      ).toEqual(["t"]);
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
  describe("saved side (Task 15)", () => {
    let savedStoreDir: string;
    let prevSaved: string | undefined;
    let prevDb: string | undefined;
    let prevSecret: string | undefined;
    const spec = (id: string) => ({
      id,
      name: id.toUpperCase(),
      folders: [{ name: "W" }],
    });

    beforeEach(async () => {
      savedStoreDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-saved-"));
      prevSaved = process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
      prevDb = process.env.DATABASE_URL;
      prevSecret = process.env.BETTER_AUTH_SECRET;
      delete process.env.DATABASE_URL;
      delete process.env.BETTER_AUTH_SECRET;
      process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = savedStoreDir;
      await fs.writeFile(
        path.join(templatesDir, "novel.json"),
        JSON.stringify(spec("novel")),
      );
    });

    afterEach(async () => {
      const restore = (k: string, v: string | undefined) => {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      };
      restore("GETWRITE_SAVED_PROJECT_TYPES_DIR", prevSaved);
      restore("DATABASE_URL", prevDb);
      restore("BETTER_AUTH_SECRET", prevSecret);
      await fs.rm(savedStoreDir, { recursive: true, force: true });
      vi.mocked(readdirSpy).mockClear();
      vi.mocked(readFileSpy).mockClear();
    });

    it("lists saved entries with source saved after the built-in ones", async () => {
      await fs.writeFile(
        path.join(savedStoreDir, "mine.json"),
        JSON.stringify(spec("mine")),
      );
      const r = await resolveProjectTypes(false);
      expect(r.savedStatus).toBe("ok");
      expect(r.unusable).toEqual([]);
      expect(r.entries.map((e) => [e.spec.id, e.source])).toEqual([
        ["novel", "built-in"],
        ["mine", "saved"],
      ]);
      const saved = r.entries[1];
      expect(saved.filePath).toBe(path.join(savedStoreDir, "mine.json"));
      expect(saved.fileName).toBe("mine.json");
      expect((await getProjectType("mine", false))?.source).toBe("saved");
    });

    it.each([undefined, ""])(
      "gives built-in only and not-configured when the variable is %j",
      async (value) => {
        if (value === undefined)
          delete process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
        else process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = value;
        const r = await resolveProjectTypes(false);
        expect(r.savedStatus).toBe("not-configured");
        expect(r.unusable).toEqual([]);
        expect(r.entries.map((e) => e.source)).toEqual(["built-in"]);
      },
    );

    it("reads nothing but the built-in directory when the variable is unset", async () => {
      delete process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
      await fs.writeFile(
        path.join(savedStoreDir, "mine.json"),
        JSON.stringify(spec("mine")),
      );
      vi.mocked(readdirSpy).mockClear();
      vi.mocked(readFileSpy).mockClear();
      await resolveProjectTypes(false);
      const read = [
        ...vi.mocked(readdirSpy).mock.calls,
        ...vi.mocked(readFileSpy).mock.calls,
      ].map((c) => String(c[0]));
      expect(read.length).toBeGreaterThan(0);
      for (const p of read) {
        expect(
          p === templatesDir || p.startsWith(templatesDir + path.sep),
        ).toBe(true);
      }
    });

    it("gives built-in only and not-configured when hosted auth is active", async () => {
      await fs.writeFile(
        path.join(savedStoreDir, "mine.json"),
        JSON.stringify(spec("mine")),
      );
      vi.mocked(readdirSpy).mockClear();
      const r = await resolveProjectTypes(true);
      expect(r.savedStatus).toBe("not-configured");
      expect(r.entries.map((e) => e.source)).toEqual(["built-in"]);
      const read = vi.mocked(readdirSpy).mock.calls.map((c) => String(c[0]));
      expect(read).not.toContain(savedStoreDir);
    });

    it("treats an absent saved directory as ok with no entries", async () => {
      process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = path.join(
        savedStoreDir,
        "not-yet",
      );
      const r = await resolveProjectTypes(false);
      expect(r.savedStatus).toBe("ok");
      expect(r.unusable).toEqual([]);
      expect(r.entries.map((e) => e.source)).toEqual(["built-in"]);
    });

    it("reports unreadable (not empty) for a readdir error other than ENOENT", async () => {
      // A regular file where a directory is expected: readdir fails ENOTDIR.
      const asFile = path.join(savedStoreDir, "a-file");
      await fs.writeFile(asFile, "x");
      process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = asFile;
      const r = await resolveProjectTypes(false);
      expect(r.savedStatus).toBe("unreadable");
      expect(r.entries.map((e) => e.source)).toEqual(["built-in"]);
    });

    it("lists unparseable, invalid and unreadable files with a reason and no content", async () => {
      await fs.writeFile(
        path.join(savedStoreDir, "broken.json"),
        "{ SECRET-CONTENT: nope",
      );
      await fs.writeFile(
        path.join(savedStoreDir, "invalid.json"),
        JSON.stringify({ id: "Bad ID!", name: "SECRET-NAME", folders: [] }),
      );
      // A .json entry that is a directory cannot be read as a file.
      await fs.mkdir(path.join(savedStoreDir, "dir.json"));
      await fs.writeFile(
        path.join(savedStoreDir, "ok.json"),
        JSON.stringify(spec("ok")),
      );
      await fs.writeFile(path.join(savedStoreDir, "notes.txt"), "ignored");
      const r = await resolveProjectTypes(false);
      expect(r.savedStatus).toBe("ok");
      expect(r.entries.filter((e) => e.source === "saved")).toHaveLength(1);
      expect(
        [...r.unusable].sort((a, b) => a.fileName.localeCompare(b.fileName)),
      ).toEqual([
        { fileName: "broken.json", reason: "unparseable" },
        { fileName: "dir.json", reason: "unreadable" },
        { fileName: "invalid.json", reason: "invalid" },
      ]);
      expect(JSON.stringify(r.unusable)).not.toMatch(/SECRET/);
    });

    it("lists a saved file that fails a FR-28 rule as invalid and does not return it", async () => {
      await fs.writeFile(
        path.join(savedStoreDir, "blank-status.json"),
        JSON.stringify({ ...spec("blank-status"), statuses: ["Draft", ""] }),
      );
      await fs.writeFile(
        path.join(savedStoreDir, "ok.json"),
        JSON.stringify(spec("ok")),
      );
      const r = await resolveProjectTypes(false);
      expect(r.unusable).toEqual([
        { fileName: "blank-status.json", reason: "invalid" },
      ]);
      expect(
        r.entries.filter((e) => e.source === "saved").map((e) => e.spec.id),
      ).toEqual(["ok"]);
    });

    it("shows a saved file written between two calls with no cache clearing", async () => {
      expect((await listProjectTypes(false)).map((e) => e.spec.id)).toEqual([
        "novel",
      ]);
      await fs.writeFile(
        path.join(savedStoreDir, "late.json"),
        JSON.stringify(spec("late")),
      );
      expect((await listProjectTypes(false)).map((e) => e.spec.id)).toEqual([
        "novel",
        "late",
      ]);
      await fs.rm(path.join(savedStoreDir, "late.json"));
      expect((await getProjectType("late", false)) === undefined).toBe(true);
    });

    it("keeps the built-in cache cleared by clearProjectTypeCache", async () => {
      await listProjectTypes(false);
      await fs.writeFile(
        path.join(templatesDir, "later.json"),
        JSON.stringify(spec("later")),
      );
      expect((await listProjectTypes(false)).map((e) => e.spec.id)).toEqual([
        "novel",
      ]);
      clearProjectTypeCache();
      expect(
        (await listProjectTypes(false)).map((e) => e.spec.id).sort(),
      ).toEqual(["later", "novel"]);
    });
  });
});
