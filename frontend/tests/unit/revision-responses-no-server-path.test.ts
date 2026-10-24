/**
 * task_d53cf256: revision objects carry `filePath`, the absolute path of the
 * revision's `content.bin` on the server, and the routes returned them as
 * stored, so every client (a paired device, a hosted user) received the
 * server's directory layout. Responses now leave it out.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { writeRevision } from "../../src/lib/models/revision";
import {
  DELETE,
  GET,
  PATCH,
  POST,
} from "../../app/api/resource/revision/[resource-id]/route";
import { POST as projectResourcesPost } from "../../app/api/project-resources/route";
import { removeDirRetry } from "./helpers/fs-utils";

let projectsDir = "";
let projectId = "";
let projectPath = "";
const originalEnv = process.env.GETWRITE_PROJECTS_DIR;

beforeEach(async () => {
  projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-rev-no-path-"));
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  projectId = generateUUID();
  projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  await fs.writeFile(
    path.join(projectPath, "project.json"),
    JSON.stringify({ id: projectId, name: "P" }),
  );
});

afterEach(async () => {
  process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  await removeDirRetry(projectsDir);
});

function jsonRequest(method: string, body: object): NextRequest {
  return new NextRequest("http://localhost/api/resource/revision/x", {
    method,
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      "x-getwrite-classification": "off",
    },
  });
}

/** Fails if any value anywhere in `body` contains the projects directory. */
function expectNoServerPath(body: unknown): void {
  expect(JSON.stringify(body)).not.toContain(projectsDir);
  expect(JSON.stringify(body)).not.toContain("filePath");
}

describe("revision responses leave out the server path", () => {
  it("GET", async () => {
    const resourceId = generateUUID();
    const rev = await writeRevision(projectPath, resourceId, 1, "a", {
      isCanonical: true,
    });
    const res = await GET(
      new NextRequest(
        `http://localhost/api/resource/revision/${resourceId}?projectId=${projectId}&revisionId=${rev.id}`,
      ),
      { params: Promise.resolve({ "resource-id": resourceId }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revision: { id: string } };
    expect(body.revision.id).toBe(rev.id);
    expectNoServerPath(body);
  });

  it("POST", async () => {
    const resourceId = generateUUID();
    await writeRevision(projectPath, resourceId, 1, "a", { isCanonical: true });
    const res = await POST(jsonRequest("POST", { projectId, content: "b" }), {
      params: Promise.resolve({ "resource-id": resourceId }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { versionNumber: number };
    expect(body.versionNumber).toBe(2);
    expectNoServerPath(body);
  });

  it("PATCH (set canonical and preserve)", async () => {
    const resourceId = generateUUID();
    await writeRevision(projectPath, resourceId, 1, "a", { isCanonical: true });
    const second = await writeRevision(projectPath, resourceId, 2, "b");
    for (const extra of [{}, { preserve: true }]) {
      const res = await PATCH(
        jsonRequest("PATCH", { projectId, revisionId: second.id, ...extra }),
        { params: Promise.resolve({ "resource-id": resourceId }) },
      );
      expect(res.status).toBe(200);
      expectNoServerPath(await res.json());
    }
  });

  it("DELETE", async () => {
    const resourceId = generateUUID();
    await writeRevision(projectPath, resourceId, 1, "a", { isCanonical: true });
    const second = await writeRevision(projectPath, resourceId, 2, "b");
    const res = await DELETE(
      jsonRequest("DELETE", { projectId, revisionId: second.id }),
      { params: Promise.resolve({ "resource-id": resourceId }) },
    );
    expect(res.status).toBe(200);
    expectNoServerPath(await res.json());
  });

  it("POST /api/project-resources (revision list)", async () => {
    const resourceId = generateUUID();
    await writeRevision(projectPath, resourceId, 1, "a", { isCanonical: true });
    const res = await projectResourcesPost(
      new Request("http://localhost/api/project-resources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, resourceId }),
      }) as never,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { revisions: unknown[] };
    expect(body.revisions).toHaveLength(1);
    expectNoServerPath(body);
  });
});
