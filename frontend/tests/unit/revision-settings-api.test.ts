/**
 * Unit tests for the default revision name setting (T017).
 *
 * Verifies that updateDefaultRevisionName persists the configured value to
 * project.json, trims whitespace, and rejects invalid inputs. The route-level
 * `describe` block additionally exercises the actual `POST` handler against a
 * `projectId`-scoped `GETWRITE_PROJECTS_DIR`, per the 29-route tenant
 * enforcement feature (Task 4).
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { updateDefaultRevisionName } from "../../src/lib/models/revision-settings";
import { generateUUID } from "../../src/lib/models/uuid";
import type { Project } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

async function makeTmpProject() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rev-settings-"));
  const proj = createProject({ name: "test-project" });
  await fs.writeFile(
    path.join(dir, PROJECT_FILENAME),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return { dir, proj };
}

async function readProject(dir: string): Promise<Project> {
  const raw = await fs.readFile(path.join(dir, PROJECT_FILENAME), "utf8");
  return JSON.parse(raw) as Project;
}

describe("updateDefaultRevisionName (T017)", () => {
  it("persists the new default revision name to project.json", async () => {
    const { dir } = await makeTmpProject();
    try {
      await updateDefaultRevisionName(dir, "Opening Draft");
      const saved = await readProject(dir);
      expect(saved.config?.defaultRevisionName).toBe("Opening Draft");
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("trims leading and trailing whitespace from the provided name", async () => {
    const { dir } = await makeTmpProject();
    try {
      await updateDefaultRevisionName(dir, "  Draft v1  ");
      const saved = await readProject(dir);
      expect(saved.config?.defaultRevisionName).toBe("Draft v1");
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("rejects an empty string", async () => {
    const { dir } = await makeTmpProject();
    try {
      await expect(updateDefaultRevisionName(dir, "")).rejects.toThrow();
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("rejects a whitespace-only string", async () => {
    const { dir } = await makeTmpProject();
    try {
      await expect(updateDefaultRevisionName(dir, "   ")).rejects.toThrow();
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("rejects a name longer than 100 characters", async () => {
    const { dir } = await makeTmpProject();
    try {
      await expect(
        updateDefaultRevisionName(dir, "a".repeat(101)),
      ).rejects.toThrow();
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("accepts a name exactly 100 characters long", async () => {
    const { dir } = await makeTmpProject();
    try {
      const name = "a".repeat(100);
      await updateDefaultRevisionName(dir, name);
      const saved = await readProject(dir);
      expect(saved.config?.defaultRevisionName).toBe(name);
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("updates updatedAt on the project document", async () => {
    const { dir } = await makeTmpProject();
    try {
      const before = Date.now();
      await updateDefaultRevisionName(dir, "Draft");
      const saved = await readProject(dir);
      expect(saved.updatedAt).toBeDefined();
      expect(new Date(saved.updatedAt!).getTime()).toBeGreaterThanOrEqual(
        before,
      );
    } finally {
      await removeDirRetry(dir);
    }
  });

  it("returns the trimmed name that was saved", async () => {
    const { dir } = await makeTmpProject();
    try {
      const result = await updateDefaultRevisionName(dir, "  My Draft  ");
      expect(result).toBe("My Draft");
    } finally {
      await removeDirRetry(dir);
    }
  });
});

// ---------------------------------------------------------------------------
// Route-level: POST /api/project/revision-settings (projectId-based)
// ---------------------------------------------------------------------------

describe("POST /api/project/revision-settings (projectId-based)", () => {
  it("resolves projectId to the on-disk project and returns the saved name", async () => {
    const projectsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-rev-settings-route-"),
    );
    const projectId = generateUUID();
    const projectPath = path.join(projectsDir, projectId);
    await fs.mkdir(projectPath, { recursive: true });
    const proj = createProject({ name: "route-test" });
    await fs.writeFile(
      path.join(projectPath, PROJECT_FILENAME),
      JSON.stringify(proj, null, 2),
      "utf8",
    );

    const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    try {
      const { POST } =
        await import("../../app/api/project/revision-settings/route");
      const res = await POST(
        new Request("http://localhost/api/project/revision-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            defaultRevisionName: "Route Draft",
          }),
        }) as never,
      );
      const json = (await res.json()) as { defaultRevisionName: string };
      expect(res.status).toBe(200);
      expect(json.defaultRevisionName).toBe("Route Draft");

      const saved = await fs.readFile(
        path.join(projectPath, PROJECT_FILENAME),
        "utf8",
      );
      expect((JSON.parse(saved) as Project).config?.defaultRevisionName).toBe(
        "Route Draft",
      );
    } finally {
      process.env.GETWRITE_PROJECTS_DIR = originalEnv;
      await removeDirRetry(projectsDir);
    }
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const projectsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-rev-settings-route-"),
    );
    const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    try {
      const { POST } =
        await import("../../app/api/project/revision-settings/route");
      const res = await POST(
        new Request("http://localhost/api/project/revision-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: "not-a-uuid",
            defaultRevisionName: "Draft",
          }),
        }) as never,
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Invalid projectId");
    } finally {
      process.env.GETWRITE_PROJECTS_DIR = originalEnv;
      await removeDirRetry(projectsDir);
    }
  });
});
