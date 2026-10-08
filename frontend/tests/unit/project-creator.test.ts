import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAndAssertProject } from "./helpers/project-creator";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { removeDirRetry } from "./helpers/fs-utils";
import { listRevisions } from "../../src/lib/models/revision";

describe("models/project-creator", () => {
  it("seeds config.relationshipTypes from the project-type spec (FR-14)", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-relationship-types-"),
    );
    try {
      const spec = {
        id: "test-relationship-types",
        name: "Relationship Types Test",
        folders: [{ name: "Workspace" }],
        relationshipTypes: ["ally of", "rival of"],
      };
      const { project } = await createAndAssertProject(
        spec as Parameters<typeof createAndAssertProject>[0],
        { projectRoot: tmp, name: "Relationship Types Project" },
      );

      expect(project.config?.relationshipTypes).toEqual([
        "ally of",
        "rival of",
      ]);

      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("leaves config.relationshipTypes undefined when the spec declares none, so FR-18's default vocabulary fallback applies", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-relationship-types-none-"),
    );
    try {
      const spec = {
        id: "test-no-relationship-types",
        name: "No Relationship Types Test",
        folders: [{ name: "Workspace" }],
      };
      const { project } = await createAndAssertProject(
        spec as Parameters<typeof createAndAssertProject>[0],
        { projectRoot: tmp, name: "No Relationship Types Project" },
      );

      // Not defaulted to [] here (unlike `statuses`): `relationshipTypes`
      // must stay undefined so `createEntityRelationship` and
      // `selectActiveProjectRelationshipTypes` can tell "never persisted"
      // apart from "explicitly emptied" and fall back to
      // DEFAULT_RELATIONSHIP_TYPES (FR-15, FR-18).
      expect(project.config?.relationshipTypes).toBeUndefined();

      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("propagates metadataSource and special from defaultFolders to persisted folder.json", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-sf-meta-"));
    try {
      const spec = {
        id: "test-metadata-subfolder",
        name: "Metadata Subfolder Test",
        folders: [{ name: "Workspace", special: true }, { name: "Research" }],
        defaultFolders: [
          {
            folder: "Research",
            name: "Characters",
            special: true,
            metadataSource: {
              isMetadataSource: true,
              metadataInputType: "multiselect",
            },
          },
        ],
      };
      const { folders } = await createAndAssertProject(
        spec as Parameters<typeof createAndAssertProject>[0],
        { projectRoot: tmp, name: "Metadata Subfolder Project" },
      );

      const charFolder = folders.find((f) => f.name === "Characters");
      expect(charFolder).toBeDefined();
      expect(charFolder?.special).toBe(true);
      expect(charFolder?.metadataSource?.isMetadataSource).toBe(true);
      expect(charFolder?.metadataSource?.metadataInputType).toBe("multiselect");

      // verify the value is also persisted to folder.json on disk
      const folderJson = JSON.parse(
        await fs.readFile(
          path.join(tmp, "folders", "research", "characters", "folder.json"),
          "utf8",
        ),
      );
      expect(folderJson.metadataSource?.isMetadataSource).toBe(true);
      expect(folderJson.special).toBe(true);

      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("creates subfolders from defaultFolders declarations", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-sf-"));
    try {
      const spec = {
        id: "test-subfolder",
        name: "Subfolder Test",
        folders: [{ name: "Workspace", special: true }, { name: "Drafts" }],
        defaultFolders: [
          { folder: "Drafts", name: "Act 1" },
          { folder: "Drafts", name: "Act 2" },
        ],
      };
      const { folders } = await createAndAssertProject(
        spec as Parameters<typeof createAndAssertProject>[0],
        { projectRoot: tmp, name: "Subfolder Test Project" },
      );

      // 2 top-level + 2 subfolders
      expect(folders.length).toBe(4);
      const subs = folders.filter((f) => f.parentId != null);
      expect(subs.length).toBe(2);
      expect(subs.map((f) => f.name).sort()).toEqual(["Act 1", "Act 2"]);

      // directories exist on disk
      const act1Dir = path.join(tmp, "folders", "drafts", "act-1");
      await expect(fs.access(act1Dir)).resolves.toBeUndefined();

      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("creates project structure and resource placeholders from spec", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-pc-"));
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "specs",
        "002-define-data-models",
        "project-types",
        "novel_project_type.json",
      );

      const { projectPath, resources } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "My Novel" },
      );

      // project.json exists
      const pj = await fs.readFile(
        path.join(projectPath, "project.json"),
        "utf8",
      );
      expect(pj).toBeTruthy();

      // folders directory exists and has workspace
      const foldersDir = path.join(projectPath, "folders");
      const entries = await fs.readdir(foldersDir);
      expect(entries.length).toBeGreaterThanOrEqual(1);

      // resources dir exists and resources have sidecars
      const meta = await fs.readdir(path.join(projectPath, "meta"));
      expect(meta.length).toBeGreaterThanOrEqual(resources.length);

      for (const resource of resources) {
        const revisions = await listRevisions(projectPath, resource.id);
        expect(revisions.length).toBe(1);
        expect(revisions[0]?.versionNumber).toBe(1);
        expect(revisions[0]?.isCanonical).toBe(true);
      }

      // ensure background indexing finished before cleanup
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("places deeply nested subfolders at the correct on-disk path (no orphan top-level dirs)", async () => {
    // Regression: when a defaultFolder names another defaultFolder as its
    // parent (3-level nesting), the path must be resolved using the full
    // relative path from foldersDir — not just the parent's bare slug.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-3level-"));
    try {
      const spec = {
        id: "test-3level",
        name: "Three-Level Nesting Test",
        folders: [{ name: "Workspace", special: true }],
        defaultFolders: [
          { folder: "Workspace", name: "Chapters" },
          { folder: "Chapters", name: "Chapter 1" },
        ],
      };
      const { folders } = await createAndAssertProject(
        spec as Parameters<typeof createAndAssertProject>[0],
        { projectRoot: tmp, name: "Three-Level Project" },
      );

      const foldersDir = path.join(tmp, "folders");

      // Chapter 1 must live under workspace/chapters/, not a top-level chapters/
      await expect(
        fs.access(
          path.join(
            foldersDir,
            "workspace",
            "chapters",
            "chapter-1",
            "folder.json",
          ),
        ),
      ).resolves.toBeUndefined();

      // No orphan top-level "chapters" directory should exist
      await expect(
        fs.access(path.join(foldersDir, "chapters")),
      ).rejects.toThrow();

      // Returned Chapter 1 folder has the correct parentId (Chapters folder)
      const chaptersFolder = folders.find((f) => f.name === "Chapters");
      const chapter1Folder = folders.find((f) => f.name === "Chapter 1");
      expect(chaptersFolder).toBeDefined();
      expect(chapter1Folder).toBeDefined();
      expect(chapter1Folder?.parentId).toBe(chaptersFolder?.id);

      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("scaffolds a project from a spec that has no Workspace folder (FR3)", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-no-workspace-"),
    );
    try {
      const spec = {
        id: "test-no-workspace",
        name: "No Workspace Scaffold",
        folders: [{ name: "Drafts" }, { name: "Notes" }],
        defaultFolders: [{ folder: "Drafts", name: "Act 1" }],
        defaultResources: [
          {
            folder: "Drafts",
            name: "Intro",
            type: "text" as const,
            template: "Hello",
          },
        ],
      };

      const { projectPath, folders, resources } = await createAndAssertProject(
        spec as Parameters<typeof createAndAssertProject>[0],
        { projectRoot: tmp, name: "No Workspace Project" },
      );

      // No folder named Workspace exists, yet scaffolding succeeded.
      expect(folders.some((f) => f.name === "Workspace")).toBe(false);
      expect(folders.map((f) => f.name).sort()).toEqual([
        "Act 1",
        "Drafts",
        "Notes",
      ]);

      // project.json was written.
      const pj = await fs.readFile(
        path.join(projectPath, "project.json"),
        "utf8",
      );
      expect(pj).toBeTruthy();

      // The seeded resource was created with a canonical revision.
      expect(resources).toHaveLength(1);
      const revisions = await listRevisions(projectPath, resources[0]!.id);
      expect(revisions[0]?.isCanonical).toBe(true);

      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("persists no resourceSubtype on defaultResources sidecars (Feature 73 FR-6, FR-23)", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-no-subtype-seed-"),
    );
    try {
      const spec = {
        id: "test-no-subtype-seed",
        name: "No Subtype Seed",
        folders: [{ name: "Drafts" }],
        defaultResources: [
          {
            folder: "Drafts",
            name: "Intro",
            type: "text" as const,
            template: "Hello",
          },
        ],
      };
      const { projectPath, resources } = await createAndAssertProject(
        spec as Parameters<typeof createAndAssertProject>[0],
        { projectRoot: tmp, name: "No Subtype Seed Project" },
      );
      expect(resources.length).toBeGreaterThan(0);
      for (const r of resources) {
        const raw = JSON.parse(
          await fs.readFile(
            path.join(projectPath, "meta", `resource-${r.id}.meta.json`),
            "utf8",
          ),
        ) as Record<string, unknown>;
        expect(raw).not.toHaveProperty("resourceSubtype");
      }
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("novel template creates correct nested folder structure without orphan directories", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-novel-struct-"),
    );
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "getwrite-config",
        "templates",
        "project-types",
        "novel_project_type.json",
      );

      await createAndAssertProject(specPath, {
        projectRoot: tmp,
        name: "Novel Regression Test",
      });

      const foldersDir = path.join(tmp, "folders");

      // chapter-1 must be nested under workspace/chapters/, not a top-level chapters/
      await expect(
        fs.access(
          path.join(
            foldersDir,
            "workspace",
            "chapters",
            "chapter-1",
            "folder.json",
          ),
        ),
      ).resolves.toBeUndefined();

      // No orphan top-level "chapters" directory
      await expect(
        fs.access(path.join(foldersDir, "chapters")),
      ).rejects.toThrow();

      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("seeds config.subtypes from the project-type spec (Feature 72, FR-26)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "getwrite-subtypes-"));
    try {
      const spec = {
        id: "test-subtypes",
        name: "Subtypes Test",
        folders: [{ name: "Workspace" }],
        subtypes: ["Scene", "Beat"],
      };
      const { project } = await createAndAssertProject(
        spec as Parameters<typeof createAndAssertProject>[0],
        { projectRoot: tmp, name: "Subtypes Project" },
      );
      expect(project.config?.subtypes).toEqual(["Scene", "Beat"]);
      const onDisk = JSON.parse(
        await fs.readFile(path.join(tmp, "project.json"), "utf8"),
      ) as { config?: { subtypes?: string[] } };
      expect(onDisk.config?.subtypes).toEqual(["Scene", "Beat"]);
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("writes no subtypes key to project.json when the spec has none (Feature 72, FR-26)", async () => {
    const tmp = await fs.mkdtemp(
      path.join(os.tmpdir(), "getwrite-subtypes-none-"),
    );
    try {
      const spec = {
        id: "test-no-subtypes",
        name: "No Subtypes Test",
        folders: [{ name: "Workspace" }],
      };
      await createAndAssertProject(
        spec as Parameters<typeof createAndAssertProject>[0],
        { projectRoot: tmp, name: "No Subtypes Project" },
      );
      const onDisk = JSON.parse(
        await fs.readFile(path.join(tmp, "project.json"), "utf8"),
      ) as { config?: Record<string, unknown> };
      expect(onDisk.config).toBeDefined();
      expect("subtypes" in (onDisk.config ?? {})).toBe(false);
      await flushIndexer();
    } finally {
      await removeDirRetry(tmp);
    }
  });
});
