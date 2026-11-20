/**
 * Feature 121 Task 32 (FR-15): `POST /api/project/merge/preview` and
 * `POST /api/project/merge`. The two cores are faked by their Task 24 and
 * Task 25 signatures for the route-boundary tests, so those are evidence about
 * the routes only: not about the cores, a real paired client or a deployed
 * hosted service. One block runs the real cores over a real project directory
 * with the stored read made to raise the locked error. `resolveTenant` and
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
vi.mock("../../src/lib/models/merge-preview-core", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../../src/lib/models/merge-preview-core")
  >()),
  previewMerge: vi.fn(),
}));
vi.mock("../../src/lib/models/merge-core", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/models/merge-core")>()),
  applyMerge: vi.fn(),
}));

import * as previewRouteModule from "../../app/api/project/merge/preview/route";
import { POST as previewPost } from "../../app/api/project/merge/preview/route";
import * as mergeRouteModule from "../../app/api/project/merge/route";
import { POST as mergePost } from "../../app/api/project/merge/route";
import {
  MERGE_INVALID_REQUEST_MESSAGE,
  MERGE_REQUEST_LIMITS,
} from "../../src/lib/api/merge";
import { InvalidProjectIdCoreError } from "../../src/lib/models/inbox-capture-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { applyMerge } from "../../src/lib/models/merge-core";
import { MERGE_DOCUMENT_CAP } from "../../src/lib/models/merge-limits";
import {
  previewMerge,
  type MergePreviewResult,
} from "../../src/lib/models/merge-preview-core";
import { MERGE_REFUSAL_REASONS } from "../../src/lib/models/merge-types";
import { resolveProjectsDir } from "../../src/lib/models/projects-dir";
import * as sidecarModule from "../../src/lib/models/sidecar";
import * as revisionCore from "../../src/lib/models/revision-core";
import { SplitLockKeyError } from "../../src/lib/models/split-preview-core";
import { runGate } from "../../src/lib/sharing/gate";
import type { OwnMachine } from "../../src/lib/sharing/host-allowlist";
import { DEVICE_COOKIE } from "../../src/lib/sharing/classify-request";
import {
  addDevice,
  mintCredential,
} from "../../src/lib/sharing/credential-store";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { listRevisions } from "../../src/lib/models/revision";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";

const PREVIEW_URL = "http://localhost/api/project/merge/preview";
const MERGE_URL = "http://localhost/api/project/merge";
const ORIGIN = "https://app.getwrite.example";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";
const REV = "34205ec3-fe37-41ee-96f9-e331e95e5475";
const HASH = "b".repeat(64);
const dirs: string[] = [];
let savedAuthUrl: string | undefined;

const doc = (id: string, revisionId: string = REV): Record<string, string> => ({
  resourceId: id,
  revisionId,
  contentHash: HASH,
});
const DOCUMENTS = [doc(T), doc(A)];
const CARRY = {
  annotationIds: ["a1"],
  fields: [{ field: "status", sourceDocumentId: A }],
  unitedMultiselectFields: [],
};
const PREVIEW_BODY = { projectId: PROJECT, documents: DOCUMENTS };
const MERGE_BODY = { ...PREVIEW_BODY, carryOver: CARRY };
const PREVIEW: MergePreviewResult = {
  outcome: "preview",
  target: { documentId: T, name: "T", folderPath: [], words: 2 },
  absorbed: [
    { documentId: A, name: "A", folderPath: [], words: 3, rules: ["r"] },
  ],
  annotations: [{ documentId: A, notes: [], citations: [], claims: [] }],
  metadata: [],
  warnings: [],
};
const APPLIED = {
  outcome: "applied" as const,
  targetDocumentId: T,
  absorbedDocumentIds: [A],
  notices: [],
};

beforeEach(() => {
  savedAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = ORIGIN;
  isHostedAuthActiveMock.mockReturnValue(false);
  vi.mocked(previewMerge).mockResolvedValue(PREVIEW);
  vi.mocked(applyMerge).mockResolvedValue(APPLIED);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(previewMerge).mockReset();
  vi.mocked(applyMerge).mockReset();
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
  ["preview", PREVIEW_URL, previewPost, PREVIEW_BODY, previewMerge],
  ["merge", MERGE_URL, mergePost, MERGE_BODY, applyMerge],
] as const;

describe("route surface", () => {
  it("each route exports POST only", () => {
    for (const mod of [previewRouteModule, mergeRouteModule]) {
      expect(
        Object.keys(mod)
          .filter((k) => /^[A-Z]+$/.test(k))
          .sort(),
      ).toEqual(["POST"]);
    }
  });

  it("neither route imports lib/sharing or applies a paired-device limit, and both run in withStorageContext", async () => {
    for (const file of [
      "../../app/api/project/merge/preview/route.ts",
      "../../app/api/project/merge/route.ts",
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
      ["no documents", { ...ok, documents: [] }],
      ["documents that are not a list", { ...ok, documents: "SECRET" }],
      [
        "a malformed resource id",
        { ...ok, documents: [{ ...doc(T), resourceId: "../SECRET" }] },
      ],
      [
        "a hash that is not hex",
        { ...ok, documents: [{ ...doc(T), contentHash: "SECRET" }] },
      ],
      [
        "a folder-name style revision id",
        { ...ok, documents: [{ ...doc(T), revisionId: "v-1" }] },
      ],
      [
        "an unknown key on a document",
        { ...ok, documents: [{ ...doc(T), extra: 1 }] },
      ],
      [
        "an unbounded list",
        {
          ...ok,
          documents: Array.from(
            { length: MERGE_REQUEST_LIMITS.maxDocuments + 1 },
            () => doc(T),
          ),
        },
      ],
    ])(
      "returns 400 with one fixed text for %s, before the core runs, echoing nothing",
      async (_label, body) => {
        const res = await post(send(url, body));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({
          error: MERGE_INVALID_REQUEST_MESSAGE,
        });
        expect(core).not.toHaveBeenCalled();
      },
    );

    it("maps a project id the core refuses to the same fixed text", async () => {
      vi.mocked(core as typeof previewMerge).mockRejectedValueOnce(
        new InvalidProjectIdCoreError("../SECRET"),
      );
      const res = await post(send(url, ok));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: MERGE_INVALID_REQUEST_MESSAGE,
      });
    });

    it("maps a locked project to the existing 401 and 409 responses", async () => {
      vi.mocked(core as typeof previewMerge).mockRejectedValueOnce(
        new ProjectLockedError(PROJECT),
      );
      expect((await post(send(url, ok))).status).toBe(401);
      vi.mocked(core as typeof previewMerge).mockRejectedValueOnce(
        new MissingProjectKeyError(PROJECT),
      );
      expect((await post(send(url, ok))).status).toBe(409);
    });

    it("does not turn an unexpected core failure into a result body", async () => {
      vi.mocked(core as typeof previewMerge).mockRejectedValueOnce(
        new Error("disk"),
      );
      await expect(post(send(url, ok))).rejects.toThrow("disk");
    });

    it("refuses a count over the cap with the too-many-documents reason, before the core runs", async () => {
      const over = Array.from({ length: MERGE_DOCUMENT_CAP + 1 }, () => doc(T));
      const res = await post(send(url, { ...ok, documents: over }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        outcome: "refused",
        reason: MERGE_REFUSAL_REASONS.tooManyDocuments,
        documentId: null,
      });
      expect(core).not.toHaveBeenCalled();
    });

    it("passes a count of exactly the cap to the core", async () => {
      const exact = Array.from({ length: MERGE_DOCUMENT_CAP }, () => doc(T));
      await post(send(url, { ...ok, documents: exact }));
      expect(core).toHaveBeenCalledTimes(1);
    });

    it("refuses a cross-site request on hosted web before the core runs", async () => {
      isHostedAuthActiveMock.mockReturnValue(true);
      tenantState.root = await tmp("gw-merge-csrf-");
      const res = await post(send(url, ok, { origin: "https://evil.example" }));
      expect(res.status).toBe(403);
      expect(core).not.toHaveBeenCalled();
    });
  },
);

describe("preview route", () => {
  it("passes the project id and the documents, and only those, to the core", async () => {
    const res = await previewPost(send(PREVIEW_URL, PREVIEW_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(PREVIEW);
    expect(previewMerge).toHaveBeenCalledWith(PROJECT, {
      documents: DOCUMENTS,
    });
  });

  it("returns a refusal with its reason and the document it names, stale included", async () => {
    for (const reason of [
      MERGE_REFUSAL_REASONS.staleContent,
      MERGE_REFUSAL_REASONS.folder,
    ]) {
      const refused = {
        outcome: "refused" as const,
        reason,
        documentId: A,
        message: "text",
      };
      vi.mocked(previewMerge).mockResolvedValueOnce(refused);
      const res = await previewPost(send(PREVIEW_URL, PREVIEW_BODY));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(refused);
    }
  });

  it("returns a failed outcome as failed, never as a preview", async () => {
    vi.mocked(previewMerge).mockResolvedValueOnce({
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
    vi.mocked(previewMerge).mockRejectedValueOnce(new SplitLockKeyError());
    const res = await previewPost(send(PREVIEW_URL, PREVIEW_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcome: "failed",
      cause: "project-root-not-absolute",
    });
  });
});

describe("merge route", () => {
  it("passes the project id, the documents and the carry-over, and only those, to the core", async () => {
    const res = await mergePost(send(MERGE_URL, MERGE_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(APPLIED);
    expect(applyMerge).toHaveBeenCalledWith(PROJECT, {
      documents: DOCUMENTS,
      carryOver: CARRY,
    });
  });

  it.each([
    ["no carry-over", { ...PREVIEW_BODY }],
    ["a carry-over that is an array", { ...MERGE_BODY, carryOver: [] }],
    [
      "an unknown carry-over key",
      { ...MERGE_BODY, carryOver: { ...CARRY, extra: 1 } },
    ],
    [
      "annotation ids that are not strings",
      { ...MERGE_BODY, carryOver: { ...CARRY, annotationIds: [1] } },
    ],
    [
      "a field source that is not an id",
      {
        ...MERGE_BODY,
        carryOver: {
          ...CARRY,
          fields: [{ field: "status", sourceDocumentId: "../x" }],
        },
      },
    ],
    [
      "united fields that are not strings",
      { ...MERGE_BODY, carryOver: { ...CARRY, unitedMultiselectFields: [{}] } },
    ],
  ])("returns the fixed 400 for %s", async (_n, body) => {
    const res = await mergePost(send(MERGE_URL, body));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: MERGE_INVALID_REQUEST_MESSAGE });
    expect(applyMerge).not.toHaveBeenCalled();
  });

  it("returns every typed outcome of the core unchanged", async () => {
    const outcomes = [
      {
        ...APPLIED,
        outcome: "index-failed" as const,
        failures: [{ documentId: T, step: "backlinks" as const }],
        message: "text",
      },
      {
        outcome: "refused" as const,
        reason: MERGE_REFUSAL_REASONS.staleContent,
        documentId: A,
      },
      {
        outcome: "refused" as const,
        reason: MERGE_REFUSAL_REASONS.mergedAbsorbed,
        documentId: A,
      },
      {
        outcome: "refused" as const,
        reason: MERGE_REFUSAL_REASONS.annotationLimit,
        documentId: null,
        annotationCounts: { existing: 499, incoming: 2, limit: 500 },
      },
      {
        outcome: "failed" as const,
        failedStep: "append-to-target" as const,
        remainingState: "partially-written" as const,
        cause: "Error",
      },
    ];
    for (const outcome of outcomes) {
      vi.mocked(applyMerge).mockResolvedValueOnce(outcome);
      const res = await mergePost(send(MERGE_URL, MERGE_BODY));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(outcome);
    }
  });

  it("maps a root that is not absolute to a failed outcome naming that nothing changed", async () => {
    vi.mocked(applyMerge).mockRejectedValueOnce(new SplitLockKeyError());
    const res = await mergePost(send(MERGE_URL, MERGE_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      outcome: "failed",
      failedStep: "lock-documents",
      remainingState: "documents-restored",
      cause: "SplitLockKeyError",
    });
  });
});

describe("hosted tenancy (cores faked over the request's storage context)", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReturnValue(true);
    // The fake writes where a real core resolves its project: under the
    // projects dir of the storage context the route established.
    vi.mocked(applyMerge).mockImplementation(async (projectId: string) => {
      const dir = path.join(resolveProjectsDir(), projectId);
      await fs.stat(dir);
      await fs.writeFile(path.join(dir, "merge-marker"), "written");
      return APPLIED;
    });
    vi.mocked(previewMerge).mockImplementation(async (projectId: string) => {
      await fs.stat(path.join(resolveProjectsDir(), projectId));
      return PREVIEW;
    });
  });

  async function seedProject(root: string): Promise<string> {
    const dir = path.join(root, PROJECT);
    await fs.mkdir(dir, { recursive: true });
    return dir;
  }

  it("a merge writes only into the signed-in tenant's project", async () => {
    const tenantA = await tmp("gw-merge-a-");
    const tenantB = await tmp("gw-merge-b-");
    const dirA = await seedProject(tenantA);
    const dirB = await seedProject(tenantB);
    tenantState.root = tenantB;
    const res = await mergePost(
      send(MERGE_URL, MERGE_BODY, { origin: ORIGIN }),
    );
    expect(res.status).toBe(200);
    expect(await fs.readdir(dirB)).toEqual(["merge-marker"]);
    expect(await fs.readdir(dirA)).toEqual([]);
  });

  it("a tenant with no such project writes nothing, and tenant A's project is untouched", async () => {
    const tenantA = await tmp("gw-merge-a-");
    const tenantB = await tmp("gw-merge-b-");
    const dirA = await seedProject(tenantA);
    tenantState.root = tenantB;
    const outcome = await mergePost(
      send(MERGE_URL, MERGE_BODY, { origin: ORIGIN }),
    ).then(
      (res: Response) => ({ status: res.status }),
      () => ({ status: 0 }),
    );
    expect(outcome.status === 0 || outcome.status >= 400).toBe(true);
    expect(await fs.readdir(dirA)).toEqual([]);
    expect(await fs.readdir(tenantB)).toEqual([]);
  });

  it("a preview reads only the signed-in tenant's project", async () => {
    tenantState.root = await tmp("gw-merge-b-");
    const outcome = await previewPost(
      send(PREVIEW_URL, PREVIEW_BODY, { origin: ORIGIN }),
    ).then(
      (res: Response) => ({ status: res.status }),
      () => ({ status: 0 }),
    );
    expect(outcome.status === 0 || outcome.status >= 400).toBe(true);
  });
});

describe("a locked project (real cores, the stored read raising the locked error)", () => {
  let tenantRoot: string;
  let previousProjectsDir: string | undefined;

  beforeEach(async () => {
    isHostedAuthActiveMock.mockReturnValue(true);
    tenantRoot = await tmp("gw-merge-locked-");
    tenantState.root = tenantRoot;
    previousProjectsDir = process.env.GETWRITE_PROJECTS_DIR;
    const actualPreview = await vi.importActual<
      typeof import("../../src/lib/models/merge-preview-core")
    >("../../src/lib/models/merge-preview-core");
    const actualCore = await vi.importActual<
      typeof import("../../src/lib/models/merge-core")
    >("../../src/lib/models/merge-core");
    vi.mocked(previewMerge).mockImplementation(actualPreview.previewMerge);
    vi.mocked(applyMerge).mockImplementation(actualCore.applyMerge);
  });
  afterEach(() => {
    if (previousProjectsDir === undefined)
      delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousProjectsDir;
  });

  const NOVEL_SPEC = path.join(
    process.cwd(),
    "..",
    "specs",
    "002-define-data-models",
    "project-types",
    "novel_project_type.json",
  );

  /** A project with two real text documents, so the request reaches the stored read. */
  async function seed(): Promise<{
    projectId: string;
    documents: Record<string, string>[];
  }> {
    process.env.GETWRITE_PROJECTS_DIR = tenantRoot;
    await createAndAssertProject(NOVEL_SPEC, {
      projectRoot: path.join(tenantRoot, PROJECT),
      name: "Locked",
    });
    const documents: Record<string, string>[] = [];
    for (const name of ["First", "Second"]) {
      const created = await createResourceCore(PROJECT, {
        name,
        type: "text",
        text: { tiptap: { type: "doc", content: [] } },
      });
      const canonical = (
        await listRevisions(path.join(tenantRoot, PROJECT), created.id)
      ).find((r) => r.isCanonical);
      documents.push(doc(created.id, canonical?.id ?? REV));
    }
    return { projectId: PROJECT, documents };
  }

  it.each([
    ["the sidecar read", () => vi.spyOn(sidecarModule, "readSidecar")],
    ["the stored text read", () => vi.spyOn(revisionCore, "readRevision")],
  ])(
    "preview and merge answer 401 and write nothing when %s raises the locked error",
    async (_label, spy) => {
      const { projectId, documents } = await seed();
      const write = vi.spyOn(revisionCore, "createRevision");
      const mutate = vi.spyOn(sidecarModule, "mutateSidecar");
      spy().mockRejectedValue(new ProjectLockedError(projectId));
      const body = { projectId, documents };
      const preview = await previewPost(
        send(PREVIEW_URL, body, { origin: ORIGIN }),
      );
      expect(preview.status).toBe(401);
      const merge = await mergePost(
        send(MERGE_URL, { ...body, carryOver: CARRY }, { origin: ORIGIN }),
      );
      expect(merge.status).toBe(401);
      expect(write).not.toHaveBeenCalled();
      expect(mutate).not.toHaveBeenCalled();
    },
  );
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
    sharingDir = await tmp("gw-merge-gate-");
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

  it.each([["/api/project/merge/preview"], ["/api/project/merge"]])(
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
