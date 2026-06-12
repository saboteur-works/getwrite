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

  it("loads image/audio resources that have no content.txt without throwing", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-loader-media-"));
    try {
      const project = {
        id: "test-media",
        name: "Media Project",
        slug: "media-project",
        createdAt: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(tmp, "project.json"),
        JSON.stringify(project),
        "utf-8",
      );
      await fs.mkdir(path.join(tmp, "meta"));

      const imageId = "11111111-1111-4111-8111-111111111111";
      // Image sidecar — media resources store original.<ext>, never content.txt
      await fs.writeFile(
        path.join(tmp, "meta", `resource-${imageId}.meta.json`),
        JSON.stringify({
          id: imageId,
          name: "Cover",
          type: "image",
          createdAt: new Date().toISOString(),
          orderIndex: 0,
          folderId: null,
          slug: "cover",
          file: "original.png",
          width: 800,
          height: 600,
          userMetadata: {},
        }),
        "utf-8",
      );
      // Binary present, but deliberately no content.txt
      await fs.mkdir(path.join(tmp, "resources", imageId), { recursive: true });
      await fs.writeFile(
        path.join(tmp, "resources", imageId, "original.png"),
        Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      );

      const loaded = await loadProjectFromDisk(tmp);

      expect(loaded.resources).toHaveLength(1);
      const image = loaded.resources[0];
      expect(image.type).toBe("image");
      expect(image.name).toBe("Cover");
      expect(image.plaintext).toBe("");
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

  it("loads a legacy project whose spec used a Workspace and `special` folders (FR8)", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "gw-loader-legacy-"));
    try {
      // Mirrors a project created before the Workspace requirement removal:
      // a folder named Workspace and `special`-flagged folders are persisted
      // to disk exactly as an older GetWrite version would have written them.
      const spec = {
        id: "legacy-workspace",
        name: "Legacy Workspace",
        folders: [{ name: "Workspace", special: true }, { name: "Notes" }],
        defaultFolders: [
          {
            folder: "Notes",
            name: "Characters",
            special: true,
            metadataSource: {
              isMetadataSource: true,
              metadataInputType: "multiselect" as const,
            },
          },
        ],
        defaultResources: [
          {
            name: "Getting Started",
            type: "text" as const,
            folder: "Workspace",
            template: "Hello",
          },
        ],
      };

      const { folders: createdFolders } = await createAndAssertProject(
        spec as Parameters<typeof createAndAssertProject>[0],
        { projectRoot: tmp, name: "Legacy Workspace Project" },
      );

      await flushIndexer();

      // Loading must succeed and surface every folder, including the
      // Workspace and the `special`-flagged Characters folder.
      const loaded = await loadProjectFromDisk(tmp);
      expect(loaded.folders).toHaveLength(createdFolders.length);

      const folderNames = (loaded.folders as Array<{ name: string }>).map(
        (f) => f.name,
      );
      expect(folderNames).toContain("Workspace");
      expect(folderNames).toContain("Characters");
    } finally {
      await removeDirRetry(tmp);
    }
  });
});
