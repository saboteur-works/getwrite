import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";
import {
  createProjectFromType,
  createResourceFromTemplate,
  saveResourceTemplate,
  readSidecar,
  writeSidecar,
} from "@gw/core";
import registerTemplates from "../src/commands/templates";

// Feature 73 (FR-10, FR-12, FR-15, FR-22, FR-24, FR-26): behaviour of the
// registered `templates` commands, driven through `new Command()` +
// `registerTemplates` + `parseAsync` (the shipped path), not the unbundled
// `main` in cli/src/templates.ts.

const BLANK_SPEC = path.resolve(
  __dirname,
  "../../getwrite-config/templates/project-types/blank_project_type.json",
);

describe("registered templates commands", () => {
  let root: string;
  let exitCodes: number[];
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errSpy: ReturnType<typeof vi.spyOn>;
  let stdout: string[];
  let stderr: string[];

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-templates-reg-"));
    await createProjectFromType({
      projectRoot: root,
      spec: BLANK_SPEC,
      name: "Registered Commands",
    });
    stdout = [];
    stderr = [];
    exitCodes = [];
    exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      exitCodes.push(code ?? 0);
    }) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      stdout.push(a.join(" "));
    });
    errSpy = vi
      .spyOn(console, "error")
      .mockImplementation((...a: unknown[]) => {
        stderr.push(a.join(" "));
      });
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errSpy.mockRestore();
    // Background indexing started by resource creation may still be writing
    // into meta/; retry the removal rather than racing it.
    await fs.rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 50,
    });
  });

  /** Runs one registered command; returns the exit code (0 when none). */
  async function run(...args: string[]): Promise<number> {
    const program = new Command();
    program.exitOverride();
    program.configureOutput({
      writeOut: (s) => stdout.push(s),
      writeErr: (s) => stderr.push(s),
    });
    registerTemplates(program);
    exitCodes.length = 0;
    await program.parseAsync(["node", "test", "templates", ...args]);
    // The mocked process.exit does not stop execution; the first call is the
    // code the command chose.
    return exitCodes[0] ?? 0;
  }

  /** An app-layout text resource, optionally carrying a subtype. */
  async function seedResource(opts?: {
    subtype?: string;
    body?: string;
    name?: string;
  }): Promise<string> {
    await saveResourceTemplate(root, {
      id: "seed-tpl",
      name: "Seed",
      type: "text",
      plainText: opts?.body ?? "Seed body",
      userMetadata: { status: "draft" },
      ...(opts?.subtype !== undefined ? { resourceSubtype: opts.subtype } : {}),
    } as never);
    const created = (await createResourceFromTemplate(root, "seed-tpl", {
      name: opts?.name ?? "Source",
    })) as { id: string };
    return created.id;
  }

  const tplPath = (id: string): string =>
    path.join(root, "meta", "templates", `${id}.json`);

  async function readTemplate(id: string): Promise<Record<string, unknown>> {
    return JSON.parse(await fs.readFile(tplPath(id), "utf8"));
  }

  async function noTemplate(id: string): Promise<void> {
    await expect(fs.stat(tplPath(id))).rejects.toMatchObject({
      code: "ENOENT",
    });
  }

  describe("save-from-resource", () => {
    it("prints exactly `Saved template <id>` and writes the Task 7 key set", async () => {
      const rid = await seedResource({ subtype: "scene" });
      stdout.length = 0;

      const code = await run("save-from-resource", root, rid, "scene-tpl");

      expect(code).toBe(0);
      expect(stdout).toEqual(["Saved template scene-tpl"]);
      expect(stderr).toEqual([]);
      const parsed = await readTemplate("scene-tpl");
      expect(Object.keys(parsed).sort()).toEqual([
        "id",
        "name",
        "plainText",
        "resourceSubtype",
        "type",
        "userMetadata",
      ]);
      expect(parsed.id).toBe("scene-tpl");
      expect(parsed.name).toBe("Source");
      expect(parsed.type).toBe("text");
      expect(parsed.plainText).toBe("Seed body");
      expect(parsed.resourceSubtype).toBe("scene");
      expect(parsed.userMetadata).toEqual({ status: "draft" });
    });

    it("--name overrides the template name", async () => {
      const rid = await seedResource();
      const code = await run(
        "save-from-resource",
        root,
        rid,
        "named-tpl",
        "--name",
        "Custom Name",
      );
      expect(code).toBe(0);
      expect((await readTemplate("named-tpl")).name).toBe("Custom Name");
    });

    it("overwrites an existing template file without prompting", async () => {
      const rid = await seedResource({ body: "Second body" });
      await saveResourceTemplate(root, {
        id: "again",
        name: "Old",
        type: "text",
        plainText: "Old body",
      } as never);

      const code = await run("save-from-resource", root, rid, "again");

      expect(code).toBe(0);
      expect(stdout).toContain("Saved template again");
      const parsed = await readTemplate("again");
      expect(parsed.plainText).toBe("Second body");
      expect(parsed.name).toBe("Source");
    });

    it("exits 2 with `Error: <message>` and writes nothing for a missing sidecar", async () => {
      const missing = "11111111-1111-4111-8111-111111111111";
      const code = await run("save-from-resource", root, missing, "no-sidecar");
      expect(code).toBe(2);
      expect(stderr.join("\n")).toMatch(/^Error: .*sidecar metadata/);
      expect(stderr.join("\n")).toContain(missing);
      await noTemplate("no-sidecar");
    });

    it("exits 2 and writes nothing for an image source", async () => {
      const rid = await seedResource();
      const meta = (await readSidecar(root, rid)) as Record<string, never>;
      await writeSidecar(root, rid, { ...meta, type: "image" } as never);

      const code = await run("save-from-resource", root, rid, "from-image");

      expect(code).toBe(2);
      expect(stderr.join("\n")).toMatch(/^Error: .*only text resources/);
      await noTemplate("from-image");
    });

    it("exits 2 and writes nothing for an invalid (blank) subtype", async () => {
      const rid = await seedResource();
      const meta = (await readSidecar(root, rid)) as Record<string, never>;
      await writeSidecar(root, rid, {
        ...meta,
        resourceSubtype: "   ",
      } as never);

      const code = await run("save-from-resource", root, rid, "bad-subtype");

      expect(code).toBe(2);
      expect(stderr.join("\n")).toMatch(/^Error: .*resourceSubtype/);
      await noTemplate("bad-subtype");
    });

    it("exits 2 and writes nothing when the body is unreadable", async () => {
      const rid = await seedResource();
      const base = path.join(root, "resources", rid);
      await fs.rm(path.join(base, "content.txt"), { force: true });
      await fs.rm(path.join(base, "content.tiptap.json"), { force: true });

      const code = await run("save-from-resource", root, rid, "no-body");

      expect(code).toBe(2);
      expect(stderr.join("\n")).toMatch(/^Error: .*body could not be read/);
      await noTemplate("no-body");
    });

    it("is refused with exit 3 on an encrypted project and writes nothing", async () => {
      const rid = await seedResource();
      await fs.writeFile(
        path.join(root, ".encrypted.json"),
        JSON.stringify({
          version: 1,
          encrypted: true,
          encryptedAt: new Date().toISOString(),
        }),
        "utf-8",
      );

      const code = await run("save-from-resource", root, rid, "sealed");

      expect(code).toBe(3);
      expect(stderr.length).toBeGreaterThan(0);
      await noTemplate("sealed");
    });
  });

  describe("create", () => {
    it("after save-from-resource, creates a resource carrying the subtype; stdout is exactly `Created resource <id>`", async () => {
      const rid = await seedResource({ subtype: "scene" });
      expect(await run("save-from-resource", root, rid, "scene-tpl")).toBe(0);
      stdout.length = 0;

      const code = await run("create", root, "scene-tpl", "Fresh");

      expect(code).toBe(0);
      expect(stdout).toHaveLength(1);
      const m = stdout[0].match(/^Created resource (\S+)$/);
      expect(m).not.toBeNull();
      const newId = m![1];
      const sidecar = (await readSidecar(root, newId)) as Record<
        string,
        unknown
      >;
      expect(sidecar.resourceSubtype).toBe("scene");
      expect(sidecar.name).toBe("Fresh");
      // App layout: content files under resources/<id>/.
      await expect(
        fs.stat(path.join(root, "resources", newId, "content.tiptap.json")),
      ).resolves.toBeTruthy();
    });

    it.each(["--folder", "--vars", "--dry-run"])(
      "rejects %s as an unknown option",
      async (flag) => {
        const rid = await seedResource();
        expect(await run("save-from-resource", root, rid, "t")).toBe(0);
        const args =
          flag === "--dry-run"
            ? ["create", root, "t", flag]
            : ["create", root, "t", flag, "x"];
        const program = new Command();
        program.exitOverride();
        program.configureOutput({
          writeOut: () => undefined,
          writeErr: () => undefined,
        });
        registerTemplates(program);
        await expect(
          program.parseAsync(["node", "test", "templates", ...args]),
        ).rejects.toMatchObject({ code: "commander.unknownOption" });
      },
    );
  });

  describe("duplicate", () => {
    it("copies subtype, writes a single canonical revision, prints `Duplicated resource -> <newId>`", async () => {
      const rid = await seedResource({ subtype: "chapter" });
      stdout.length = 0;

      const code = await run("duplicate", root, rid);

      expect(code).toBe(0);
      expect(stdout).toHaveLength(1);
      const m = stdout[0].match(/^Duplicated resource -> (\S+)$/);
      expect(m).not.toBeNull();
      const newId = m![1];
      expect(newId).not.toBe(rid);

      const sidecar = (await readSidecar(root, newId)) as Record<
        string,
        unknown
      >;
      expect(sidecar.resourceSubtype).toBe("chapter");

      const revRoot = path.join(root, "revisions", newId);
      const revDirs = (await fs.readdir(revRoot)).filter((d) =>
        d.startsWith("v-"),
      );
      expect(revDirs).toHaveLength(1);
      const meta = JSON.parse(
        await fs.readFile(
          path.join(revRoot, revDirs[0], "metadata.json"),
          "utf8",
        ),
      );
      expect(meta.isCanonical).toBe(true);
    });
  });

  describe("list", () => {
    it("prints `<id>\\t<name>\\t<type>` per template; a subtype adds no field", async () => {
      await saveResourceTemplate(root, {
        id: "plain",
        name: "Plain",
        type: "text",
        plainText: "",
      } as never);
      await saveResourceTemplate(root, {
        id: "typed",
        name: "Typed",
        type: "text",
        plainText: "",
        resourceSubtype: "scene",
      } as never);

      const code = await run("list", root);

      expect(code).toBe(0);
      expect([...stdout].sort()).toEqual(
        ["plain\tPlain\ttext", "typed\tTyped\ttext"].sort(),
      );
    });
  });
});
