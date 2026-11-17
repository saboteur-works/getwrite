/**
 * Feature 120 Task 31 (FR-14, FR-17): `POST /api/project/split/undo` and
 * `GET /api/project/split/latest`. The two cores (`undoLatestSplit`,
 * `readLatestOperation`) are faked by their Task 29/30 and Task 7 signatures,
 * so these tests are evidence about the routes only: not about the cores, a
 * real hosted tenant, or a real paired client. `resolveTenant` and
 * `isHostedAuthActive` are mocked so one tenant can be played against another,
 * as in `split-routes.test.ts`.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, type NextResponse } from "next/server";
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
vi.mock("../../src/lib/models/split-undo-core", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/lib/models/split-undo-core")
  >()),
  undoLatestSplit: vi.fn(),
}));
vi.mock("../../src/lib/models/split-records-core", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/lib/models/split-records-core")
  >()),
  readLatestOperation: vi.fn(),
}));

import * as undoRouteModule from "../../app/api/project/split/undo/route";
import { POST as undoPost } from "../../app/api/project/split/undo/route";
import * as latestRouteModule from "../../app/api/project/split/latest/route";
import { GET as latestGet } from "../../app/api/project/split/latest/route";
import { SPLIT_INVALID_REQUEST_MESSAGE } from "../../src/lib/api/split";
import { InvalidProjectIdCoreError } from "../../src/lib/models/inbox-capture-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { resolveProjectsDir } from "../../src/lib/models/projects-dir";
import { readLatestOperation } from "../../src/lib/models/split-records-core";
import { SplitLockKeyError } from "../../src/lib/models/split-preview-core";
import {
  undoLatestSplit,
  type SplitUndoResult,
} from "../../src/lib/models/split-undo-core";
import type { LatestOperationRecord } from "../../src/lib/models/split-types";
import { runGate } from "../../src/lib/sharing/gate";
import type { OwnMachine } from "../../src/lib/sharing/host-allowlist";
import { DEVICE_COOKIE } from "../../src/lib/sharing/classify-request";
import {
  addDevice,
  mintCredential,
} from "../../src/lib/sharing/credential-store";
import { removeDirRetry } from "./helpers/fs-utils";

const UNDO_URL = "http://localhost/api/project/split/undo";
const LATEST_URL = "http://localhost/api/project/split/latest";
const ORIGIN = "https://app.getwrite.example";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const ORIGINAL = "22222222-2222-4222-8222-222222222222";
const SPLIT_OFF = "33333333-3333-4333-8333-333333333333";
const dirs: string[] = [];
let savedAuthUrl: string | undefined;

const UNDO_BODY = { projectId: PROJECT };
const APPLIED_RESULT = {
  outcome: "applied" as const,
  originalDocumentId: ORIGINAL,
  splitOffDocumentId: SPLIT_OFF,
  splitOffState: "moved-to-trash" as const,
  preservedRevisions: [
    { documentId: ORIGINAL, revisionId: "v-3", revisionNumber: 3 },
  ],
  movedAnnotationIds: ["a1"],
};
const APPLIED: SplitUndoResult = APPLIED_RESULT;
const RECORD: LatestOperationRecord = {
  kind: "split",
  affectedDocumentIds: [ORIGINAL, SPLIT_OFF],
  snapshotRevisions: [
    { documentId: ORIGINAL, revisionId: "v-2", revisionNumber: 2 },
  ],
  newDocumentId: SPLIT_OFF,
  date: "2026-11-17T10:00:00.000Z",
};

beforeEach(() => {
  savedAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = ORIGIN;
  isHostedAuthActiveMock.mockReturnValue(false);
  vi.mocked(undoLatestSplit).mockResolvedValue(APPLIED);
  vi.mocked(readLatestOperation).mockResolvedValue({
    outcome: "found",
    record: RECORD,
  });
});

afterEach(async () => {
  vi.mocked(undoLatestSplit).mockReset();
  vi.mocked(readLatestOperation).mockReset();
  if (savedAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = savedAuthUrl;
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

async function tmp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

function send(body: unknown, headers: Record<string, string> = {}): never {
  return new Request(UNDO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
}

function read(query: string, headers: Record<string, string> = {}): never {
  return new Request(`${LATEST_URL}${query}`, {
    method: "GET",
    headers,
  }) as never;
}

describe("route surface", () => {
  it("undo exports POST only and latest exports GET only", () => {
    const methods = (mod: object): string[] =>
      Object.keys(mod)
        .filter((k) => /^[A-Z]+$/.test(k))
        .sort();
    expect(methods(undoRouteModule)).toEqual(["POST"]);
    expect(methods(latestRouteModule)).toEqual(["GET"]);
  });

  it("neither route imports lib/sharing or applies a paired-device limit", async () => {
    for (const file of [
      "../../app/api/project/split/undo/route.ts",
      "../../app/api/project/split/latest/route.ts",
    ]) {
      const source = await fs.readFile(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(
        /checkLimit|limits-check|refusalFor|lib\/sharing/,
      );
      expect(source).toMatch(/withStorageContext/);
    }
  });
});

describe("undo route: request boundary", () => {
  it.each([
    ["invalid JSON", "{ not json"],
    ["an array body", []],
    ["a null body", null],
    ["an empty object", {}],
    ["a path key", { ...UNDO_BODY, path: "/etc/passwd-SECRET" }],
    ["a projectRoot key", { ...UNDO_BODY, projectRoot: "/etc/SECRET" }],
    ["an unknown key", { ...UNDO_BODY, resourceId: "SECRET" }],
    ["a malformed project id", { projectId: "../SECRET" }],
    ["a project id that is a number", { projectId: 5 }],
  ])(
    "returns 400 with one fixed text for %s, before the core runs, echoing nothing",
    async (_label, body) => {
      const res = await undoPost(send(body));
      expect(res.status).toBe(400);
      const text = JSON.stringify(await res.json());
      expect(text).toBe(
        JSON.stringify({ error: SPLIT_INVALID_REQUEST_MESSAGE }),
      );
      expect(text).not.toContain("SECRET");
      expect(undoLatestSplit).not.toHaveBeenCalled();
    },
  );

  it("maps a project id the core refuses to the same fixed text", async () => {
    vi.mocked(undoLatestSplit).mockRejectedValueOnce(
      new InvalidProjectIdCoreError("../SECRET"),
    );
    const res = await undoPost(send(UNDO_BODY));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: SPLIT_INVALID_REQUEST_MESSAGE });
  });

  it("maps a locked project to the existing 401 and 409 responses", async () => {
    vi.mocked(undoLatestSplit).mockRejectedValueOnce(
      new ProjectLockedError(PROJECT),
    );
    expect((await undoPost(send(UNDO_BODY))).status).toBe(401);
    vi.mocked(undoLatestSplit).mockRejectedValueOnce(
      new MissingProjectKeyError(PROJECT),
    );
    expect((await undoPost(send(UNDO_BODY))).status).toBe(409);
  });

  it("does not turn an unexpected core failure into a result body", async () => {
    vi.mocked(undoLatestSplit).mockRejectedValueOnce(new Error("disk"));
    await expect(undoPost(send(UNDO_BODY))).rejects.toThrow("disk");
  });

  it("refuses a cross-site request on hosted web before the core runs", async () => {
    isHostedAuthActiveMock.mockReturnValue(true);
    tenantState.root = await tmp("gw-undo-csrf-");
    const res = await undoPost(
      send(UNDO_BODY, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(undoLatestSplit).not.toHaveBeenCalled();
  });
});

describe("undo route: outcomes", () => {
  it("passes the project id, and only it, to the core and returns the applied body", async () => {
    const res = await undoPost(send(UNDO_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(APPLIED);
    expect(undoLatestSplit).toHaveBeenCalledWith(PROJECT);
  });

  it.each<[string, SplitUndoResult]>([
    [
      "index-failed",
      {
        ...APPLIED_RESULT,
        outcome: "index-failed",
        failures: [{ documentId: ORIGINAL, step: "inverted-index" }],
      },
    ],
    ["nothing-to-undo", { outcome: "nothing-to-undo" }],
    [
      "unsupported-operation",
      { outcome: "unsupported-operation", kind: "merge" },
    ],
    [
      "refused",
      { outcome: "refused", reason: "original-in-trash", message: "text" },
    ],
    [
      "failed",
      {
        outcome: "failed",
        failedStep: "restore-original",
        cause: "Error",
        remainingState: "split-restored",
      },
    ],
  ])("returns %s as a typed 200 body", async (_n, result) => {
    vi.mocked(undoLatestSplit).mockResolvedValueOnce(result);
    const res = await undoPost(send(UNDO_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
  });

  it("returns could-not-be-checked with a stable cause from a fixed list, never a stored message", async () => {
    vi.mocked(undoLatestSplit).mockResolvedValueOnce({
      outcome: "could-not-be-checked",
      cause: "record-malformed",
    });
    expect(await (await undoPost(send(UNDO_BODY))).json()).toEqual({
      outcome: "could-not-be-checked",
      cause: "record-malformed",
    });
    vi.mocked(undoLatestSplit).mockResolvedValueOnce({
      outcome: "could-not-be-checked",
      cause: "EACCES: permission denied, open '/private/path/SECRET'",
    });
    const body: unknown = await (await undoPost(send(UNDO_BODY))).json();
    expect(body).toEqual({
      outcome: "could-not-be-checked",
      cause: "record-unreadable",
    });
  });

  it("maps a root that is not absolute to could-not-be-checked (raised before any write)", async () => {
    vi.mocked(undoLatestSplit).mockRejectedValueOnce(new SplitLockKeyError());
    const res = await undoPost(send(UNDO_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcome: "could-not-be-checked",
      cause: "project-root-not-absolute",
    });
  });
});

describe("latest route", () => {
  it("is a GET that reads the record of the validated project", async () => {
    const res = await latestGet(read(`?projectId=${PROJECT}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: "found", record: RECORD });
    expect(readLatestOperation).toHaveBeenCalledTimes(1);
    const root = vi.mocked(readLatestOperation).mock.calls[0][0];
    expect(path.basename(root)).toBe(PROJECT);
  });

  it("returns none as none", async () => {
    vi.mocked(readLatestOperation).mockResolvedValueOnce({ outcome: "none" });
    const res = await latestGet(read(`?projectId=${PROJECT}`));
    expect(await res.json()).toEqual({ outcome: "none" });
  });

  it("returns a failed read as failed with a stable cause, distinct from none, and no path", async () => {
    vi.mocked(readLatestOperation).mockResolvedValueOnce({
      outcome: "failed",
      cause: "EACCES: permission denied, open '/private/path/SECRET'",
    });
    const res = await latestGet(read(`?projectId=${PROJECT}`));
    expect(res.status).toBe(200);
    const body: unknown = await res.json();
    expect(body).toEqual({ outcome: "failed", cause: "record-unreadable" });
    expect(JSON.stringify(body)).not.toContain("SECRET");
  });

  it.each([
    ["no project id", ""],
    ["a malformed project id", "?projectId=..%2FSECRET"],
    ["an unknown parameter", `?projectId=${PROJECT}&path=%2Fetc%2FSECRET`],
    ["a repeated project id", `?projectId=${PROJECT}&projectId=${PROJECT}`],
  ])(
    "returns 400 with one fixed text for %s, echoing nothing",
    async (_n, q) => {
      const res = await latestGet(read(q));
      expect(res.status).toBe(400);
      const text = JSON.stringify(await res.json());
      expect(text).toBe(
        JSON.stringify({ error: SPLIT_INVALID_REQUEST_MESSAGE }),
      );
      expect(text).not.toContain("SECRET");
      expect(readLatestOperation).not.toHaveBeenCalled();
    },
  );

  it("maps a locked project to 401 and 409", async () => {
    vi.mocked(readLatestOperation).mockRejectedValueOnce(
      new ProjectLockedError(PROJECT),
    );
    expect((await latestGet(read(`?projectId=${PROJECT}`))).status).toBe(401);
    vi.mocked(readLatestOperation).mockRejectedValueOnce(
      new MissingProjectKeyError(PROJECT),
    );
    expect((await latestGet(read(`?projectId=${PROJECT}`))).status).toBe(409);
  });

  it("does not turn an unexpected failure into a result body", async () => {
    vi.mocked(readLatestOperation).mockRejectedValueOnce(new Error("disk"));
    await expect(latestGet(read(`?projectId=${PROJECT}`))).rejects.toThrow(
      "disk",
    );
  });
});

describe("hosted tenancy (cores faked over the request's storage context)", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReturnValue(true);
    vi.mocked(undoLatestSplit).mockImplementation(async (projectId: string) => {
      const dir = path.join(resolveProjectsDir(), projectId);
      await fs.stat(dir);
      await fs.writeFile(path.join(dir, "undo-marker"), "written");
      return APPLIED;
    });
    vi.mocked(readLatestOperation).mockImplementation(
      async (projectRoot: string) => {
        await fs.stat(projectRoot);
        return { outcome: "found", record: RECORD };
      },
    );
  });

  async function seedProject(root: string): Promise<string> {
    const dir = path.join(root, PROJECT);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  it("an undo writes only into the signed-in tenant's project", async () => {
    const tenantA = await tmp("gw-undo-a-");
    const tenantB = await tmp("gw-undo-b-");
    const dirA = await seedProject(tenantA);
    const dirB = await seedProject(tenantB);
    tenantState.root = tenantB;
    const res = await undoPost(send(UNDO_BODY, { origin: ORIGIN }));
    expect(res.status).toBe(200);
    expect(await fs.readdir(dirB)).toEqual(["undo-marker"]);
    expect(await fs.readdir(dirA)).toEqual([]);
  });

  it("a tenant with no such project writes nothing and tenant A's project is untouched", async () => {
    const tenantA = await tmp("gw-undo-a-");
    const tenantB = await tmp("gw-undo-b-");
    const dirA = await seedProject(tenantA);
    tenantState.root = tenantB;
    const outcome = await undoPost(send(UNDO_BODY, { origin: ORIGIN })).then(
      (res: Response) => ({ status: res.status }),
      () => ({ status: 0 }),
    );
    expect(outcome.status === 0 || outcome.status >= 400).toBe(true);
    expect(await fs.readdir(dirA)).toEqual([]);
    expect(await fs.readdir(tenantB)).toEqual([]);
  });

  it("a latest read resolves the root under the signed-in tenant only", async () => {
    const tenantA = await tmp("gw-latest-a-");
    const tenantB = await tmp("gw-latest-b-");
    await seedProject(tenantA);
    tenantState.root = tenantB;
    const outcome = await latestGet(read(`?projectId=${PROJECT}`)).then(
      (res: Response) => ({ status: res.status }),
      () => ({ status: 0 }),
    );
    expect(outcome.status === 0 || outcome.status >= 400).toBe(true);
    const root = vi.mocked(readLatestOperation).mock.calls[0][0];
    expect(root.startsWith(tenantB)).toBe(true);
    expect(root.startsWith(tenantA)).toBe(false);
  });
});

describe("paired-device gate: classified as the capture and split routes are", () => {
  const MACHINE: OwnMachine = {
    hostname: "test-machine",
    interfaces: {
      en0: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
    } as OwnMachine["interfaces"],
  };
  let sharingDir: string;

  beforeEach(async () => {
    sharingDir = await tmp("gw-undo-gate-");
    vi.stubEnv("GETWRITE_SHARING", "1");
    vi.stubEnv("GETWRITE_SHARING_DIR", sharingDir);
    vi.stubEnv("GETWRITE_WINDOW_SECRET", "w".repeat(64));
    vi.stubEnv("PORT", "3000");
  });
  afterEach(() => vi.unstubAllEnvs());

  function gateRequest(
    method: string,
    pathname: string,
    headers: Record<string, string>,
  ): NextRequest {
    const host = "10.0.0.5:3000";
    return new NextRequest(`http://${host}${pathname}`, {
      method,
      headers: { host, origin: `http://${host}`, ...headers },
    });
  }

  const passes = (res: NextResponse): boolean =>
    res.headers.get("x-middleware-next") === "1";

  it.each([
    ["POST", "/api/project/split/undo"],
    ["GET", "/api/project/split/latest"],
  ])(
    "%s %s: a paired device passes as for /api/project/capture, an unpaired one is refused",
    async (method, route) => {
      const { token, device } = mintCredential("Device");
      await addDevice(sharingDir, device);
      const cookie = { cookie: `${DEVICE_COOKIE}=${token}` };
      for (const [m, target] of [
        [method, route],
        ["POST", "/api/project/capture"],
      ]) {
        const paired = await runGate(
          gateRequest(m, target, cookie),
          process.env,
          MACHINE,
        );
        expect(passes(paired), `${target} paired`).toBe(true);
        const unpaired = await runGate(
          gateRequest(m, target, {}),
          process.env,
          MACHINE,
        );
        expect(passes(unpaired), `${target} unpaired`).toBe(false);
        expect([401, 403, 302, 303, 307]).toContain(unpaired.status);
      }
    },
  );
});
