/**
 * Feature 106 Task 10 (FR-10, FR-9, FR-2): `POST /api/project/capture`.
 * Real temp directories as tenant data roots; `resolveTenant` and
 * `isHostedAuthActive` are mocked so one tenant can be played against another.
 * Fakes here are not evidence about a real hosted tenant (see the task notes).
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { tenantState, isHostedAuthActiveMock } = vi.hoisted(() => ({
  tenantState: { root: "" },
  isHostedAuthActiveMock: vi.fn(),
}));
vi.mock("../../app/api/_tenant/resolve-tenant", async () => {
  const { resolveBackendAdapter } =
    await import("../../app/api/_tenant/storage-backend");
  return {
    resolveTenant: vi.fn(async () => ({
      userId: "tenant-user",
      dataRoot: tenantState.root,
      adapter: resolveBackendAdapter(),
    })),
  };
});
vi.mock("../../src/lib/auth/auth-config", () => ({
  isHostedAuthActive: isHostedAuthActiveMock,
}));
vi.mock("../../src/lib/models/inbox-capture-core", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../src/lib/models/inbox-capture-core")
    >();
  return { ...actual, captureToInboxCore: vi.fn(actual.captureToInboxCore) };
});

import { POST } from "../../app/api/project/capture/route";
import * as routeModule from "../../app/api/project/capture/route";
import { captureToInboxCore } from "../../src/lib/models/inbox-capture-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";
import { removeDirRetry } from "./helpers/fs-utils";
import type { CaptureResult } from "../../src/lib/api/inbox-capture-types";

const ROUTE_URL = "http://localhost/api/project/capture";
const ORIGIN = "https://app.getwrite.example";
const dirs: string[] = [];
let savedAuthUrl: string | undefined;

beforeEach(() => {
  savedAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = ORIGIN;
  isHostedAuthActiveMock.mockReturnValue(false);
});

afterEach(async () => {
  vi.mocked(captureToInboxCore).mockClear();
  if (savedAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = savedAuthUrl;
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function tenantRoot(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-capture-route-"));
  dirs.push(dir);
  return dir;
}

async function addProject(root: string): Promise<string> {
  const id = generateUUID();
  await fs.mkdir(path.join(root, id), { recursive: true });
  await fs.writeFile(
    path.join(root, id, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "p" }), null, 2),
    "utf8",
  );
  return id;
}

function post(body: unknown, headers: Record<string, string> = {}): never {
  return new Request(ROUTE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
}

describe("POST /api/project/capture", () => {
  it("exports POST only and no other method", () => {
    expect(Object.keys(routeModule).filter((k) => /^[A-Z]+$/.test(k))).toEqual([
      "POST",
    ]);
  });

  it("creates the item and returns the typed created body", async () => {
    tenantState.root = await tenantRoot();
    const projectId = await addProject(tenantState.root);
    const res = await POST(post({ projectId, text: "hello", origin: "typed" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as CaptureResult;
    expect(body.status).toBe("created");
    if (body.status !== "created") return;
    expect(body.resourceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.inboxFolderId).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.notices).toEqual([]);
  });

  it("passes the optional link and the trash choice to the core", async () => {
    tenantState.root = await tenantRoot();
    const projectId = await addProject(tenantState.root);
    await POST(
      post({
        projectId,
        text: "t",
        link: "https://example.com",
        origin: "shared",
        inboxChoice: "new",
      }),
    );
    expect(captureToInboxCore).toHaveBeenCalledWith({
      projectId,
      text: "t",
      link: "https://example.com",
      origin: "shared",
      inboxChoice: "new",
    });
  });

  it("returns the core's refusal as a typed body and writes nothing", async () => {
    tenantState.root = await tenantRoot();
    const projectId = await addProject(tenantState.root);
    const res = await POST(post({ projectId, text: "   ", origin: "typed" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as CaptureResult;
    expect(body.status).toBe("refused");
    if (body.status !== "refused") return;
    expect(body.notices[0].code).toBe("empty");
    const entries = await fs.readdir(path.join(tenantState.root, projectId));
    expect(entries).not.toContain("resources");
  });

  it("returns the core's needs-choice result as a typed body", async () => {
    const needs: CaptureResult = {
      status: "needs-choice",
      state: "inbox-in-trash",
    };
    vi.mocked(captureToInboxCore).mockResolvedValueOnce(needs);
    tenantState.root = await tenantRoot();
    const projectId = await addProject(tenantState.root);
    const res = await POST(post({ projectId, text: "x", origin: "typed" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(needs);
  });

  it.each([
    ["invalid JSON", "{ not json"],
    ["an array body", []],
    ["no text", { projectId: "p", origin: "typed" }],
    ["a numeric text", { projectId: "p", text: 3, origin: "typed" }],
    ["an unknown origin", { projectId: "p", text: "x", origin: "paste" }],
    ["no origin", { projectId: "p", text: "x" }],
    ["a numeric link", { projectId: "p", text: "x", origin: "typed", link: 1 }],
    [
      "an unknown choice",
      { projectId: "p", text: "x", origin: "typed", inboxChoice: "merge" },
    ],
  ])("returns 400 for %s, before the core runs", async (_name, body) => {
    tenantState.root = await tenantRoot();
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
    expect(captureToInboxCore).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed project id", async () => {
    tenantState.root = await tenantRoot();
    const res = await POST(
      post({ projectId: "../etc", text: "x", origin: "typed" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid projectId" });
  });

  it("ignores a client-supplied path or timestamp field", async () => {
    tenantState.root = await tenantRoot();
    const projectId = await addProject(tenantState.root);
    await POST(
      post({
        projectId,
        text: "x",
        origin: "typed",
        projectRoot: "/etc",
        capturedAt: "1999-01-01T00:00:00.000Z",
      }),
    );
    expect(captureToInboxCore).toHaveBeenCalledWith({
      projectId,
      text: "x",
      origin: "typed",
    });
  });

  it("maps a locked project to the existing locked responses", async () => {
    tenantState.root = await tenantRoot();
    const projectId = await addProject(tenantState.root);
    vi.mocked(captureToInboxCore).mockRejectedValueOnce(
      new ProjectLockedError(projectId),
    );
    const locked = await POST(post({ projectId, text: "x", origin: "typed" }));
    expect(locked.status).toBe(401);
    vi.mocked(captureToInboxCore).mockRejectedValueOnce(
      new MissingProjectKeyError(projectId),
    );
    const noKey = await POST(post({ projectId, text: "x", origin: "typed" }));
    expect(noKey.status).toBe(409);
  });

  it("does not turn an unexpected core failure into a result body", async () => {
    tenantState.root = await tenantRoot();
    const projectId = await addProject(tenantState.root);
    vi.mocked(captureToInboxCore).mockRejectedValueOnce(new Error("disk"));
    await expect(
      POST(post({ projectId, text: "x", origin: "typed" })),
    ).rejects.toThrow("disk");
  });
});

describe("POST /api/project/capture, hosted tenancy", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReturnValue(true);
  });

  it("writes into the signed-in tenant's own project", async () => {
    tenantState.root = await tenantRoot();
    const projectId = await addProject(tenantState.root);
    const res = await POST(
      post({ projectId, text: "mine", origin: "typed" }, { origin: ORIGIN }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as CaptureResult).status).toBe("created");
  });

  it("refuses a cross-site request before the core runs", async () => {
    tenantState.root = await tenantRoot();
    const projectId = await addProject(tenantState.root);
    const res = await POST(
      post(
        { projectId, text: "x", origin: "typed" },
        { origin: "https://evil.example" },
      ),
    );
    expect(res.status).toBe(403);
    expect(captureToInboxCore).not.toHaveBeenCalled();
  });

  it("never writes into another tenant's project id", async () => {
    const tenantA = await tenantRoot();
    const tenantB = await tenantRoot();
    const projectOfA = await addProject(tenantA);
    const before = await fs.readdir(path.join(tenantA, projectOfA));

    tenantState.root = tenantB; // the signed-in request is tenant B's
    const outcome = await POST(
      post(
        { projectId: projectOfA, text: "intruder", origin: "typed" },
        { origin: ORIGIN },
      ),
    ).then(
      (res: Response) => res.status,
      () => "rejected" as const,
    );
    expect(outcome === "rejected" || (outcome as number) >= 400).toBe(true);
    expect(await fs.readdir(path.join(tenantA, projectOfA))).toEqual(before);
    const bEntries = await fs
      .readdir(path.join(tenantB, projectOfA))
      .catch(() => [] as string[]);
    expect(bEntries).not.toContain("resources");
    expect(bEntries).not.toContain(PROJECT_FILENAME);
  });
});
