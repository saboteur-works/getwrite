import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { loadProjectFromDisk } from "../../src/lib/models/project-loader";
import { createAndAssertProject } from "./helpers/project-creator";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { removeDirRetry } from "./helpers/fs-utils";

describe("loadProjectFromDisk", () => {
  it("loads project metadata, folders, and resources from a freshly created project", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-loader-basic-"));
    try {
      const spec = {
        id: "test-loader-basic",
        name: "Loader Basic Test",
        folders: [{ name: "Workspace", special: true }, { name: "Notes" }],
        defaultResources: [
          {
            name: "Getting Started",
            type: "text" as const,
            folder: "Workspace",
            template: "Hello world",
          },
        ],
      };
      const { folders: createdFolders, resources: createdResources } =
        await createAndAssertProject(spec, {
          projectRoot: tmp,
          name: "Basic Project",
        });

      await flushIndexer();

      const loaded = await loadProjectFromDisk(tmp);

      expect(loaded.project.name).toBe("Basic Project");
      expect(loaded.folders).toHaveLength(createdFolders.length);
      expect(loaded.resources).toHaveLength(createdResources.length);

      const loadedResource = loaded.resources[0];
      expect(loadedResource.name).toBe("Getting Started");
      expect(loadedResource.plaintext).toBe("Hello world");
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("loads all nested folders for the novel template (3-level nesting)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-loader-novel-"));
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "getwrite-config",
        "templates",
        "project-types",
        "novel_project_type.json",
      );
      const { folders: createdFolders } = await createAndAssertProject(
        specPath,
        { projectRoot: tmp, name: "Novel Load Test" },
      );

      await flushIndexer();

      const loaded = await loadProjectFromDisk(tmp);

      // All created folders must appear in the loaded result
      expect(loaded.folders).toHaveLength(createdFolders.length);

      // chapter-1 (3-level deep) must be present
      const folderDescriptors = loaded.folders as Array<{ name: string }>;
      const chapter1 = folderDescriptors.find((f) => f.name === "Chapter 1");
      expect(chapter1).toBeDefined();
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("returns empty folders array without throwing when folders/ directory is missing", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-loader-nofold-"));
    try {
      // Write only project.json and meta/ — no folders/ directory
      const project = {
        id: "test-nofold",
        name: "No Folders",
        slug: "no-folders",
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(tmp, "project.json"),
        JSON.stringify(project),
        "utf-8",
      );
      await fs.mkdir(path.join(tmp, "meta"));

      const loaded = await loadProjectFromDisk(tmp);
      expect(loaded.folders).toEqual([]);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("returns empty resources array without throwing when meta/ directory is missing", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-loader-nometa-"));
    try {
      // Write only project.json and folders/ — no meta/ directory
      const project = {
        id: "test-nometa",
        name: "No Meta",
        slug: "no-meta",
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(tmp, "project.json"),
        JSON.stringify(project),
        "utf-8",
      );
      await fs.mkdir(path.join(tmp, "folders"));

      const loaded = await loadProjectFromDisk(tmp);
      expect(loaded.resources).toEqual([]);
    } finally {
      await removeDirRetry(tmp);
    }
  });

  it("create → reopen loop: data loaded from disk matches data returned at creation", async () => {
    // This is the regression test for the Electron bug: projects were created
    // successfully but failed to reopen because loadProjectFromDisk (POST /api/project)
    // was not tested against real on-disk projects.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-loader-loop-"));
    try {
      const specPath = path.join(
        process.cwd(),
        "..",
        "getwrite-config",
        "templates",
        "project-types",
        "novel_project_type.json",
      );
      const {
        project: createdProject,
        folders: createdFolders,
        resources: createdResources,
      } = await createAndAssertProject(specPath, {
        projectRoot: tmp,
        name: "Loop Test Novel",
      });

      await flushIndexer();

      // Simulate a "restart and reopen" by loading from disk with no in-memory state
      const loaded = await loadProjectFromDisk(tmp);

      // Project identity preserved
      expect(loaded.project.id).toBe(createdProject.id);
      expect(loaded.project.name).toBe("Loop Test Novel");

      // All created folders are loadable
      expect(loaded.folders).toHaveLength(createdFolders.length);
      const loadedFolderIds = (loaded.folders as Array<{ id: string }>)
        .map((f) => f.id)
        .sort();
      const createdFolderIds = createdFolders.map((f) => f.id).sort();
      expect(loadedFolderIds).toEqual(createdFolderIds);

      // All created resources are loadable
      expect(loaded.resources).toHaveLength(createdResources.length);
      const loadedResourceIds = loaded.resources.map((r) => r.id).sort();
      const createdResourceIds = createdResources.map((r) => r.id).sort();
      expect(loadedResourceIds).toEqual(createdResourceIds);

      // Each resource has plaintext
      for (const r of loaded.resources) {
        expect(typeof r.plaintext).toBe("string");
      }
    } finally {
      await removeDirRetry(tmp);
    }
  });
});
