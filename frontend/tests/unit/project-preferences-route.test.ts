/**
 * Integration tests for the project preferences route.
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

import { POST } from "../../app/api/project/preferences/route";
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-preferences-"));
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
  const proj = createProject({ name: "preferences-test" });
  await fs.writeFile(
    path.join(projectPath, PROJECT_FILENAME),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return projectPath;
}

function preferencesRequest(body: unknown): Request {
  return new Request("http://localhost/api/project/preferences", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/project/preferences", () => {
  it("persists preferences into project metadata for a valid projectId", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    await writeProject(projectsDir, projectId);

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        preferencesRequest({
          projectId,
          preferences: { colorMode: "dark", searchResultLimit: 25 },
        }) as never,
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.metadata.userPreferences.colorMode).toBe("dark");
    expect(json.metadata.userPreferences.searchResultLimit).toBe(25);
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const projectsDir = await makeProjectsDir();

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        preferencesRequest({
          projectId: "not-a-uuid",
          preferences: { colorMode: "dark" },
        }) as never,
      ),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid projectId");
  });
});
