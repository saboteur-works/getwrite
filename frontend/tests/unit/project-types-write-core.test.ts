import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createSavedProjectType,
  replaceSavedProjectType,
  deleteSavedProjectType,
} from "../../src/lib/project-types-write-core";
import {
  clearProjectTypeCache,
  listProjectTypes,
} from "../../src/lib/projectTypes";

const ENV_KEYS = [
  "GETWRITE_SAVED_PROJECT_TYPES_DIR",
  "GETWRITE_PROJECT_TYPES_DIR",
  "GETWRITE_TEMPLATES_DIR",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
] as const;

function spec(id: string, name: string): Record<string, unknown> {
  return { id, name, folders: [{ name: "Workspace" }] };
}

describe("saved project types write core (Task 18)", () => {
  let root: string;
  let builtInDir: string;
  let savedDir: string;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
    root = await fsp.mkdtemp(path.join(os.tmpdir(), "gw-ptwrite-"));
    builtInDir = path.join(root, "builtin");
    savedDir = path.join(root, "saved");
    await fsp.mkdir(builtInDir);
    await fsp.writeFile(
      path.join(builtInDir, "novel.json"),
      JSON.stringify(spec("novel", "Novel")),
    );
    delete process.env.GETWRITE_TEMPLATES_DIR;
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.GETWRITE_PROJECT_TYPES_DIR = builtInDir;
    process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = savedDir;
    clearProjectTypeCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
    await fsp.chmod(savedDir, 0o700).catch(() => undefined);
    await fsp.rm(root, { recursive: true, force: true });
    clearProjectTypeCache();
  });

  describe("create", () => {
    it("creates the directory on first save and writes <id>.json", async () => {
      const result = await createSavedProjectType(spec("mine", "Mine"));
      expect(result).toMatchObject({ ok: true, fileName: "mine.json" });
      const written = JSON.parse(
        await fsp.readFile(path.join(savedDir, "mine.json"), "utf8"),
      );
      expect(written).toMatchObject({ id: "mine", name: "Mine" });
      expect(await fsp.readdir(savedDir)).toEqual(["mine.json"]);
    });

    it("a file the core accepts is listed by the resolver", async () => {
      await createSavedProjectType(spec("mine", "Mine"));
      const entries = await listProjectTypes();
      expect(
        entries.find((e) => e.spec.id === "mine" && e.source === "saved"),
      ).toBeDefined();
    });

    it("a second create of the same id fails with id-clash", async () => {
      await createSavedProjectType(spec("mine", "Mine"));
      const second = await createSavedProjectType(spec("mine", "Other"));
      expect(second).toMatchObject({
        ok: false,
        reason: "id-clash",
        conflictsWith: { id: "mine", source: "saved" },
      });
    });

    it("of two concurrent creates of one id exactly one succeeds", async () => {
      const results = await Promise.all([
        createSavedProjectType(spec("race", "Race A")),
        createSavedProjectType(spec("race", "Race B")),
      ]);
      expect(results.filter((r) => r.ok)).toHaveLength(1);
      const loser = results.find((r) => !r.ok);
      expect(loser).toMatchObject({ ok: false, reason: "id-clash" });
      expect(await fsp.readdir(savedDir)).toEqual(["race.json"]);
    });

    it("reports id-clash against a built-in id", async () => {
      const r = await createSavedProjectType(spec("novel", "Something"));
      expect(r).toMatchObject({
        ok: false,
        reason: "id-clash",
        conflictsWith: { id: "novel", source: "built-in" },
      });
    });

    it("reports name-clash after trim and case-folding, built-in and saved", async () => {
      const builtIn = await createSavedProjectType(spec("n2", "  novel "));
      expect(builtIn).toMatchObject({
        ok: false,
        reason: "name-clash",
        conflictsWith: { id: "novel", source: "built-in" },
      });
      await createSavedProjectType(spec("mine", "Mine"));
      const saved = await createSavedProjectType(spec("m2", " MINE"));
      expect(saved).toMatchObject({
        ok: false,
        reason: "name-clash",
        conflictsWith: { id: "mine", source: "saved" },
      });
    });

    it("refuses an invalid spec and writes nothing", async () => {
      const r = await createSavedProjectType({ id: "../x", name: "X" });
      expect(r).toMatchObject({ ok: false, reason: "invalid" });
      expect(fs.existsSync(savedDir)).toBe(false);
    });

    it("refuses an over-long id", async () => {
      const r = await createSavedProjectType(spec("a".repeat(200), "Long"));
      expect(r).toMatchObject({ ok: false, reason: "invalid" });
    });

    it("returns an error, not success, for a read-only directory", async () => {
      await fsp.mkdir(savedDir);
      await fsp.chmod(savedDir, 0o500);
      const r = await createSavedProjectType(spec("mine", "Mine"));
      expect(r).toMatchObject({ ok: false, reason: "write-failed" });
      expect(await fsp.readdir(savedDir)).toEqual([]);
    });
  });

  describe("replace", () => {
    it("replaces the file and does not clash with itself", async () => {
      await createSavedProjectType(spec("mine", "Mine"));
      const r = await replaceSavedProjectType({
        ...spec("mine", "mine"),
        description: "changed",
      });
      expect(r).toMatchObject({ ok: true, fileName: "mine.json" });
      const written = JSON.parse(
        await fsp.readFile(path.join(savedDir, "mine.json"), "utf8"),
      );
      expect(written.description).toBe("changed");
      expect(written.name).toBe("mine");
    });

    it("name-clashes with another saved type and a built-in", async () => {
      await createSavedProjectType(spec("a", "Alpha"));
      await createSavedProjectType(spec("b", "Beta"));
      expect(await replaceSavedProjectType(spec("b", "alpha "))).toMatchObject({
        ok: false,
        reason: "name-clash",
        conflictsWith: { id: "a", source: "saved" },
      });
      expect(await replaceSavedProjectType(spec("b", "NOVEL"))).toMatchObject({
        ok: false,
        reason: "name-clash",
        conflictsWith: { id: "novel", source: "built-in" },
      });
    });

    it("refuses a built-in id with reason built-in", async () => {
      const r = await replaceSavedProjectType(spec("novel", "Novel 2"));
      expect(r).toMatchObject({ ok: false, reason: "built-in" });
      expect(fs.existsSync(savedDir)).toBe(false);
    });

    it("refuses an id that was never saved with not-found", async () => {
      const r = await replaceSavedProjectType(spec("ghost", "Ghost"));
      expect(r).toMatchObject({ ok: false, reason: "not-found" });
    });

    it("keeps the previous file and leaves no temporary file when the write fails", async () => {
      await createSavedProjectType(spec("mine", "Mine"));
      const before = await fsp.readFile(path.join(savedDir, "mine.json"));
      vi.spyOn(fs, "renameSync").mockImplementation(() => {
        throw new Error("injected rename failure");
      });
      const r = await replaceSavedProjectType(spec("mine", "Renamed"));
      expect(r).toMatchObject({ ok: false, reason: "write-failed" });
      vi.restoreAllMocks();
      expect(await fsp.readFile(path.join(savedDir, "mine.json"))).toEqual(
        before,
      );
      expect(await fsp.readdir(savedDir)).toEqual(["mine.json"]);
    });
  });

  describe("delete", () => {
    it("removes only that file", async () => {
      await createSavedProjectType(spec("a", "Alpha"));
      await createSavedProjectType(spec("b", "Beta"));
      const r = await deleteSavedProjectType("a");
      expect(r).toMatchObject({ ok: true, fileName: "a.json" });
      expect(await fsp.readdir(savedDir)).toEqual(["b.json"]);
    });

    it("refuses a built-in id with reason built-in", async () => {
      const r = await deleteSavedProjectType("novel");
      expect(r).toMatchObject({ ok: false, reason: "built-in" });
      expect(fs.existsSync(path.join(builtInDir, "novel.json"))).toBe(true);
    });

    it("refuses an unsafe id and a missing id", async () => {
      expect(await deleteSavedProjectType("../x")).toMatchObject({
        ok: false,
        reason: "invalid",
      });
      expect(await deleteSavedProjectType("nope")).toMatchObject({
        ok: false,
        reason: "not-found",
      });
    });
  });

  describe("saving unavailable", () => {
    it("returns saving-unavailable when the variable is unset", async () => {
      delete process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
      for (const r of [
        await createSavedProjectType(spec("mine", "Mine")),
        await replaceSavedProjectType(spec("mine", "Mine")),
        await deleteSavedProjectType("mine"),
      ]) {
        expect(r).toMatchObject({ ok: false, reason: "saving-unavailable" });
      }
    });

    it("returns saving-unavailable when hosted auth is active", async () => {
      process.env.DATABASE_URL = "postgres://example.invalid/db";
      process.env.BETTER_AUTH_SECRET = "test-secret-value";
      for (const r of [
        await createSavedProjectType(spec("mine", "Mine")),
        await replaceSavedProjectType(spec("mine", "Mine")),
        await deleteSavedProjectType("mine"),
      ]) {
        expect(r).toMatchObject({ ok: false, reason: "saving-unavailable" });
      }
      expect(fs.existsSync(savedDir)).toBe(false);
    });
  });

  describe("built-in files are never modified", () => {
    function checksums(dir: string): Record<string, string> {
      const out: Record<string, string> = {};
      for (const entry of fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((x, y) => x.name.localeCompare(y.name))) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          for (const [k, v] of Object.entries(checksums(full))) {
            out[`${entry.name}/${k}`] = v;
          }
        } else {
          out[entry.name] = crypto
            .createHash("sha256")
            .update(fs.readFileSync(full))
            .digest("hex");
        }
      }
      return out;
    }

    it("checksums are identical after save, copy-save, rename and delete", async () => {
      // Read-only use of the real built-in directory.
      const real = path.resolve(
        __dirname,
        "../../../getwrite-config/templates/project-types",
      );
      process.env.GETWRITE_PROJECT_TYPES_DIR = real;
      clearProjectTypeCache();
      const before = checksums(real);
      expect(Object.keys(before).length).toBeGreaterThan(0);

      await createSavedProjectType(spec("fresh", "Fresh Type"));
      await createSavedProjectType(spec("fresh-copy", "Fresh Type Copy"));
      await replaceSavedProjectType(spec("fresh", "Fresh Renamed"));
      await replaceSavedProjectType(spec("novel", "Novel Hijack"));
      await deleteSavedProjectType("fresh");
      await deleteSavedProjectType("novel");
      await deleteSavedProjectType("fresh-copy");

      expect(checksums(real)).toEqual(before);
      expect(await fsp.readdir(savedDir)).toEqual([]);
    });
  });
});
