/**
 * Feature 90, Task 29 (FR-5, FR-27): the hosted-auth state is supplied by the
 * route, not read inside the shared library. `isHostedAuthActive` is mocked to
 * `true` here while the environment variables that earlier activated it stay
 * unset, so the only thing that can make Save and Delete refuse is the value
 * the routes pass in. Throwaway directories under the OS temp folder only.
 */
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { isHostedAuthActiveMock } = vi.hoisted(() => ({
  isHostedAuthActiveMock: vi.fn(),
}));
vi.mock("../../src/lib/auth/auth-config", () => ({
  isHostedAuthActive: isHostedAuthActiveMock,
}));

import { GET, POST } from "../../app/api/project-types/route";
import { PUT, DELETE } from "../../app/api/project-types/[id]/route";
import { clearProjectTypeCache } from "../../src/lib/projectTypes";

const ENV_KEYS = [
  "GETWRITE_SAVED_PROJECT_TYPES_DIR",
  "GETWRITE_PROJECT_TYPES_DIR",
  "GETWRITE_TEMPLATES_DIR",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
] as const;

function spec(id: string, name: string): Record<string, unknown> {
  return { id, name, folders: [{ name: "Workspace" }] };
}

function json(method: string, body: unknown): Request {
  return new Request("http://localhost/api/project-types", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("project-types routes pass the hosted state (Task 29)", () => {
  let root: string;
  let savedDir: string;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
    root = await fsp.mkdtemp(path.join(os.tmpdir(), "gw-pthosted-"));
    const builtInDir = path.join(root, "builtin");
    savedDir = path.join(root, "saved");
    await fsp.mkdir(builtInDir);
    await fsp.mkdir(savedDir);
    await fsp.writeFile(
      path.join(builtInDir, "novel.json"),
      JSON.stringify(spec("novel", "Novel")),
    );
    await fsp.writeFile(
      path.join(savedDir, "mine.json"),
      JSON.stringify(spec("mine", "Mine")),
    );
    delete process.env.GETWRITE_TEMPLATES_DIR;
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.GETWRITE_PROJECT_TYPES_DIR = builtInDir;
    process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = savedDir;
    isHostedAuthActiveMock.mockReset().mockReturnValue(true);
    clearProjectTypeCache();
  });

  afterEach(async () => {
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
    await fsp.rm(root, { recursive: true, force: true });
    clearProjectTypeCache();
  });

  it("POST, PUT and DELETE return saving-unavailable and change nothing", async () => {
    const created = await POST(json("POST", spec("fresh", "Fresh")));
    const replaced = await PUT(
      json("PUT", spec("mine", "Renamed")),
      ctx("mine"),
    );
    const deleted = await DELETE(
      new Request("http://localhost/api/project-types/mine", {
        method: "DELETE",
      }),
      ctx("mine"),
    );
    for (const res of [created, replaced, deleted]) {
      expect(res.status).toBe(503);
      expect(await res.json()).toMatchObject({ reason: "saving-unavailable" });
    }
    expect((await fsp.readdir(savedDir)).sort()).toEqual(["mine.json"]);
    expect(isHostedAuthActiveMock).toHaveBeenCalled();
  });

  it("GET lists built-in types only and reports not-configured", async () => {
    const res = await GET();
    const body = (await res.json()) as {
      entries: { spec: { id: string }; source: string }[];
      savedStatus: string;
    };
    expect(body.entries.map((e) => [e.spec.id, e.source])).toEqual([
      ["novel", "built-in"],
    ]);
    expect(body.savedStatus).toBe("not-configured");
  });

  it("with the route passing false, the same directory is used", async () => {
    isHostedAuthActiveMock.mockReturnValue(false);
    const body = (await (await GET()).json()) as {
      entries: { spec: { id: string } }[];
      savedStatus: string;
    };
    expect(body.entries.map((e) => e.spec.id)).toEqual(["novel", "mine"]);
    expect(body.savedStatus).toBe("ok");
  });
});
