import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { clearProjectTypeCache } from "@gw/core";
import { main } from "../src/getwrite-cli";

// Feature 90 Task 26 (FR-16, FR-26): the CLI resolves project types through
// the resolver. Real orchestrators run against throwaway folders under
// os.tmpdir(); GETWRITE_SAVED_PROJECT_TYPES_DIR is always a throwaway folder
// or explicitly unset. Nothing here touches the repo's projects/ or any
// desktop app-data folder.

const FIXTURE_DOCX_PATH = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/docx/multi-heading.docx",
);
const BLANK_SPEC = path.resolve(
  __dirname,
  "../../getwrite-config/templates/project-types/blank_project_type.json",
);

const SAVED_ID = "my-saved-type";

describe("getwrite-cli project types (resolver)", () => {
  let tmpDirs: string[];
  let savedDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let stdout: string[];
  let stderr: string[];
  let prevSaved: string | undefined;

  async function tmp(prefix: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  async function exists(p: string): Promise<boolean> {
    return fs.access(p).then(
      () => true,
      () => false,
    );
  }

  async function run(...args: string[]): Promise<void> {
    await main(["node", "getwrite-cli", ...args]);
  }

  beforeEach(async () => {
    tmpDirs = [];
    prevSaved = process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
    savedDir = await tmp("gw-cli-saved-types-");
    const blank = JSON.parse(await fs.readFile(BLANK_SPEC, "utf8")) as Record<
      string,
      unknown
    >;
    await fs.writeFile(
      path.join(savedDir, `${SAVED_ID}.json`),
      JSON.stringify({ ...blank, id: SAVED_ID, name: "My Saved Type" }),
    );
    process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = savedDir;
    clearProjectTypeCache();
    stdout = [];
    stderr = [];
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => {
      stdout.push(a.join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => {
      stderr.push(a.join(" "));
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (prevSaved === undefined) {
      delete process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
    } else {
      process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = prevSaved;
    }
    clearProjectTypeCache();
    await Promise.all(
      tmpDirs.map((d) => fs.rm(d, { recursive: true, force: true })),
    );
  });

  it("import-docx --project-type <saved-id> works with no other change", async () => {
    const root = path.join(await tmp("gw-cli-docx-saved-"), "dest");
    await run(
      "project",
      "import-docx",
      FIXTURE_DOCX_PATH,
      root,
      "--project-type",
      SAVED_ID,
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
    const manifest = JSON.parse(
      await fs.readFile(path.join(root, "project.json"), "utf8"),
    ) as { projectType?: string };
    expect(manifest.projectType).toBe(SAVED_ID);
  });

  it("project create --project-type creates from a built-in id", async () => {
    const root = path.join(await tmp("gw-cli-create-builtin-"), "dest");
    await run("project", "create", root, "--project-type", "blank", "-n", "B");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(await exists(path.join(root, "project.json"))).toBe(true);
  });

  it("project create --project-type creates from a saved id", async () => {
    const root = path.join(await tmp("gw-cli-create-saved-"), "dest");
    await run("project", "create", root, "--project-type", SAVED_ID, "-n", "S");
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(await exists(path.join(root, "project.json"))).toBe(true);
  });

  it("refuses --project-type together with --spec, before any write", async () => {
    const root = path.join(await tmp("gw-cli-create-both-"), "dest");
    await run(
      "project",
      "create",
      root,
      "--project-type",
      "blank",
      "--spec",
      BLANK_SPEC,
    );
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stderr.join("\n")).toMatch(
      /--project-type.*--spec|--spec.*--project-type/,
    );
    expect(await exists(root)).toBe(false);
  });

  it("refuses an unknown id before any write, listing the ids it could see", async () => {
    const root = path.join(await tmp("gw-cli-create-unknown-"), "dest");
    await run("project", "create", root, "--project-type", "nope");
    expect(exitSpy).toHaveBeenCalledWith(2);
    const err = stderr.join("\n");
    expect(err).toContain('"nope"');
    expect(err).toContain("blank");
    expect(err).toContain(SAVED_ID);
    expect(err).not.toMatch(/not included/i);
    expect(await exists(root)).toBe(false);
  });

  it("project types lists the merged list with each source", async () => {
    await run("project", "types");
    expect(exitSpy).toHaveBeenCalledWith(0);
    const out = stdout.join("\n");
    expect(out).toMatch(/blank\s+Blank\s+built-in/);
    expect(out).toMatch(new RegExp(`${SAVED_ID}\\s+My Saved Type\\s+saved`));
    expect(out).not.toMatch(/not included/i);
  });

  it("with the variable unset, the list and the unknown-id refusal say saved types were not included", async () => {
    delete process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
    await run("project", "types");
    expect(stdout.join("\n")).toMatch(/saved project types were not included/i);
    expect(stdout.join("\n")).not.toContain(SAVED_ID);

    stdout.length = 0;
    stderr.length = 0;
    const root = path.join(await tmp("gw-cli-unset-"), "dest");
    await run("project", "create", root, "--project-type", "nope");
    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(stderr.join("\n")).toMatch(/saved project types were not included/i);
    expect(await exists(root)).toBe(false);
  });

  it("--spec <path> behaves as before", async () => {
    const root = path.join(await tmp("gw-cli-spec-"), "dest");
    await run("project", "create", root, "--spec", BLANK_SPEC);
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(await exists(path.join(root, "project.json"))).toBe(true);
  });

  it("registers no --saved-types-dir flag", async () => {
    const root = path.join(await tmp("gw-cli-flag-"), "dest");
    // commander reports an unknown option via process.exit(1); make exit stop
    // the run (as the real one does) so the action never executes.
    exitSpy.mockImplementation(((code?: number) => {
      throw new Error(`exit:${code}`);
    }) as never);
    await expect(
      run(
        "project",
        "create",
        root,
        "--project-type",
        "blank",
        "--saved-types-dir",
        savedDir,
      ),
    ).rejects.toThrow(/exit:1/);
    expect(await exists(root)).toBe(false);
  });
});
