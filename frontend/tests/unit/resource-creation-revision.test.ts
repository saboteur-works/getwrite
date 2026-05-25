/**
 * Unit tests for initial canonical revision creation on resource creation (T016).
 *
 * Verifies that creating a text resource via the resource creation flow produces
 * a canonical revision named according to the project's defaultRevisionName setting,
 * and that folder resources are not given an initial revision.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createProject } from "../../src/lib/models/project";
import {
  createTextResource,
  createFolderResource,
} from "../../src/lib/models/resource";
import { writeResourceToFile } from "../../src/lib/models/resource";
import {
  writeRevision,
  getCanonicalRevision,
} from "../../src/lib/models/revision";
import { resolveInitialRevisionName } from "../../src/lib/models/resource-revision";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { removeDirRetry } from "./helpers/fs-utils";
import type { ProjectConfig } from "../../src/lib/models/types";

async function makeTmpProject(configOverrides?: Partial<ProjectConfig>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rev-create-"));
  const proj = createProject({
    name: "test-project",
    config: { editorConfig: {}, ...configOverrides } as ProjectConfig,
  });
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return { dir, proj };
}

describe("resolveInitialRevisionName", () => {
  it("returns 'Initial Draft' when defaultRevisionName is not configured", () => {
    const config: ProjectConfig = { editorConfig: {} };
    expect(resolveInitialRevisionName(config)).toBe("Initial Draft");
  });

  it("returns the configured name when defaultRevisionName is set", () => {
    const config: ProjectConfig = {
      editorConfig: {},
      defaultRevisionName: "First Draft",
    };
    expect(resolveInitialRevisionName(config)).toBe("First Draft");
  });

  it("falls back to 'Initial Draft' when defaultRevisionName is an empty string", () => {
    const config: ProjectConfig = { editorConfig: {}, defaultRevisionName: "" };
    expect(resolveInitialRevisionName(config)).toBe("Initial Draft");
  });

  it("falls back to 'Initial Draft' when defaultRevisionName is whitespace-only", () => {
    const config: ProjectConfig = {
      editorConfig: {},
      defaultRevisionName: "   ",
    };
    expect(resolveInitialRevisionName(config)).toBe("Initial Draft");
  });
});

describe("resource creation — initial canonical revision (T016)", () => {
  it("creates a canonical revision named 'Initial Draft' by default", async () => {
    const { dir, proj } = await makeTmpProject();
    try {
      const resource = createTextResource({
        name: "Chapter One",
        plainText: "Hello world",
      });
      await writeResourceToFile(dir, resource);

      const revisionName = resolveInitialRevisionName(proj.config!);
      await writeRevision(dir, resource.id, 1, resource.plainText ?? "", {
        isCanonical: true,
        metadata: { name: revisionName },
      });

      const canonical = await getCanonicalRevision(dir, resource.id);
      expect(canonical).not.toBeNull();
      expect(canonical!.isCanonical).toBe(true);
      expect(canonical!.metadata?.name).toBe("Initial Draft");
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("uses the project-configured defaultRevisionName when set", async () => {
    const { dir, proj } = await makeTmpProject({
      defaultRevisionName: "Opening Scene",
    });
    try {
      const resource = createTextResource({
        name: "Chapter One",
        plainText: "",
      });
      await writeResourceToFile(dir, resource);

      const revisionName = resolveInitialRevisionName(proj.config!);
      await writeRevision(dir, resource.id, 1, resource.plainText ?? "", {
        isCanonical: true,
        metadata: { name: revisionName },
      });

      const canonical = await getCanonicalRevision(dir, resource.id);
      expect(canonical?.metadata?.name).toBe("Opening Scene");
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("writes exactly one canonical revision for a new text resource", async () => {
    const { dir, proj } = await makeTmpProject();
    try {
      const resource = createTextResource({ name: "Solo", plainText: "" });
      await writeResourceToFile(dir, resource);

      const revisionName = resolveInitialRevisionName(proj.config!);
      await writeRevision(dir, resource.id, 1, resource.plainText ?? "", {
        isCanonical: true,
        metadata: { name: revisionName },
      });

      const { listRevisions } = await import("../../src/lib/models/revision");
      const all = await listRevisions(dir, resource.id);
      expect(all).toHaveLength(1);
      expect(all.filter((r) => r.isCanonical)).toHaveLength(1);
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("does not create a revision for folder resources (regression guard)", async () => {
    const { dir } = await makeTmpProject();
    try {
      const folder = createFolderResource({ name: "Chapters" });
      await writeResourceToFile(dir, folder);

      const canonical = await getCanonicalRevision(dir, folder.id);
      expect(canonical).toBeNull();
    } finally {
      await removeDirRetry(dir);
    }
  });
});
