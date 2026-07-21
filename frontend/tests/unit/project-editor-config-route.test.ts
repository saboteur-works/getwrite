/**
 * Integration tests for the project editor-config route.
 *
 * Calls the POST handler against a temporary projects directory, asserting
 * requests are scoped by a server-validated `projectId` (resolved against
 * `GETWRITE_PROJECTS_DIR`) rather than a client-supplied `projectPath`.
 *
 * Runs in the node environment so Request/Response come from undici.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { POST } from "../../app/api/project/editor-config/route";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function makeProjectsDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-editor-config-"));
  tmpDirs.push(dir);
  return dir;
}

async function withProjectsDir<T>(
  projectsDir: string,
  fn: () => Promise<T>,
): Promise<T> {
  const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    return await fn();
  } finally {
    process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  }
}

async function writeProject(
  projectsDir: string,
  projectId: string,
): Promise<string> {
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  const proj = createProject({ name: "editor-config-test" });
  await fs.writeFile(
    path.join(projectPath, PROJECT_FILENAME),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return projectPath;
}

function editorConfigRequest(body: unknown): Request {
  return new Request("http://localhost/api/project/editor-config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/project/editor-config", () => {
  it("persists the editor config for a valid projectId", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    const projectPath = await writeProject(projectsDir, projectId);

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        editorConfigRequest({
          projectId,
          headings: { h1: { fontSize: "42px" } },
        }) as never,
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.editorConfig.headings.h1.fontSize).toBe("42px");

    const saved = JSON.parse(
      await fs.readFile(path.join(projectPath, PROJECT_FILENAME), "utf8"),
    );
    expect(saved.config.editorConfig.headings.h1.fontSize).toBe("42px");
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const projectsDir = await makeProjectsDir();

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        editorConfigRequest({ projectId: "not-a-uuid", headings: {} }) as never,
      ),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid projectId");
  });
});
