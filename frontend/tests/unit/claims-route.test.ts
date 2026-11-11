/**
 * Feature 108 Task 15 (FR-21, FR-17): `/api/claims` (GET list, POST create,
 * PUT update-claim). The three claim cores are mocked by their Task 2
 * signatures, so these tests are evidence about the route only: not about the
 * cores, a real hosted tenant, or a real paired client.
 * `resolveTenant` and `isHostedAuthActive` are mocked so one tenant can be
 * played against another, as in `inbox-capture-route.test.ts`.
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
vi.mock("../../src/lib/models/claims-add-core", () => ({
  addClaimCore: vi.fn(),
}));
vi.mock("../../src/lib/models/claims-update-core", () => ({
  updateClaimCore: vi.fn(),
}));
vi.mock("../../src/lib/models/claims-list-core", () => ({
  listClaimsCore: vi.fn(),
}));

import * as routeModule from "../../app/api/claims/route";
import { GET, POST, PUT } from "../../app/api/claims/route";
import { addClaimCore } from "../../src/lib/models/claims-add-core";
import { updateClaimCore } from "../../src/lib/models/claims-update-core";
import { listClaimsCore } from "../../src/lib/models/claims-list-core";
import {
  AnnotationNotFoundError,
  AnnotationResourceNotFoundError,
  InvalidAnnotationError,
  InvalidProjectIdCoreError,
} from "../../src/lib/models/annotations-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { resolveProjectsDir } from "../../src/lib/models/projects-dir";
import type { Annotation } from "../../src/lib/models/types";
import type { ClaimListResult } from "../../src/lib/models/claim-types";
import { runGate } from "../../src/lib/sharing/gate";
import type { OwnMachine } from "../../src/lib/sharing/host-allowlist";
import { DEVICE_COOKIE } from "../../src/lib/sharing/classify-request";
import {
  addDevice,
  mintCredential,
} from "../../src/lib/sharing/credential-store";
import { removeDirRetry } from "./helpers/fs-utils";

const URL_BASE = "http://localhost/api/claims";
const ORIGIN = "https://app.getwrite.example";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "22222222-2222-4222-8222-222222222222";
const dirs: string[] = [];
let savedAuthUrl: string | undefined;

const STORED = {
  id: "a1",
  body: "Statement",
  quote: "quoted",
  claim: { status: "unverified", statusChangedAt: "2026-11-11T00:00:00.000Z" },
} as unknown as Annotation;
const EMPTY_LIST: ClaimListResult = { claims: [], failures: [] };

beforeEach(() => {
  savedAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = ORIGIN;
  isHostedAuthActiveMock.mockReturnValue(false);
  vi.mocked(addClaimCore).mockResolvedValue(STORED);
  vi.mocked(updateClaimCore).mockResolvedValue(STORED);
  vi.mocked(listClaimsCore).mockResolvedValue(EMPTY_LIST);
});

afterEach(async () => {
  vi.mocked(addClaimCore).mockReset();
  vi.mocked(updateClaimCore).mockReset();
  vi.mocked(listClaimsCore).mockReset();
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
  method: "POST" | "PUT",
  body: unknown,
  headers: Record<string, string> = {},
): never {
  return new Request(URL_BASE, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
}

function get(query: string, headers: Record<string, string> = {}): never {
  return new Request(`${URL_BASE}?${query}`, { headers }) as never;
}

const NEW_CLAIM = { id: "a1", statement: "Statement", quote: "quoted" };
const POST_BODY = {
  projectId: PROJECT,
  resourceId: RESOURCE,
  claim: NEW_CLAIM,
};

describe("route surface", () => {
  it("exports GET, POST and PUT only: claim delete stays DELETE /api/annotations", () => {
    expect(
      Object.keys(routeModule)
        .filter((k) => /^[A-Z]+$/.test(k))
        .sort(),
    ).toEqual(["GET", "POST", "PUT"]);
  });

  it("imports no lib/sharing module and adds no limit check", async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, "../../app/api/claims/route.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /checkLimit|limits-check|refusalFor|lib\/sharing/,
    );
  });
});

describe("GET /api/claims", () => {
  it("returns the core's list for the project id", async () => {
    const list: ClaimListResult = {
      claims: [{ resourceId: RESOURCE, resourceName: "R", annotation: STORED }],
      failures: [{ resourceId: "x", resourceName: "X", message: "unreadable" }],
    };
    vi.mocked(listClaimsCore).mockResolvedValueOnce(list);
    const res = await GET(get(`projectId=${PROJECT}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(list);
    expect(listClaimsCore).toHaveBeenCalledWith(PROJECT);
  });

  it("returns 400 for a path or any other query key, before the core runs", async () => {
    const res = await GET(get(`projectId=${PROJECT}&projectRoot=/etc`));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("/etc");
    expect(listClaimsCore).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed project id", async () => {
    vi.mocked(listClaimsCore).mockRejectedValueOnce(
      new InvalidProjectIdCoreError("../etc"),
    );
    const res = await GET(get("projectId=..%2Fetc"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid projectId" });
  });

  it("maps a locked project to the existing locked responses", async () => {
    vi.mocked(listClaimsCore).mockRejectedValueOnce(
      new ProjectLockedError(PROJECT),
    );
    expect((await GET(get(`projectId=${PROJECT}`))).status).toBe(401);
    vi.mocked(listClaimsCore).mockRejectedValueOnce(
      new MissingProjectKeyError(PROJECT),
    );
    expect((await GET(get(`projectId=${PROJECT}`))).status).toBe(409);
  });

  it("does not turn an unexpected core failure into an empty list", async () => {
    vi.mocked(listClaimsCore).mockRejectedValueOnce(new Error("disk"));
    await expect(GET(get(`projectId=${PROJECT}`))).rejects.toThrow("disk");
  });
});

describe("POST /api/claims", () => {
  it("passes the ids and the claim to the core and returns the stored annotation", async () => {
    const res = await POST(send("POST", POST_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ annotation: STORED });
    expect(addClaimCore).toHaveBeenCalledWith(PROJECT, RESOURCE, NEW_CLAIM);
  });

  it.each([
    ["invalid JSON", "{ not json"],
    ["an array body", []],
    [
      "an unknown top-level key (a path)",
      { ...POST_BODY, path: "/etc/passwd" },
    ],
    ["a claim that is not an object", { ...POST_BODY, claim: "x" }],
    ["no claim", { projectId: PROJECT, resourceId: RESOURCE }],
  ])(
    "returns 400 for %s, before the core runs and without echoing input",
    async (_n, body) => {
      const res = await POST(send("POST", body));
      expect(res.status).toBe(400);
      expect(JSON.stringify(await res.json())).not.toContain("/etc/passwd");
      expect(addClaimCore).not.toHaveBeenCalled();
    },
  );

  it("maps the core's refusals: 400 invalid, 404 unknown resource", async () => {
    vi.mocked(addClaimCore).mockRejectedValueOnce(
      new InvalidAnnotationError("The statement is too long."),
    );
    const bad = await POST(send("POST", POST_BODY));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: "The statement is too long." });
    vi.mocked(addClaimCore).mockRejectedValueOnce(
      new AnnotationResourceNotFoundError(),
    );
    expect((await POST(send("POST", POST_BODY))).status).toBe(404);
  });

  it("maps a locked project to the existing locked responses", async () => {
    vi.mocked(addClaimCore).mockRejectedValueOnce(
      new ProjectLockedError(PROJECT),
    );
    expect((await POST(send("POST", POST_BODY))).status).toBe(401);
  });
});

describe("PUT /api/claims", () => {
  const base = { projectId: PROJECT, resourceId: RESOURCE, annotationId: "a1" };

  it("passes the ids and the update to the core", async () => {
    const update = { status: "verified", target: null };
    const res = await PUT(send("PUT", { ...base, update }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ annotation: STORED });
    expect(updateClaimCore).toHaveBeenCalledWith(
      PROJECT,
      RESOURCE,
      "a1",
      update,
    );
  });

  it("returns 400 for a status off the list, without echoing it and before the core runs", async () => {
    const res = await PUT(
      send("PUT", { ...base, update: { status: "SECRET-<b>" } }),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("SECRET");
    expect(updateClaimCore).not.toHaveBeenCalled();
  });

  it.each([
    [
      "an unknown top-level key",
      { ...base, update: { status: "verified" }, path: "/x" },
    ],
    ["no update", base],
    ["an update that is an array", { ...base, update: [] }],
  ])("returns 400 for %s", async (_n, body) => {
    const res = await PUT(send("PUT", body));
    expect(res.status).toBe(400);
    expect(updateClaimCore).not.toHaveBeenCalled();
  });

  it("maps 404 for an unknown annotation and 400 for the core's refusal", async () => {
    const body = { ...base, update: { statement: "s" } };
    vi.mocked(updateClaimCore).mockRejectedValueOnce(
      new AnnotationNotFoundError(),
    );
    expect((await PUT(send("PUT", body))).status).toBe(404);
    vi.mocked(updateClaimCore).mockRejectedValueOnce(
      new InvalidAnnotationError("Unknown update key."),
    );
    expect((await PUT(send("PUT", body))).status).toBe(400);
  });

  it("maps a locked project to the existing locked responses", async () => {
    vi.mocked(updateClaimCore).mockRejectedValueOnce(
      new MissingProjectKeyError(PROJECT),
    );
    const res = await PUT(send("PUT", { ...base, update: { statement: "s" } }));
    expect(res.status).toBe(409);
  });
});

describe("hosted tenancy (core faked over the request's storage context)", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReturnValue(true);
    // The fake reads the projects dir the way a real core does, so what it
    // sees is decided by the storage context the route established.
    vi.mocked(listClaimsCore).mockImplementation(async (projectId: string) => {
      const file = path.join(resolveProjectsDir(), projectId, "claims.json");
      return JSON.parse(await fs.readFile(file, "utf8")) as ClaimListResult;
    });
  });

  async function seedProject(
    root: string,
    list: ClaimListResult,
  ): Promise<void> {
    await fs.mkdir(path.join(root, PROJECT), { recursive: true });
    await fs.writeFile(
      path.join(root, PROJECT, "claims.json"),
      JSON.stringify(list),
    );
  }

  it("reads the signed-in tenant's own project", async () => {
    tenantState.root = await tmp("gw-claims-a-");
    const list: ClaimListResult = {
      claims: [{ resourceId: RESOURCE, resourceName: "R", annotation: STORED }],
      failures: [],
    };
    await seedProject(tenantState.root, list);
    const res = await GET(get(`projectId=${PROJECT}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(list);
  });

  it("shows tenant B nothing of tenant A's project through GET", async () => {
    const tenantA = await tmp("gw-claims-a-");
    const tenantB = await tmp("gw-claims-b-");
    await seedProject(tenantA, {
      claims: [
        { resourceId: RESOURCE, resourceName: "A-only", annotation: STORED },
      ],
      failures: [],
    });
    tenantState.root = tenantB;
    const outcome = await GET(get(`projectId=${PROJECT}`)).then(
      async (res: Response) => ({ status: res.status, text: await res.text() }),
      () => ({ status: 0, text: "" }),
    );
    expect(outcome.text).not.toContain("A-only");
    expect(outcome.status === 0 || outcome.status >= 400).toBe(true);
  });

  it("refuses a cross-site write before the core runs", async () => {
    tenantState.root = await tmp("gw-claims-a-");
    const res = await POST(
      send("POST", POST_BODY, { origin: "https://evil.example" }),
    );
    expect(res.status).toBe(403);
    expect(addClaimCore).not.toHaveBeenCalled();
  });
});

describe("paired-device gate: classified as the annotation routes are", () => {
  const MACHINE: OwnMachine = {
    hostname: "test-machine",
    interfaces: {
      en0: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
    } as OwnMachine["interfaces"],
  };
  let sharingDir: string;

  beforeEach(async () => {
    sharingDir = await tmp("gw-claims-gate-");
    vi.stubEnv("GETWRITE_SHARING", "1");
    vi.stubEnv("GETWRITE_SHARING_DIR", sharingDir);
    vi.stubEnv("GETWRITE_WINDOW_SECRET", "w".repeat(64));
    vi.stubEnv("PORT", "3000");
  });
  afterEach(() => vi.unstubAllEnvs());

  function gateRequest(
    pathname: string,
    method: string,
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

  it.each([["GET"], ["POST"], ["PUT"]])(
    "%s: a paired device passes as for /api/annotations, an unpaired one is refused",
    async (method) => {
      const { token, device } = mintCredential("Device");
      await addDevice(sharingDir, device);
      const cookie = { cookie: `${DEVICE_COOKIE}=${token}` };
      for (const route of ["/api/claims", "/api/annotations"]) {
        const paired = await runGate(
          gateRequest(route, method, cookie),
          process.env,
          MACHINE,
        );
        expect(passes(paired), `${method} ${route} paired`).toBe(true);
        const unpaired = await runGate(
          gateRequest(route, method, {}),
          process.env,
          MACHINE,
        );
        expect(passes(unpaired), `${method} ${route} unpaired`).toBe(false);
        expect([401, 403, 302, 303, 307]).toContain(unpaired.status);
      }
    },
  );
});
