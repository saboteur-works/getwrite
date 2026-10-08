/**
 * Integration tests for the project features route.
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

import { afterEach, describe, expect, it, vi } from "vitest";

// Feature 54, Task 14: a partial mock of project-features so a single test
// can force `updateFeatureConfig` to reject with a locked-access error,
// while every other test in this file keeps exercising the real
// implementation.
vi.mock("../../src/lib/models/project-features", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/project-features")
  >("../../src/lib/models/project-features");
  return { ...actual, updateFeatureConfig: vi.fn(actual.updateFeatureConfig) };
});

import { POST } from "../../app/api/project/features/route";
import { updateFeatureConfig } from "../../src/lib/models/project-features";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/crypto/adapter-selection";
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
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-features-"));
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
  const proj = createProject({ name: "features-test" });
  await fs.writeFile(
    path.join(projectPath, PROJECT_FILENAME),
    JSON.stringify(proj, null, 2),
    "utf8",
  );
  return projectPath;
}

function featuresRequest(body: unknown): Request {
  return new Request("http://localhost/api/project/features", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/project/features", () => {
  it("persists the feature flags for a valid projectId", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    await writeProject(projectsDir, projectId);

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        featuresRequest({
          projectId,
          features: { timeline: true, pov: true },
        }) as never,
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.features.timeline).toBe(true);
    expect(json.features.pov).toBe(true);
  });

  it("persists relationshipTypes when only that field is provided in the body (FR-19)", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    await writeProject(projectsDir, projectId);

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        featuresRequest({
          projectId,
          relationshipTypes: ["ally of", "rival of"],
        }) as never,
      ),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.relationshipTypes).toEqual(["ally of", "rival of"]);
  });

  it("accepts a request supplying only relationshipTypes — the at-least-one guard is widened, not rejected (FR-19)", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    await writeProject(projectsDir, projectId);

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        featuresRequest({
          projectId,
          relationshipTypes: ["mentor of"],
        }) as never,
      ),
    );

    expect(res.status).not.toBe(400);
    expect(res.status).toBe(200);
  });

  it("still returns 400 when none of features/organizerCardBody/relationshipTypes/subtypes is provided", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    await writeProject(projectsDir, projectId);

    const res = await withProjectsDir(projectsDir, () =>
      POST(featuresRequest({ projectId }) as never),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe(
      "Provide at least one of: features, organizerCardBody, relationshipTypes, subtypes.",
    );
  });

  it("returns the uniform 400 when projectId is not a well-formed UUID", async () => {
    const projectsDir = await makeProjectsDir();

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        featuresRequest({
          projectId: "not-a-uuid",
          features: { timeline: true },
        }) as never,
      ),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Invalid projectId");
  });
});

describe("POST /api/project/features — locked-access rethrow (Feature 54, Task 14, FR-14)", () => {
  it("maps a ProjectLockedError from updateFeatureConfig to 401 instead of the route's fixed 500 shape", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    await writeProject(projectsDir, projectId);

    vi.mocked(updateFeatureConfig).mockRejectedValueOnce(
      new ProjectLockedError("11111111-1111-4111-8111-111111111111"),
    );

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        featuresRequest({ projectId, features: { timeline: true } }) as never,
      ),
    );

    expect(res.status).toBe(401);
  });
});

describe("POST /api/project/features — subtypes (Feature 72, FR-2/FR-3/FR-4)", () => {
  async function readStored(projectPath: string): Promise<string> {
    return fs.readFile(path.join(projectPath, PROJECT_FILENAME), "utf8");
  }

  it("accepts a body carrying only subtypes and returns the trimmed list", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    await writeProject(projectsDir, projectId);

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        featuresRequest({
          projectId,
          subtypes: [" Scene ", "Chapter"],
        }) as never,
      ),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).subtypes).toEqual(["Scene", "Chapter"]);
  });

  it("returns 400 for a blank entry and leaves project.json unchanged", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    const projectPath = await writeProject(projectsDir, projectId);
    const before = await readStored(projectPath);

    const res = await withProjectsDir(projectsDir, () =>
      POST(featuresRequest({ projectId, subtypes: ["Scene", "  "] }) as never),
    );

    expect(res.status).toBe(400);
    expect(await readStored(projectPath)).toBe(before);
  });

  it("returns 400 for a case-insensitive duplicate and leaves project.json unchanged", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    const projectPath = await writeProject(projectsDir, projectId);
    const before = await readStored(projectPath);

    const res = await withProjectsDir(projectsDir, () =>
      POST(
        featuresRequest({ projectId, subtypes: ["Scene", "SCENE"] }) as never,
      ),
    );

    expect(res.status).toBe(400);
    expect(await readStored(projectPath)).toBe(before);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409 for a subtypes write", async () => {
    const projectsDir = await makeProjectsDir();
    const projectId = generateUUID();
    await writeProject(projectsDir, projectId);

    vi.mocked(updateFeatureConfig).mockRejectedValueOnce(
      new ProjectLockedError("11111111-1111-4111-8111-111111111111"),
    );
    const locked = await withProjectsDir(projectsDir, () =>
      POST(featuresRequest({ projectId, subtypes: ["Scene"] }) as never),
    );
    expect(locked.status).toBe(401);

    vi.mocked(updateFeatureConfig).mockRejectedValueOnce(
      new MissingProjectKeyError("11111111-1111-4111-8111-111111111111"),
    );
    const keyless = await withProjectsDir(projectsDir, () =>
      POST(featuresRequest({ projectId, subtypes: ["Scene"] }) as never),
    );
    expect(keyless.status).toBe(409);
  });
});
