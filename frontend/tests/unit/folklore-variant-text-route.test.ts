/**
 * Feature 110 Task 9 (FR-13, FR-21, FR-24): `GET /api/folklore/variant-text`.
 * The Task 8 core is mocked by its signature, so these tests are evidence
 * about the route only: not about the core, a real hosted tenant, or a real
 * paired client. `resolveTenant` and `isHostedAuthActive` are mocked so one
 * tenant can be played against another, as in `claims-route.test.ts`.
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
vi.mock("../../src/lib/models/folklore-variant-read-core", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/folklore-variant-read-core")
  >("../../src/lib/models/folklore-variant-read-core");
  return { ...actual, readVariantTextCore: vi.fn() };
});

import * as routeModule from "../../app/api/folklore/variant-text/route";
import { GET } from "../../app/api/folklore/variant-text/route";
import {
  InvalidProjectIdCoreError,
  InvalidVariantResourceIdError,
  VariantProjectNotFoundError,
  readVariantTextCore,
} from "../../src/lib/models/folklore-variant-read-core";
import type { VariantTextResult } from "../../src/lib/models/folklore-types";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { resolveProjectsDir } from "../../src/lib/models/projects-dir";
import { runGate } from "../../src/lib/sharing/gate";
import type { OwnMachine } from "../../src/lib/sharing/host-allowlist";
import { DEVICE_COOKIE } from "../../src/lib/sharing/classify-request";
import {
  addDevice,
  mintCredential,
} from "../../src/lib/sharing/credential-store";
import { removeDirRetry } from "./helpers/fs-utils";

const URL_BASE = "http://localhost/api/folklore/variant-text";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "22222222-2222-4222-8222-222222222222";
const QUERY = `projectId=${PROJECT}&resourceId=${RESOURCE}`;
const dirs: string[] = [];

beforeEach(() => {
  isHostedAuthActiveMock.mockReturnValue(false);
  vi.mocked(readVariantTextCore).mockResolvedValue({ kind: "none" });
});

afterEach(async () => {
  vi.mocked(readVariantTextCore).mockReset();
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

function get(query: string): never {
  return new Request(`${URL_BASE}?${query}`) as never;
}

describe("route surface", () => {
  it("exports GET only: the read writes nothing", () => {
    expect(
      Object.keys(routeModule)
        .filter((k) => /^[A-Z]+$/.test(k))
        .sort(),
    ).toEqual(["GET"]);
  });

  it("imports no lib/sharing module and adds no limit check", async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, "../../app/api/folklore/variant-text/route.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /checkLimit|limits-check|refusalFor|lib\/sharing/,
    );
  });
});

describe("GET /api/folklore/variant-text", () => {
  it.each<[string, VariantTextResult]>([
    ["text", { kind: "text", text: "Once upon a time" }],
    ["none", { kind: "none" }],
    ["unreadable", { kind: "unreadable", reason: "A fixed reason." }],
  ])(
    "returns the %s result of the core for the two ids",
    async (_n, result) => {
      vi.mocked(readVariantTextCore).mockResolvedValueOnce(result);
      const res = await GET(get(QUERY));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(result);
      expect(readVariantTextCore).toHaveBeenCalledWith(PROJECT, RESOURCE);
    },
  );

  it("fails closed on a locked project with the existing 401 and 409", async () => {
    vi.mocked(readVariantTextCore).mockRejectedValueOnce(
      new ProjectLockedError(PROJECT),
    );
    expect((await GET(get(QUERY))).status).toBe(401);
    vi.mocked(readVariantTextCore).mockRejectedValueOnce(
      new MissingProjectKeyError(PROJECT),
    );
    expect((await GET(get(QUERY))).status).toBe(409);
  });

  it("returns 400 for a path or any other query key, before the core runs, without echoing it", async () => {
    const res = await GET(get(`${QUERY}&projectRoot=/etc/passwd`));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("/etc/passwd");
    expect(readVariantTextCore).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed project id without echoing it", async () => {
    vi.mocked(readVariantTextCore).mockRejectedValueOnce(
      new InvalidProjectIdCoreError("../SECRET"),
    );
    const res = await GET(get(`projectId=..%2FSECRET&resourceId=${RESOURCE}`));
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("SECRET");
  });

  it("returns 400 for a malformed resource id without echoing it", async () => {
    vi.mocked(readVariantTextCore).mockRejectedValueOnce(
      new InvalidVariantResourceIdError(),
    );
    const res = await GET(
      get(`projectId=${PROJECT}&resourceId=SECRET-%3Cb%3E`),
    );
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).not.toContain("SECRET");
  });

  it("passes a missing id to the core as an empty string, which the core refuses", async () => {
    vi.mocked(readVariantTextCore).mockRejectedValueOnce(
      new InvalidVariantResourceIdError(),
    );
    expect((await GET(get(`projectId=${PROJECT}`))).status).toBe(400);
    expect(readVariantTextCore).toHaveBeenCalledWith(PROJECT, "");
  });

  it("returns 404 for a project the caller's scope does not hold", async () => {
    vi.mocked(readVariantTextCore).mockRejectedValueOnce(
      new VariantProjectNotFoundError(),
    );
    expect((await GET(get(QUERY))).status).toBe(404);
  });

  it("does not turn an unexpected core failure into a result", async () => {
    vi.mocked(readVariantTextCore).mockRejectedValueOnce(new Error("disk"));
    await expect(GET(get(QUERY))).rejects.toThrow("disk");
  });
});

describe("hosted tenancy (core faked over the request's storage context)", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReturnValue(true);
    // The fake reads the projects dir the way a real core does, so what it
    // sees is decided by the storage context the route established.
    vi.mocked(readVariantTextCore).mockImplementation(
      async (projectId: string): Promise<VariantTextResult> => {
        const file = path.join(resolveProjectsDir(), projectId, "text.txt");
        return { kind: "text", text: await fs.readFile(file, "utf8") };
      },
    );
  });

  async function seedProject(root: string, text: string): Promise<void> {
    await fs.mkdir(path.join(root, PROJECT), { recursive: true });
    await fs.writeFile(path.join(root, PROJECT, "text.txt"), text);
  }

  it("reads the signed-in tenant's own project", async () => {
    tenantState.root = await tmp("gw-variant-a-");
    await seedProject(tenantState.root, "A text");
    const res = await GET(get(QUERY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: "text", text: "A text" });
  });

  it("shows tenant B nothing of tenant A's project", async () => {
    const tenantA = await tmp("gw-variant-a-");
    const tenantB = await tmp("gw-variant-b-");
    await seedProject(tenantA, "A-only");
    tenantState.root = tenantB;
    const outcome = await GET(get(QUERY)).then(
      async (res: Response) => ({ status: res.status, text: await res.text() }),
      () => ({ status: 0, text: "" }),
    );
    expect(outcome.text).not.toContain("A-only");
    expect(outcome.status === 0 || outcome.status >= 400).toBe(true);
  });
});

describe("paired-device gate: classified as every other /api route", () => {
  const MACHINE: OwnMachine = {
    hostname: "test-machine",
    interfaces: {
      en0: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
    } as OwnMachine["interfaces"],
  };
  let sharingDir: string;

  beforeEach(async () => {
    sharingDir = await tmp("gw-variant-gate-");
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
      method: "GET",
      headers: { host, origin: `http://${host}`, ...headers },
    });
  }

  const passes = (res: NextResponse): boolean =>
    res.headers.get("x-middleware-next") === "1";

  it("a paired device passes as for /api/claims, an unpaired one is refused", async () => {
    const { token, device } = mintCredential("Device");
    await addDevice(sharingDir, device);
    const cookie = { cookie: `${DEVICE_COOKIE}=${token}` };
    for (const route of ["/api/folklore/variant-text", "/api/claims"]) {
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
