/**
 * Every route that takes a resource (or folder) id refuses one that is not a
 * UUID with the uniform 400, before any file path is built from it. An id
 * with `../` segments used to be joined into a path: the reorder and sidecar
 * routes wrote files outside the project folder (measured against a dev
 * server). See `src/lib/models/resource-id.ts`.
 *
 * `[resource-id]` routes are found by walking `app/api`, so a new one is
 * covered without editing this file. Routes that take ids in the body are
 * listed by hand.
 */
import { mkdtemp } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { CLASSIFICATION_HEADER } from "../../src/lib/sharing/classify-request";
import { removeDirRetry } from "./helpers/fs-utils";

const APP_API = path.resolve(__dirname, "../../app/api");
const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
const BAD_IDS = ["../x", "not-a-uuid", ""];

/** Floors, below the counts on 2026-10-24 (11 files, 14 handlers). */
const MIN_RESOURCE_ID_ROUTE_FILES = 11;
const MIN_RESOURCE_ID_HANDLERS = 14;

type Handler = (
  req: Request,
  ctx: { params: Promise<unknown> },
) => Promise<Response>;

let projectsDir = "";
const originalEnv = process.env.GETWRITE_PROJECTS_DIR;

beforeEach(async () => {
  projectsDir = await mkdtemp(path.join(os.tmpdir(), "gw-resource-id-guard-"));
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
});

afterEach(async () => {
  process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  await removeDirRetry(projectsDir);
});

async function walkRouteFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkRouteFiles(full)));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

function request(method: string, url: string, body?: unknown): Request {
  return new Request(url, {
    method,
    // As the sharing gate classifies the desktop window with sharing off, so
    // the paired-device limit checks (revision delete, purge) let it through.
    headers: {
      "Content-Type": "application/json",
      [CLASSIFICATION_HEADER]: "off",
    },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
}

async function expectRefused(res: Response): Promise<void> {
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: "Invalid resource id" });
}

describe("[resource-id] routes", () => {
  it("refuse a resource id that is not a UUID, for every exported handler", async () => {
    const files = (await walkRouteFiles(APP_API)).filter((f) =>
      f.includes(`${path.sep}[resource-id]${path.sep}`),
    );
    expect(files.length).toBeGreaterThanOrEqual(MIN_RESOURCE_ID_ROUTE_FILES);

    const projectId = generateUUID();
    let handlers = 0;
    for (const file of files) {
      const mod = (await import(file)) as Record<string, unknown>;
      for (const method of HTTP_METHODS) {
        const handler = mod[method] as Handler | undefined;
        if (!handler) continue;
        handlers++;
        for (const badId of BAD_IDS) {
          const res = await handler(
            request(
              method,
              `http://localhost/api/resource/x?projectId=${projectId}&revisionId=r`,
              { projectId, revisionId: "r" },
            ),
            { params: Promise.resolve({ "resource-id": badId }) },
          );
          expect(res.status, `${method} ${file} ${JSON.stringify(badId)}`).toBe(
            400,
          );
          expect(await res.json()).toEqual({ error: "Invalid resource id" });
        }
      }
    }
    expect(handlers).toBeGreaterThanOrEqual(MIN_RESOURCE_ID_HANDLERS);
  });
});

describe("routes that take resource ids in the body", () => {
  const projectId = generateUUID();
  const post = async (
    routePath: string,
    body: unknown,
    params: Record<string, string> = {},
  ): Promise<Response> => {
    const mod = (await import(`../../app/api/${routePath}/route`)) as {
      POST: Handler;
    };
    return mod.POST(
      request("POST", `http://localhost/api/${routePath}`, body),
      { params: Promise.resolve(params) },
    );
  };

  it.each(BAD_IDS)("project-resources refuses %j", async (badId) => {
    await expectRefused(
      await post("project-resources", { projectId, resourceId: badId }),
    );
  });

  it.each(BAD_IDS)("project-resources/excerpts refuses %j", async (badId) => {
    await expectRefused(
      await post("project-resources/excerpts", {
        projectId,
        resourceIds: [generateUUID(), badId],
      }),
    );
  });

  it.each([
    "compile/text",
    "compile/markdown",
    "compile/pdf",
    "compile/docx",
    "export/text",
    "export/markdown",
  ])("%s refuses a bad id in resourceIds", async (routePath) => {
    await expectRefused(
      await post(routePath, {
        projectId,
        resourceIds: ["../x"],
        resources: [],
      }),
    );
  });

  it("trash restore refuses a bad id", async () => {
    await expectRefused(
      await post(
        "project/[project-id]/trash/restore",
        { ids: [generateUUID(), "../x"] },
        { "project-id": projectId },
      ),
    );
  });

  it("trash purge refuses a bad id", async () => {
    await expectRefused(
      await post(
        "project/[project-id]/trash/purge",
        { ids: ["../x"] },
        { "project-id": projectId },
      ),
    );
  });

  it.each([
    { resourceOrder: [{ id: "../x", orderIndex: 0 }], folderOrder: [] },
    {
      resourceOrder: [{ id: generateUUID(), orderIndex: 0, folderId: "../x" }],
      folderOrder: [],
    },
    { resourceOrder: [], folderOrder: [{ id: "../x", orderIndex: 0 }] },
  ])("reorder refuses a bad id or folderId (%#)", async (body) => {
    await expectRefused(
      await post("projects/[projectId]/reorder", body, { projectId }),
    );
  });
});
