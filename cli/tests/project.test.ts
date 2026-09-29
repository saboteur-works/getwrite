import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

// Mock only `createProjectFromType`; everything else (including
// `importScrivenerProject` and `runForTenant`) stays real so the
// `project import-scrivener` tests below exercise the actual orchestrator
// against real fixtures/temp directories on disk.
vi.mock("@gw/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@gw/core")>();
  return { ...actual, createProjectFromType: vi.fn() };
});

import * as creator from "@gw/core";
import { main } from "../src/getwrite-cli";

const FIXTURE_SCRIV_PATH = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/scrivener/sample.scriv",
);

const FIXTURE_DOCX_PATH = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/docx/multi-heading.docx",
);

const FIXTURE_DOCX_FOLDER_PATH = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/docx/folder-source",
);

const FIXTURE_PLAINTEXT_PATH = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/plaintext/single-document.txt",
);

const FIXTURE_PLAINTEXT_FOLDER_PATH = path.resolve(
  __dirname,
  "../../frontend/tests/fixtures/plaintext/folder-source",
);

describe("getwrite-cli project:create", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (creator as any).createProjectFromType.mockReset();
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => undefined) as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("calls createProjectFromType and exits successfully", async () => {
    (creator as any).createProjectFromType.mockResolvedValue({
      project: {},
      folders: [{ id: "f1" }],
      resources: [{ id: "r1" }],
    });

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "create",
      "./my/new-project",
      "--spec",
      "spec.json",
      "--name",
      "My Project",
    ];

    await main(argv as unknown as string[]);

    expect((creator as any).createProjectFromType).toHaveBeenCalled();
    expect((creator as any).createProjectFromType).toHaveBeenCalledWith(
      expect.objectContaining({
        projectRoot: "./my/new-project",
        spec: "spec.json",
        name: "My Project",
      }),
    );

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Created project at"),
    );
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});

describe("getwrite-cli project:import-scrivener", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let tmpDirs: string[];

  beforeEach(() => {
    tmpDirs = [];
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => undefined) as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    await Promise.all(
      tmpDirs.map((dir) =>
        fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }),
      ),
    );
  });

  async function makeTmpDestDir(prefix: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  it("imports the Task 1 fixture into a new destination project and exits 0", async () => {
    const destRoot = await makeTmpDestDir("gw-import-scrivener-ok-");
    // importScrivenerProject creates projectRoot itself; use a non-existent
    // child path so we can also assert the directory was actually created.
    const projectRoot = path.join(destRoot, "dest-project");

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-scrivener",
      FIXTURE_SCRIV_PATH,
      projectRoot,
    ];

    await main(argv as unknown as string[]);

    // Not asserting errorSpy was never called: `writeResourceToFile`
    // triggers the app's own background `indexer-queue` watcher (unrelated
    // to this orchestrator, unmodified by this task), which can log a
    // transient read/write race against the same fixture files this test
    // writes concurrently. The command's own success signals below are
    // what this test verifies.
    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Imported Scrivener project to"),
    );

    const projectJsonRaw = await fs.readFile(
      path.join(projectRoot, "project.json"),
      "utf8",
    );
    const projectJson = JSON.parse(projectJsonRaw) as Record<string, unknown>;
    expect(projectJson.id).toBeDefined();
  });

  it("refuses a source project with a non-SCRMAC-3 Creator, writing nothing to the destination", async () => {
    // A minimal synthetic `.scriv` package with a Windows-authored Creator
    // token, built from scratch (rather than mutating a copy of the Task 1
    // fixture) since importScrivenerProject's Creator allow-list check runs
    // before the binder is ever touched — no full binder is needed to
    // exercise the refusal path, so a hand-built minimal .scrivx is simpler
    // than copying and patching the real fixture.
    const sourceRoot = await makeTmpDestDir("gw-import-scrivener-src-");
    const scrivDir = path.join(sourceRoot, "unsupported.scriv");
    await fs.mkdir(scrivDir, { recursive: true });
    await fs.writeFile(
      path.join(scrivDir, "unsupported.scrivx"),
      `<?xml version="1.0" encoding="UTF-8"?>
<ScrivenerProject Identifier="00000000-0000-4000-8000-000000000000" Version="2.0" Creator="SCRWIN-3.1.0-1" Device="Synthetic-Fixture">
  <Binder>
    <BinderItem UUID="11111111-1111-4111-8111-111111111111" Type="DraftFolder" Title="Manuscript">
      <MetaData>
        <IncludeInCompile>Yes</IncludeInCompile>
      </MetaData>
    </BinderItem>
  </Binder>
</ScrivenerProject>
`,
      "utf8",
    );

    const destRoot = await makeTmpDestDir("gw-import-scrivener-dest-");
    const projectRoot = path.join(destRoot, "dest-project");

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-scrivener",
      scrivDir,
      projectRoot,
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("SCRWIN-3.1.0-1"),
    );

    await expect(fs.access(projectRoot)).rejects.toThrow();
  });

  it("refuses a non-empty pre-existing destination up front, writing nothing new to it (FR-22, Task 18)", async () => {
    const destRoot = await makeTmpDestDir("gw-import-scrivener-nonempty-");
    await fs.writeFile(
      path.join(destRoot, "pre-existing-file.txt"),
      "already here",
      "utf8",
    );

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-scrivener",
      FIXTURE_SCRIV_PATH,
      destRoot,
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        message: expect.stringContaining("already exists and is not empty"),
      }),
    );

    const entries = await fs.readdir(destRoot);
    expect(entries).toEqual(["pre-existing-file.txt"]);
  });

  it("errors out when scrivPath is missing", async () => {
    const argv = ["node", "getwrite-cli", "project", "import-scrivener"];

    // Commander itself rejects a missing required positional argument
    // before the action handler ever runs, reporting the error to stderr
    // and exiting non-zero (process.exit is mocked, so this resolves
    // rather than actually terminating the test process).
    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalled();
    const exitCode = exitSpy.mock.calls[0]?.[0];
    expect(exitCode).not.toBe(0);
  });
});

describe("getwrite-cli project:import-docx", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let tmpDirs: string[];

  beforeEach(() => {
    tmpDirs = [];
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => undefined) as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    await Promise.all(
      tmpDirs.map((dir) =>
        fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }),
      ),
    );
  });

  async function makeTmpDestDir(prefix: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  it("imports a single .docx file into a new destination project and exits 0", async () => {
    const destRoot = await makeTmpDestDir("gw-import-docx-file-ok-");
    const projectRoot = path.join(destRoot, "dest-project");

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-docx",
      FIXTURE_DOCX_PATH,
      projectRoot,
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Imported DOCX project to"),
    );
    // FR-19 (Task 21): a successful import must print no "sidecar not
    // found" line, or any other diagnostic, to stdout/stderr — see
    // `frontend/tests/integration/docx-import.test.ts`'s "no diagnostics"
    // describe block for the measured cause.
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const projectJsonRaw = await fs.readFile(
      path.join(projectRoot, "project.json"),
      "utf8",
    );
    const projectJson = JSON.parse(projectJsonRaw) as Record<string, unknown>;
    expect(projectJson.id).toBeDefined();
  });

  it("imports a folder of .docx files into a new destination project and exits 0", async () => {
    const destRoot = await makeTmpDestDir("gw-import-docx-folder-ok-");
    const projectRoot = path.join(destRoot, "dest-project");

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-docx",
      FIXTURE_DOCX_FOLDER_PATH,
      projectRoot,
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Imported DOCX project to"),
    );
    // FR-19 (Task 21): see the single-file-source test above.
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();

    const projectJsonRaw = await fs.readFile(
      path.join(projectRoot, "project.json"),
      "utf8",
    );
    const projectJson = JSON.parse(projectJsonRaw) as Record<string, unknown>;
    expect(projectJson.id).toBeDefined();
  });

  it("refuses --split-level against a folder source, writing nothing to the destination", async () => {
    const destRoot = await makeTmpDestDir("gw-import-docx-split-folder-");
    const projectRoot = path.join(destRoot, "dest-project");

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-docx",
      FIXTURE_DOCX_FOLDER_PATH,
      projectRoot,
      "--split-level",
      "2",
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        "--split-level cannot be used with a folder source",
      ),
    );

    await expect(fs.access(projectRoot)).rejects.toThrow();
  });

  it("refuses an unknown --project-type id before any write", async () => {
    const destRoot = await makeTmpDestDir("gw-import-docx-bad-type-");
    const projectRoot = path.join(destRoot, "dest-project");

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-docx",
      FIXTURE_DOCX_PATH,
      projectRoot,
      "--project-type",
      "not-a-real-project-type",
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("unknown project type"),
    );

    await expect(fs.access(projectRoot)).rejects.toThrow();
  });

  it("rejects an invalid --split-level value before any write", async () => {
    const destRoot = await makeTmpDestDir("gw-import-docx-bad-split-");
    const projectRoot = path.join(destRoot, "dest-project");

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-docx",
      FIXTURE_DOCX_PATH,
      projectRoot,
      "--split-level",
      "7",
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Invalid --split-level value"),
    );

    await expect(fs.access(projectRoot)).rejects.toThrow();
  });

  it("errors out when source is missing", async () => {
    const argv = ["node", "getwrite-cli", "project", "import-docx"];

    // Commander itself rejects a missing required positional argument
    // before the action handler ever runs, reporting the error to stderr
    // and exiting non-zero (process.exit is mocked, so this resolves
    // rather than actually terminating the test process).
    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalled();
    const exitCode = exitSpy.mock.calls[0]?.[0];
    expect(exitCode).not.toBe(0);
  });

  it("refuses a non-empty pre-existing destination up front with DOCX-specific wording, writing nothing new to it (Stage 6.5)", async () => {
    const destRoot = await makeTmpDestDir("gw-import-docx-nonempty-");
    await fs.writeFile(
      path.join(destRoot, "pre-existing-file.txt"),
      "already here",
      "utf8",
    );

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-docx",
      FIXTURE_DOCX_PATH,
      destRoot,
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("already exists and is not empty"),
    );
    const [refusalMessage] = errorSpy.mock.calls.find(
      ([message]: [unknown]) =>
        typeof message === "string" &&
        message.includes("already exists and is not empty"),
    ) as [string];
    expect(refusalMessage).not.toContain("Scrivener");

    const entries = await fs.readdir(destRoot);
    expect(entries).toEqual(["pre-existing-file.txt"]);
  });
});

describe("getwrite-cli project:import-plaintext", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let tmpDirs: string[];

  beforeEach(() => {
    tmpDirs = [];
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(((code?: number) => undefined) as any);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    errorSpy.mockRestore();
    await Promise.all(
      tmpDirs.map((dir) =>
        fs.rm(dir, { recursive: true, force: true, maxRetries: 3 }),
      ),
    );
  });

  async function makeTmpDestDir(prefix: string): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  /**
   * Reads every `meta/writing-log/*.json` day file under `projectRoot` and
   * returns all entries across them combined, mirroring how few day files a
   * single import can span (at most one, in practice, since the run itself
   * is fast) without hardcoding today's UTC date into the assertion.
   */
  async function readAllWritingLogEntries(
    projectRoot: string,
  ): Promise<Array<Record<string, unknown>>> {
    const dayFilesDir = path.join(projectRoot, "meta", "writing-log");
    const dayFileNames = await fs.readdir(dayFilesDir);
    const entries: Array<Record<string, unknown>> = [];
    for (const dayFileName of dayFileNames) {
      const raw = await fs.readFile(
        path.join(dayFilesDir, dayFileName),
        "utf8",
      );
      const parsed = JSON.parse(raw) as {
        entries: Array<Record<string, unknown>>;
      };
      entries.push(...parsed.entries);
    }
    return entries;
  }

  it("imports a single .txt file into a new destination project via the real CLI entry point and exits 0", async () => {
    const destRoot = await makeTmpDestDir("gw-import-plaintext-file-ok-");
    const projectRoot = path.join(destRoot, "dest-project");

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-plaintext",
      FIXTURE_PLAINTEXT_PATH,
      projectRoot,
      "--name",
      "My Import",
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Imported plain-text project to"),
    );

    // project.json exists and is readable/valid.
    const projectJsonRaw = await fs.readFile(
      path.join(projectRoot, "project.json"),
      "utf8",
    );
    const projectJson = JSON.parse(projectJsonRaw) as Record<string, unknown>;
    expect(projectJson.id).toBeDefined();
    expect(projectJson.name).toBe("My Import");

    // The expected number of resource files/sidecars exist: a single-file
    // source creates exactly one resource.
    const resourceDirs = await fs.readdir(path.join(projectRoot, "resources"));
    expect(resourceDirs).toHaveLength(1);
    const metaFiles = (await fs.readdir(path.join(projectRoot, "meta"))).filter(
      (name) => name.startsWith("resource-") && name.endsWith(".meta.json"),
    );
    expect(metaFiles).toHaveLength(1);

    // plaintext-import-report.txt exists at the project root.
    await expect(
      fs.access(path.join(projectRoot, "plaintext-import-report.txt")),
    ).resolves.toBeUndefined();

    // A writing-log day file contains one entry tagged source: "plaintext".
    const writingLogEntries = await readAllWritingLogEntries(projectRoot);
    expect(writingLogEntries).toHaveLength(1);
    expect(writingLogEntries[0]).toMatchObject({ source: "plaintext" });
  });

  it("imports a folder of .txt files into a new destination project via the real CLI entry point and exits 0", async () => {
    const destRoot = await makeTmpDestDir("gw-import-plaintext-folder-ok-");
    const projectRoot = path.join(destRoot, "dest-project");

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-plaintext",
      FIXTURE_PLAINTEXT_FOLDER_PATH,
      projectRoot,
      "--name",
      "My Import",
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Imported plain-text project to"),
    );

    const projectJsonRaw = await fs.readFile(
      path.join(projectRoot, "project.json"),
      "utf8",
    );
    const projectJson = JSON.parse(projectJsonRaw) as Record<string, unknown>;
    expect(projectJson.id).toBeDefined();

    // The folder-source fixture has 4 .txt files (Chapter 1, Chapter 2,
    // Chapter 10, nested-subfolder/Nested Chapter) and 1 non-empty subfolder
    // (nested-subfolder); notes.md, .hidden-file.txt, and .hidden-folder/ are
    // all skipped.
    const resourceDirs = await fs.readdir(path.join(projectRoot, "resources"));
    expect(resourceDirs).toHaveLength(4);
    const metaFiles = (await fs.readdir(path.join(projectRoot, "meta"))).filter(
      (name) => name.startsWith("resource-") && name.endsWith(".meta.json"),
    );
    expect(metaFiles).toHaveLength(4);

    const folderFiles = await fs.readdir(path.join(projectRoot, "folders"));
    expect(folderFiles.length).toBeGreaterThanOrEqual(1);

    await expect(
      fs.access(path.join(projectRoot, "plaintext-import-report.txt")),
    ).resolves.toBeUndefined();

    const writingLogEntries = await readAllWritingLogEntries(projectRoot);
    expect(writingLogEntries).toHaveLength(1);
    expect(writingLogEntries[0]).toMatchObject({ source: "plaintext" });
  });

  it("refuses a non-empty pre-existing destination up front, writing nothing new to it (FR-5)", async () => {
    const destRoot = await makeTmpDestDir("gw-import-plaintext-nonempty-");
    await fs.writeFile(
      path.join(destRoot, "pre-existing-file.txt"),
      "already here",
      "utf8",
    );

    const argv = [
      "node",
      "getwrite-cli",
      "project",
      "import-plaintext",
      FIXTURE_PLAINTEXT_PATH,
      destRoot,
    ];

    await main(argv as unknown as string[]);

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("already exists and is not empty"),
    );

    const entries = await fs.readdir(destRoot);
    expect(entries).toEqual(["pre-existing-file.txt"]);
  });
});
