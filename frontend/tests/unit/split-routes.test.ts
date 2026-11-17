/**
 * Feature 120 Task 23 (FR-14): `POST /api/project/split/preview` and
 * `POST /api/project/split`. The two cores are faked by their Task 19 and
 * Task 20 signatures, so these tests are evidence about the routes only: not
 * about the cores, a real hosted tenant, or a real paired client.
 * `resolveTenant` and `isHostedAuthActive` are mocked so one tenant can be
 * played against another, as in `claims-route.test.ts`.
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
vi.mock("../../src/lib/models/split-preview-core", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/lib/models/split-preview-core")
  >()),
  previewSplit: vi.fn(),
}));
vi.mock("../../src/lib/models/split-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/models/split-core")>()),
  applySplit: vi.fn(),
}));

import * as previewRouteModule from "../../app/api/project/split/preview/route";
import { POST as previewPost } from "../../app/api/project/split/preview/route";
import * as splitRouteModule from "../../app/api/project/split/route";
import { POST as splitPost } from "../../app/api/project/split/route";
import { SPLIT_INVALID_REQUEST_MESSAGE } from "../../src/lib/api/split";
import { InvalidProjectIdCoreError } from "../../src/lib/models/inbox-capture-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { resolveProjectsDir } from "../../src/lib/models/projects-dir";
import { applySplit } from "../../src/lib/models/split-core";
import {
  previewSplit,
  SplitLockKeyError,
  type SplitPreviewResult,
} from "../../src/lib/models/split-preview-core";
import { SPLIT_REFUSAL_REASONS } from "../../src/lib/models/split-types";
import { runGate } from "../../src/lib/sharing/gate";
import type { OwnMachine } from "../../src/lib/sharing/host-allowlist";
import { DEVICE_COOKIE } from "../../src/lib/sharing/classify-request";
import {
  addDevice,
  mintCredential,
} from "../../src/lib/sharing/credential-store";
import { removeDirRetry } from "./helpers/fs-utils";

const PREVIEW_URL = "http://localhost/api/project/split/preview";
const SPLIT_URL = "http://localhost/api/project/split";
const ORIGIN = "https://app.getwrite.example";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "22222222-2222-4222-8222-222222222222";
const NEW_ID = "33333333-3333-4333-8333-333333333333";
const HASH = "b".repeat(64);
const dirs: string[] = [];
let savedAuthUrl: string | undefined;

const CURSOR = {
  resourceId: RESOURCE,
  revisionId: "v-1",
  contentHash: HASH,
  offset: 9,
};
const PREVIEW_BODY = { projectId: PROJECT, ...CURSOR };
const CARRY = { annotationIds: ["a1"], fields: ["status"], newName: "Part 2" };
const SPLIT_BODY = { projectId: PROJECT, ...CURSOR, carryOver: CARRY };
const PREVIEW: SplitPreviewResult = {
  outcome: "preview",
  revisionId: "v-1",
  contentHash: HASH,
  offset: 9,
  documentName: "Doc",
  defaultNewName: "Doc (part 2)",
  firstHalfWords: 2,
  secondHalfWords: 3,
  anchored: { notes: [], citations: [], claims: [] },
  spanning: [],
  fields: [],
};
const APPLIED = {
  outcome: "applied" as const,
  newDocumentId: NEW_ID,
  notices: [],
  snapshotRevisionId: "v-2",
  snapshotRevisionNumber: 2,
};

beforeEach(() => {
  savedAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = ORIGIN;
  isHostedAuthActiveMock.mockReturnValue(false);
  vi.mocked(previewSplit).mockResolvedValue(PREVIEW);
  vi.mocked(applySplit).mockResolvedValue(APPLIED);
});

afterEach(async () => {
  vi.mocked(previewSplit).mockReset();
  vi.mocked(applySplit).mockReset();
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

function send(
  url: string,
  body: unknown,
  headers: Record<string, string> = {},
): never {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
}

const ROUTES = [
  ["preview", PREVIEW_URL, previewPost, PREVIEW_BODY, previewSplit],
  ["split", SPLIT_URL, splitPost, SPLIT_BODY, applySplit],
] as const;

describe("route surface", () => {
  it("each route exports POST only", () => {
    for (const mod of [previewRouteModule, splitRouteModule]) {
      expect(
        Object.keys(mod)
          .filter((k) => /^[A-Z]+$/.test(k))
          .sort(),
      ).toEqual(["POST"]);
    }
  });

  it("neither route imports lib/sharing or applies a paired-device limit", async () => {
    for (const file of [
      "../../app/api/project/split/preview/route.ts",
      "../../app/api/project/split/route.ts",
    ]) {
      const source = await fs.readFile(path.resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(
        /checkLimit|limits-check|refusalFor|lib\/sharing/,
      );
      expect(source).toMatch(/withStorageContext/);
    }
  });
});

describe.each(ROUTES)(
  "%s route: request boundary",
  (_n, url, post, ok, core) => {
    it.each([
      ["invalid JSON", "{ not json"],
      ["an array body", []],
      ["a null body", null],
      ["a path key", { ...ok, path: "/etc/passwd-SECRET" }],
      ["a projectRoot key", { ...ok, projectRoot: "/etc/SECRET" }],
      ["a malformed project id", { ...ok, projectId: "../SECRET" }],
      ["a malformed resource id", { ...ok, resourceId: "../SECRET" }],
      ["a missing resource id", { ...ok, resourceId: undefined }],
      ["a hash that is not hex", { ...ok, contentHash: "SECRET" }],
      ["a negative offset", { ...ok, offset: -1 }],
      ["a fractional offset", { ...ok, offset: 0.5 }],
      ["an offset that is a string", { ...ok, offset: "9" }],
      ["an empty revision id", { ...ok, revisionId: "" }],
      ["a revision id with a path", { ...ok, revisionId: "../v-1" }],
    ])(
      "returns 400 with one fixed text for %s, before the core runs, echoing nothing",
      async (_label, body) => {
        const res = await post(send(url, body));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
          error: SPLIT_INVALID_REQUEST_MESSAGE,
        });
        expect(core).not.toHaveBeenCalled();
      },
    );

    it("maps a project id the core refuses to the same fixed text", async () => {
      vi.mocked(core as typeof previewSplit).mockRejectedValueOnce(
        new InvalidProjectIdCoreError("../SECRET"),
      );
      const res = await post(send(url, ok));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: SPLIT_INVALID_REQUEST_MESSAGE,
      });
    });

    it("maps a locked project to the existing 401 and 409 responses", async () => {
      vi.mocked(core as typeof previewSplit).mockRejectedValueOnce(
        new ProjectLockedError(PROJECT),
      );
      expect((await post(send(url, ok))).status).toBe(401);
      vi.mocked(core as typeof previewSplit).mockRejectedValueOnce(
        new MissingProjectKeyError(PROJECT),
      );
      expect((await post(send(url, ok))).status).toBe(409);
    });

    it("does not turn an unexpected core failure into a result body", async () => {
      vi.mocked(core as typeof previewSplit).mockRejectedValueOnce(
        new Error("disk"),
      );
      await expect(post(send(url, ok))).rejects.toThrow("disk");
    });

    it("refuses a cross-site request on hosted web before the core runs", async () => {
      isHostedAuthActiveMock.mockReturnValue(true);
      tenantState.root = await tmp("gw-split-csrf-");
      const res = await post(send(url, ok, { origin: "https://evil.example" }));
      expect(res.status).toBe(403);
      expect(core).not.toHaveBeenCalled();
    });
  },
);

describe("preview route", () => {
  it("passes the ids and the cursor, and only those, to the core", async () => {
    const res = await previewPost(send(PREVIEW_URL, PREVIEW_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PREVIEW);
    expect(previewSplit).toHaveBeenCalledWith(PROJECT, CURSOR);
  });

  it("returns a refusal with its reason, stale included", async () => {
    for (const reason of [
      SPLIT_REFUSAL_REASONS.staleCursor,
      SPLIT_REFUSAL_REASONS.cursorInCodeBlock,
    ]) {
      vi.mocked(previewSplit).mockResolvedValueOnce({
        outcome: "refused",
        reason,
      });
      const res = await previewPost(send(PREVIEW_URL, PREVIEW_BODY));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ outcome: "refused", reason });
    }
  });

  it("returns a failed outcome as failed, never as a preview", async () => {
    vi.mocked(previewSplit).mockResolvedValueOnce({
      outcome: "failed",
      cause: "content-unreadable",
    });
    const res = await previewPost(send(PREVIEW_URL, PREVIEW_BODY));
    expect(await res.json()).toEqual({
      outcome: "failed",
      cause: "content-unreadable",
    });
  });

  it("maps a root that is not absolute to a typed failed outcome", async () => {
    vi.mocked(previewSplit).mockRejectedValueOnce(new SplitLockKeyError());
    const res = await previewPost(send(PREVIEW_URL, PREVIEW_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcome: "failed",
      cause: "project-root-not-absolute",
    });
  });
});

describe("split route", () => {
  it("passes the ids, the cursor and the carry-over, and only those, to the core", async () => {
    const res = await splitPost(
      send(SPLIT_URL, {
        ...SPLIT_BODY,
        carryOver: { ...CARRY, annotationIds: ["a1", "a2"] },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(APPLIED);
    expect(applySplit).toHaveBeenCalledWith(PROJECT, {
      ...CURSOR,
      carryOver: { ...CARRY, annotationIds: ["a1", "a2"] },
    });
  });

  it.each([
    ["no carry-over", { ...PREVIEW_BODY }],
    ["a carry-over that is an array", { ...SPLIT_BODY, carryOver: [] }],
    [
      "an unknown carry-over key",
      { ...SPLIT_BODY, carryOver: { ...CARRY, extra: 1 } },
    ],
    [
      "annotation ids that are not strings",
      { ...SPLIT_BODY, carryOver: { ...CARRY, annotationIds: [1] } },
    ],
    [
      "fields that are not strings",
      { ...SPLIT_BODY, carryOver: { ...CARRY, fields: [{}] } },
    ],
    [
      "a name that is not a string",
      { ...SPLIT_BODY, carryOver: { ...CARRY, newName: 5 } },
    ],
    [
      "a name over the bound",
      { ...SPLIT_BODY, carryOver: { ...CARRY, newName: "x".repeat(1001) } },
    ],
  ])("returns the fixed 400 for %s", async (_n, body) => {
    const res = await splitPost(send(SPLIT_URL, body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: SPLIT_INVALID_REQUEST_MESSAGE });
    expect(applySplit).not.toHaveBeenCalled();
  });

  it("returns an index failure as success with its failures and text", async () => {
    const result = {
      ...APPLIED,
      outcome: "index-failed" as const,
      failures: [{ documentId: NEW_ID, step: "inverted-index" as const }],
      message: "text",
    };
    vi.mocked(applySplit).mockResolvedValueOnce(result);
    const res = await splitPost(send(SPLIT_URL, SPLIT_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(result);
  });

  it("returns a refusal with its reason, stale included", async () => {
    for (const reason of [
      SPLIT_REFUSAL_REASONS.staleCursor,
      SPLIT_REFUSAL_REASONS.mergedDocument,
    ]) {
      vi.mocked(applySplit).mockResolvedValueOnce({
        outcome: "refused",
        reason,
      });
      const res = await splitPost(send(SPLIT_URL, SPLIT_BODY));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ outcome: "refused", reason });
    }
  });

  it("returns a failed outcome with the step and the state that remains", async () => {
    const failed = {
      outcome: "failed" as const,
      failedStep: "truncate" as const,
      remainingState: "original-truncated" as const,
      cause: "Error",
    };
    vi.mocked(applySplit).mockResolvedValueOnce(failed);
    const res = await splitPost(send(SPLIT_URL, SPLIT_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(failed);
  });

  it("maps a root that is not absolute to a failed outcome naming that nothing changed", async () => {
    vi.mocked(applySplit).mockRejectedValueOnce(new SplitLockKeyError());
    const res = await splitPost(send(SPLIT_URL, SPLIT_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcome: "failed",
      failedStep: "lock-original",
      remainingState: "original-restored",
      cause: "SplitLockKeyError",
    });
  });
});

describe("hosted tenancy (cores faked over the request's storage context)", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReturnValue(true);
    // The fake writes where a real core resolves its project: under the
    // projects dir of the storage context the route established.
    vi.mocked(applySplit).mockImplementation(async (projectId: string) => {
      const dir = path.join(resolveProjectsDir(), projectId);
      await fs.stat(dir);
      await fs.writeFile(path.join(dir, "split-marker"), "written");
      return APPLIED;
    });
    vi.mocked(previewSplit).mockImplementation(async (projectId: string) => {
      await fs.stat(path.join(resolveProjectsDir(), projectId));
      return PREVIEW;
    });
  });

  async function seedProject(root: string): Promise<string> {
    const dir = path.join(root, PROJECT);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  it("a split writes only into the signed-in tenant's project", async () => {
    const tenantA = await tmp("gw-split-a-");
    const tenantB = await tmp("gw-split-b-");
    const dirA = await seedProject(tenantA);
    const dirB = await seedProject(tenantB);
    tenantState.root = tenantB;
    const res = await splitPost(
      send(SPLIT_URL, SPLIT_BODY, { origin: ORIGIN }),
    );
    expect(res.status).toBe(200);
    expect(await fs.readdir(dirB)).toEqual(["split-marker"]);
    expect(await fs.readdir(dirA)).toEqual([]);
  });

  it("a tenant with no such project writes nothing, and tenant A's project is untouched", async () => {
    const tenantA = await tmp("gw-split-a-");
    const tenantB = await tmp("gw-split-b-");
    const dirA = await seedProject(tenantA);
    tenantState.root = tenantB;
    const outcome = await splitPost(
      send(SPLIT_URL, SPLIT_BODY, { origin: ORIGIN }),
    ).then(
      (res: Response) => ({ status: res.status }),
      () => ({ status: 0 }),
    );
    expect(outcome.status === 0 || outcome.status >= 400).toBe(true);
    expect(await fs.readdir(dirA)).toEqual([]);
    expect(await fs.readdir(tenantB)).toEqual([]);
  });

  it("a preview reads only the signed-in tenant's project", async () => {
    tenantState.root = await tmp("gw-split-b-");
    const outcome = await previewPost(
      send(PREVIEW_URL, PREVIEW_BODY, { origin: ORIGIN }),
    ).then(
      (res: Response) => ({ status: res.status }),
      () => ({ status: 0 }),
    );
    expect(outcome.status === 0 || outcome.status >= 400).toBe(true);
  });
});

describe("paired-device gate: classified as the capture and claims routes are", () => {
  const MACHINE: OwnMachine = {
    hostname: "test-machine",
    interfaces: {
      en0: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
    } as OwnMachine["interfaces"],
  };
  let sharingDir: string;

  beforeEach(async () => {
    sharingDir = await tmp("gw-split-gate-");
    vi.stubEnv("GETWRITE_SHARING", "1");
    vi.stubEnv("GETWRITE_SHARING_DIR", sharingDir);
    vi.stubEnv("GETWRITE_WINDOW_SECRET", "w".repeat(64));
    vi.stubEnv("PORT", "3000");
  });
  afterEach(() => vi.unstubAllEnvs());

  function gateRequest(
    pathname: string,
    headers: Record<string, string>,
  ): NextRequest {
    const host = "10.0.0.5:3000";
    return new NextRequest(`http://${host}${pathname}`, {
      method: "POST",
      headers: { host, origin: `http://${host}`, ...headers },
    });
  }

  const passes = (res: NextResponse): boolean =>
    res.headers.get("x-middleware-next") === "1";

  it.each([["/api/project/split/preview"], ["/api/project/split"]])(
    "%s: a paired device passes as for /api/project/capture, an unpaired one is refused",
    async (route) => {
      const { token, device } = mintCredential("Device");
      await addDevice(sharingDir, device);
      const cookie = { cookie: `${DEVICE_COOKIE}=${token}` };
      for (const target of [route, "/api/project/capture"]) {
        const paired = await runGate(
          gateRequest(target, cookie),
          process.env,
          MACHINE,
        );
        expect(passes(paired), `${target} paired`).toBe(true);
        const unpaired = await runGate(
          gateRequest(target, {}),
          process.env,
          MACHINE,
        );
        expect(passes(unpaired), `${target} unpaired`).toBe(false);
        expect([401, 403, 302, 303, 307]).toContain(unpaired.status);
      }
    },
  );
});
