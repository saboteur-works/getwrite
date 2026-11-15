/**
 * Feature 116 Task 29 (FR-15, FR-21, FR-22): `POST /api/citations/check` and
 * its client. The pre-run check core is faked, so the route tests are
 * evidence about the route only, not about the core or a real hosted tenant.
 * The paired-device case records that the route is classified as every other
 * `/api` route is: a paired device passes, an unpaired one is refused.
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
vi.mock("../../src/lib/models/citations-precheck-core", async (orig) => ({
  ...(await orig<
    typeof import("../../src/lib/models/citations-precheck-core")
  >()),
  checkCitationsCore: vi.fn(),
}));

import * as routeModule from "../../app/api/citations/check/route";
import { POST } from "../../app/api/citations/check/route";
import {
  checkCitationsCore,
  CitationCheckProjectNotFoundError,
  InvalidCitationCheckResourceIdError,
  InvalidProjectIdCoreError,
} from "../../src/lib/models/citations-precheck-core";
import type { CitationCheckResult } from "../../src/lib/models/citations-types";
import {
  MissingProjectKeyError,
  ProjectLockedError,
  isLockedAccessError,
} from "../../src/lib/models/locked-access";
import { resolveProjectsDir } from "../../src/lib/models/projects-dir";
import { checkCitations } from "../../src/lib/api/citations-check";
import { runGate } from "../../src/lib/sharing/gate";
import type { OwnMachine } from "../../src/lib/sharing/host-allowlist";
import { DEVICE_COOKIE } from "../../src/lib/sharing/classify-request";
import {
  addDevice,
  mintCredential,
} from "../../src/lib/sharing/credential-store";
import { removeDirRetry } from "./helpers/fs-utils";

const URL_BASE = "http://localhost/api/citations/check";
const ORIGIN = "https://app.getwrite.example";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "22222222-2222-4222-8222-222222222222";
const dirs: string[] = [];
let savedAuthUrl: string | undefined;

const OK_RESULT: CitationCheckResult = {
  status: "ok",
  gaps: [
    {
      kind: "source-removed",
      resourceId: RESOURCE,
      sourceId: "33333333-3333-4333-8333-333333333333",
    },
  ],
  citationCount: 1,
  incompleteSourceCount: 1,
};
const FAILED_RESULT: CitationCheckResult = {
  status: "failed",
  failure: "read-failed",
  message: "The citations could not be read.",
};
const BODY = { projectId: PROJECT, resourceIds: [RESOURCE] };

beforeEach(() => {
  savedAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = ORIGIN;
  isHostedAuthActiveMock.mockReturnValue(false);
  vi.mocked(checkCitationsCore).mockResolvedValue(OK_RESULT);
});

afterEach(async () => {
  vi.mocked(checkCitationsCore).mockReset();
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
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
}

describe("route surface", () => {
  it("exports POST only", () => {
    expect(
      Object.keys(routeModule)
        .filter((k) => /^[A-Z]+$/.test(k))
        .sort(),
    ).toEqual(["POST"]);
  });

  it("imports no lib/sharing module and adds no limit check", async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, "../../app/api/citations/check/route.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /checkLimit|limits-check|refusalFor|lib\/sharing/,
    );
  });
});

describe("POST /api/citations/check", () => {
  it("passes the ids to the core and returns the grouped result", async () => {
    const res = await POST(send(BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(OK_RESULT);
    expect(checkCitationsCore).toHaveBeenCalledWith(PROJECT, [RESOURCE], {
      missingDetails: expect.any(Function),
    });
  });

  it("reports a citation whose Source lacks a required detail (Task 59, FR-15)", async () => {
    const SOURCE = "33333333-3333-4333-8333-333333333333";
    // The fake core applies the missing-detail test the route hands it, as the
    // real core does for each cited Source, here one with no citation fields.
    vi.mocked(checkCitationsCore).mockImplementationOnce(
      async (_projectId, resourceIds, options) => {
        const missing =
          options?.missingDetails?.(null, {
            resourceId: resourceIds[0],
            sourceId: SOURCE,
          } as never) ?? [];
        return {
          status: "ok",
          gaps:
            missing.length > 0
              ? [
                  {
                    kind: "missing-detail",
                    resourceId: resourceIds[0],
                    sourceId: SOURCE,
                    sourceName: "Ledger",
                    missingDetails: missing,
                  },
                ]
              : [],
          citationCount: missing.length > 0 ? 1 : 0,
          incompleteSourceCount: missing.length > 0 ? 1 : 0,
        };
      },
    );
    const res = await POST(send(BODY));
    expect(res.status).toBe(200);
    const json = (await res.json()) as Extract<
      CitationCheckResult,
      { status: "ok" }
    >;
    expect(json.gaps).toHaveLength(1);
    expect(json.gaps[0]).toMatchObject({
      kind: "missing-detail",
      resourceId: RESOURCE,
      sourceId: SOURCE,
    });
    expect(json.gaps[0].missingDetails).toEqual(
      expect.arrayContaining(["Authors", "Date"]),
    );
  });

  it("returns a failed result as a distinct failed body, never as ok", async () => {
    vi.mocked(checkCitationsCore).mockResolvedValueOnce(FAILED_RESULT);
    const res = await POST(send(BODY));
    expect(res.status).toBe(200);
    const json = (await res.json()) as CitationCheckResult;
    expect(json).toEqual(FAILED_RESULT);
    expect(json).not.toHaveProperty("gaps");
  });

  it.each([
    ["invalid JSON", "{ not json"],
    ["an array body", []],
    ["a path key", { ...BODY, path: "/etc/passwd" }],
    ["resourceIds not an array", { ...BODY, resourceIds: "x" }],
    ["no resourceIds", { projectId: PROJECT }],
    ["a non-string id", { ...BODY, resourceIds: [1] }],
    ["no projectId", { resourceIds: [RESOURCE] }],
  ])(
    "returns 400 for %s, before the core runs and without echoing input",
    async (_n, body) => {
      const res = await POST(send(body));
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).not.toContain("/etc/passwd");
      expect(checkCitationsCore).not.toHaveBeenCalled();
    },
  );

  it("maps a malformed project id to 400 without echoing it", async () => {
    vi.mocked(checkCitationsCore).mockRejectedValueOnce(
      new InvalidProjectIdCoreError("../SECRET"),
    );
    const res = await POST(send({ ...BODY, projectId: "../SECRET" }));
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("SECRET");
  });

  it("maps a malformed resource id to 400 without echoing it", async () => {
    vi.mocked(checkCitationsCore).mockRejectedValueOnce(
      new InvalidCitationCheckResourceIdError(),
    );
    const res = await POST(send({ ...BODY, resourceIds: ["SECRET-id"] }));
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("SECRET");
  });

  it("maps an unknown project to 404", async () => {
    vi.mocked(checkCitationsCore).mockRejectedValueOnce(
      new CitationCheckProjectNotFoundError(),
    );
    expect((await POST(send(BODY))).status).toBe(404);
  });

  it("fails closed on a locked project with the existing locked responses", async () => {
    vi.mocked(checkCitationsCore).mockRejectedValueOnce(
      new ProjectLockedError(PROJECT),
    );
    expect((await POST(send(BODY))).status).toBe(401);
    vi.mocked(checkCitationsCore).mockRejectedValueOnce(
      new MissingProjectKeyError(PROJECT),
    );
    expect((await POST(send(BODY))).status).toBe(409);
  });

  it("does not turn an unexpected core failure into an ok result", async () => {
    vi.mocked(checkCitationsCore).mockRejectedValueOnce(new Error("disk"));
    await expect(POST(send(BODY))).rejects.toThrow("disk");
  });
});

describe("hosted tenancy (core faked over the request's storage context)", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReturnValue(true);
    // The fake reads the projects dir as a real core does, so what it sees is
    // decided by the storage context the route established.
    vi.mocked(checkCitationsCore).mockImplementation(
      async (projectId: string) => {
        const file = path.join(resolveProjectsDir(), projectId, "check.json");
        return JSON.parse(
          await fs.readFile(file, "utf8"),
        ) as CitationCheckResult;
      },
    );
  });

  async function seed(root: string, result: unknown): Promise<void> {
    await fs.mkdir(path.join(root, PROJECT), { recursive: true });
    await fs.writeFile(
      path.join(root, PROJECT, "check.json"),
      JSON.stringify(result),
    );
  }

  it("reads the signed-in tenant's own project", async () => {
    tenantState.root = await tmp("gw-cite-a-");
    await seed(tenantState.root, OK_RESULT);
    const res = await POST(send(BODY, { origin: ORIGIN }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(OK_RESULT);
  });

  it("shows tenant B nothing of tenant A's project", async () => {
    const tenantA = await tmp("gw-cite-a-");
    const tenantB = await tmp("gw-cite-b-");
    await seed(tenantA, { ...OK_RESULT, gaps: [{ sourceName: "A-only" }] });
    tenantState.root = tenantB;
    const outcome = await POST(send(BODY, { origin: ORIGIN })).then(
      async (res: Response) => ({ status: res.status, text: await res.text() }),
      () => ({ status: 0, text: "" }),
    );
    expect(outcome.text).not.toContain("A-only");
    expect(outcome.status === 0 || outcome.status >= 400).toBe(true);
  });

  it("refuses a cross-site write before the core runs", async () => {
    tenantState.root = await tmp("gw-cite-a-");
    const res = await POST(send(BODY, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(checkCitationsCore).not.toHaveBeenCalled();
  });
});

describe("paired-device gate: classified as /api/annotations is", () => {
  const MACHINE: OwnMachine = {
    hostname: "test-machine",
    interfaces: {
      en0: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
    } as OwnMachine["interfaces"],
  };
  let sharingDir: string;

  beforeEach(async () => {
    sharingDir = await tmp("gw-cite-gate-");
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

  it("a paired device passes, an unpaired one is refused, as for annotations", async () => {
    const { token, device } = mintCredential("Device");
    await addDevice(sharingDir, device);
    const cookie = { cookie: `${DEVICE_COOKIE}=${token}` };
    for (const route of ["/api/citations/check", "/api/annotations"]) {
      const paired = await runGate(
        gateRequest(route, cookie),
        process.env,
        MACHINE,
      );
      expect(passes(paired), `${route} paired`).toBe(true);
      const unpaired = await runGate(
        gateRequest(route, {}),
        process.env,
        MACHINE,
      );
      expect(passes(unpaired), `${route} unpaired`).toBe(false);
      expect([401, 403, 302, 303, 307]).toContain(unpaired.status);
    }
  });
});

describe("client checkCitations", () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal("fetch", fetchMock));
  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  function respond(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status });
  }

  it("posts the ids only and resolves the ok result", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, OK_RESULT));
    expect(await checkCitations(PROJECT, [RESOURCE])).toEqual(OK_RESULT);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/citations/check");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(BODY);
  });

  it("resolves a failed result from the server as failed", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, FAILED_RESULT));
    expect(await checkCitations(PROJECT, [RESOURCE])).toEqual(FAILED_RESULT);
  });

  it("maps a thrown fetch to a failed result, never no gaps", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    const result = await checkCitations(PROJECT, [RESOURCE]);
    expect(result.status).toBe("failed");
    expect(result).not.toHaveProperty("gaps");
  });

  it("maps a non-ok response to a failed result", async () => {
    fetchMock.mockResolvedValueOnce(respond(500, { error: "boom" }));
    const result = await checkCitations(PROJECT, [RESOURCE]);
    expect(result.status).toBe("failed");
  });

  it("maps a malformed 200 body to a failed result", async () => {
    fetchMock.mockResolvedValueOnce(respond(200, { status: "ok" }));
    const result = await checkCitations(PROJECT, [RESOURCE]);
    expect(result.status).toBe("failed");
  });

  it.each([[401], [409]])(
    "rethrows the locked-access error for HTTP %i",
    async (status) => {
      fetchMock.mockResolvedValueOnce(respond(status, { error: "locked" }));
      const err = await checkCitations(PROJECT, [RESOURCE]).then(
        () => null,
        (e: unknown) => e,
      );
      expect(isLockedAccessError(err)).toBe(true);
    },
  );
});
