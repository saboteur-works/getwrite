/**
 * Feature 90, Task 16 (FR-3): every in-process reader of project types goes
 * through the resolver, so a saved type is accepted by project creation and by
 * both imports, and an unknown id is still refused.
 *
 * All directories are throwaway folders under the OS temp dir; nothing here
 * touches the repository's `projects/` or any real app-data folder.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createProjectCore } from "../../src/lib/models/project-crud-core";
import {
  importDocxProject,
  UnknownProjectTypeError,
} from "../../src/lib/models/docx/import-docx-project";
import { importPlainTextProject } from "../../src/lib/models/plaintext/import-plaintext-project";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { clearProjectTypeCache } from "../../src/lib/projectTypes";

const ENV_KEYS = [
  "GETWRITE_PROJECT_TYPES_DIR",
  "GETWRITE_TEMPLATES_DIR",
  "GETWRITE_SAVED_PROJECT_TYPES_DIR",
  "GETWRITE_PROJECTS_DIR",
] as const;

const FIXTURES = path.join(__dirname, "..", "fixtures");

describe("readers resolve saved project types (FR-3)", () => {
  let root: string;
  let builtInDir: string;
  let savedDir: string;
  let projectsDir: string;
  const originalEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
    root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-readers-"));
    builtInDir = path.join(root, "built-in");
    savedDir = path.join(root, "saved");
    projectsDir = path.join(root, "projects");
    await Promise.all(
      [builtInDir, savedDir, projectsDir].map((d) =>
        fs.mkdir(d, { recursive: true }),
      ),
    );
  });

  afterAll(async () => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    clearProjectTypeCache();
    await fs.rm(root, { recursive: true, force: true });
  });

  beforeEach(async () => {
    delete process.env.GETWRITE_TEMPLATES_DIR;
    process.env.GETWRITE_PROJECT_TYPES_DIR = builtInDir;
    process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = savedDir;
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    await fs.rm(builtInDir, { recursive: true, force: true });
    await fs.rm(savedDir, { recursive: true, force: true });
    await fs.mkdir(builtInDir, { recursive: true });
    await fs.mkdir(savedDir, { recursive: true });
    clearProjectTypeCache();
  });

  async function writeSaved(id: string, statuses: string[]): Promise<void> {
    await fs.writeFile(
      path.join(savedDir, `${id}.json`),
      JSON.stringify({
        id,
        name: `Saved ${id}`,
        folders: [{ name: "Drafts" }],
        statuses,
      }),
    );
  }

  it("createProjectCore accepts a saved type", async () => {
    await writeSaved("my-saved", ["idea"]);
    const result = await createProjectCore("From saved", "my-saved", false);
    expect(result.project.name).toBe("From saved");
    expect(result.folders.map((f) => f.name)).toContain("Drafts");
  });

  it("the DOCX import accepts a saved type and seeds its statuses", async () => {
    await writeSaved("my-saved", ["idea", "polished"]);
    const projectRoot = path.join(root, "docx-out");
    await importDocxProject({
      sourcePath: path.join(FIXTURES, "docx", "multi-heading.docx"),
      projectRoot,
      projectType: "my-saved",
      hostedAuthActive: false,
    });
    await flushIndexer();
    const project = JSON.parse(
      await fs.readFile(path.join(projectRoot, "project.json"), "utf8"),
    ) as { config?: { statuses?: string[] } };
    expect(project.config?.statuses).toEqual(["idea", "polished"]);
  });

  it("the plain-text import resolves its default type from the saved store", async () => {
    await writeSaved("blank", ["from-saved"]);
    const projectRoot = path.join(root, "txt-out");
    await importPlainTextProject({
      sourcePath: path.join(FIXTURES, "plaintext", "single-document.txt"),
      projectRoot,
      hostedAuthActive: false,
    });
    await flushIndexer();
    const project = JSON.parse(
      await fs.readFile(path.join(projectRoot, "project.json"), "utf8"),
    ) as { config?: { statuses?: string[] } };
    expect(project.config?.statuses).toEqual(["from-saved"]);
  });

  it("an unknown id still raises UnknownProjectTypeError", async () => {
    await expect(
      importDocxProject({
        sourcePath: path.join(FIXTURES, "docx", "multi-heading.docx"),
        projectRoot: path.join(root, "never-written"),
        projectType: "no-such-type",
        hostedAuthActive: false,
      }),
    ).rejects.toBeInstanceOf(UnknownProjectTypeError);
  });

  it("refuses a saved id deleted between choosing and importing, before any write", async () => {
    await writeSaved("my-saved", ["idea"]);
    clearProjectTypeCache();
    // The id was listed (and chosen) while the file existed; it is then deleted.
    await fs.rm(path.join(savedDir, "my-saved.json"));
    clearProjectTypeCache();
    const projectRoot = path.join(root, "deleted-id-out");
    await expect(
      importDocxProject({
        sourcePath: path.join(FIXTURES, "docx", "multi-heading.docx"),
        projectRoot,
        projectType: "my-saved",
        hostedAuthActive: false,
      }),
    ).rejects.toBeInstanceOf(UnknownProjectTypeError);
    await expect(fs.stat(projectRoot)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
