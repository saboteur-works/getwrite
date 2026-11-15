/**
 * Feature 116 Task 18 (FR-6, FR-21, FR-22): `/api/citations/fields` (GET read,
 * PUT write). The two cores are mocked by signature (their error classes are
 * the real ones), so these tests are evidence about the route only: not about
 * the cores, a real hosted tenant or a real paired client. Paired-device
 * classification is asserted here with `runGate`, not in another test file.
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
vi.mock(
  "../../src/lib/models/citations-fields-core",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../../src/lib/models/citations-fields-core")
    >()),
    readCitationFieldsCore: vi.fn(),
    writeCitationFieldsCore: vi.fn(),
  }),
);

import * as routeModule from "../../app/api/citations/fields/route";
import { GET, PUT } from "../../app/api/citations/fields/route";
import {
  CitationFieldsInvalidError,
  CitationFieldsNotFoundError,
  CitationFieldsResourceIdError,
  CitationFieldsSourceTypeError,
  InvalidProjectIdCoreError,
  readCitationFieldsCore,
  writeCitationFieldsCore,
} from "../../src/lib/models/citations-fields-core";
import type { CitationFieldsReadResult } from "../../src/lib/models/citations-fields-core";
import {
  CITATION_FIELDS_REFUSAL,
  type CitationFields,
} from "../../src/lib/models/citations-fields-validation";
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

const URL_BASE = "http://localhost/api/citations/fields";
const ORIGIN = "https://app.getwrite.example";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const RESOURCE = "22222222-2222-4222-8222-222222222222";
const dirs: string[] = [];
let savedAuthUrl: string | undefined;

const STORED_FIELDS = {
  referenceType: "book",
  title: "A Title",
} as CitationFields;
const FOUND: CitationFieldsReadResult = {
  kind: "fields",
  fields: STORED_FIELDS,
};

beforeEach(() => {
  savedAuthUrl = process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL = ORIGIN;
  isHostedAuthActiveMock.mockReturnValue(false);
  vi.mocked(readCitationFieldsCore).mockResolvedValue(FOUND);
  vi.mocked(writeCitationFieldsCore).mockResolvedValue(STORED_FIELDS);
});

afterEach(async () => {
  vi.mocked(readCitationFieldsCore).mockReset();
  vi.mocked(writeCitationFieldsCore).mockReset();
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
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as never;
}

function get(query: string): never {
  return new Request(`${URL_BASE}?${query}`) as never;
}

const PUT_BODY = {
  projectId: PROJECT,
  resourceId: RESOURCE,
  fields: { referenceType: "book", title: "A Title" },
};
const GET_QUERY = `projectId=${PROJECT}&resourceId=${RESOURCE}`;

describe("route surface", () => {
  it("exports GET and PUT only", () => {
    expect(
      Object.keys(routeModule)
        .filter((k) => /^[A-Z]+$/.test(k))
        .sort(),
    ).toEqual(["GET", "PUT"]);
  });

  it("imports no lib/sharing module and adds no limit switch", async () => {
    const source = await fs.readFile(
      path.resolve(__dirname, "../../app/api/citations/fields/route.ts"),
      "utf8",
    );
    expect(source).not.toMatch(
      /checkLimit|limits-check|refusalFor|lib\/sharing/,
    );
  });
});

describe("GET /api/citations/fields", () => {
  it("returns the core's stored fields for the ids", async () => {
    const res = await GET(get(GET_QUERY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(FOUND);
    expect(readCitationFieldsCore).toHaveBeenCalledWith(PROJECT, RESOURCE);
  });

  it("returns null fields for a Source with none, distinct from a failure", async () => {
    vi.mocked(readCitationFieldsCore).mockResolvedValueOnce({
      kind: "fields",
      fields: null,
    });
    const none = await (await GET(get(GET_QUERY))).json();
    vi.mocked(readCitationFieldsCore).mockResolvedValueOnce({
      kind: "failed",
      message: "The citation fields could not be read.",
    });
    const failed = await (await GET(get(GET_QUERY))).json();
    expect(none).toEqual({ kind: "fields", fields: null });
    expect(failed).toEqual({
      kind: "failed",
      message: "The citation fields could not be read.",
    });
  });

  it("refuses a path or any other query key, before the core runs", async () => {
    const res = await GET(get(`${GET_QUERY}&projectRoot=/etc/SECRET`));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: CITATION_FIELDS_REFUSAL });
    expect(readCitationFieldsCore).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed project id", new InvalidProjectIdCoreError("../etc")],
    ["a malformed resource id", new CitationFieldsResourceIdError()],
  ])("refuses %s with the one refusal text", async (_n, error) => {
    vi.mocked(readCitationFieldsCore).mockRejectedValueOnce(error);
    const res = await GET(get("projectId=..%2Fetc&resourceId=SECRET"));
    expect(res.status).toBe(400);
    const text = JSON.stringify(await res.json());
    expect(text).toBe(JSON.stringify({ error: CITATION_FIELDS_REFUSAL }));
    expect(text).not.toContain("SECRET");
  });

  it("maps a non-Source to 400 and an unknown resource to 404", async () => {
    vi.mocked(readCitationFieldsCore).mockRejectedValueOnce(
      new CitationFieldsSourceTypeError(),
    );
    expect((await GET(get(GET_QUERY))).status).toBe(400);
    vi.mocked(readCitationFieldsCore).mockRejectedValueOnce(
      new CitationFieldsNotFoundError(),
    );
    expect((await GET(get(GET_QUERY))).status).toBe(404);
  });

  it("maps a locked project to the existing locked responses", async () => {
    vi.mocked(readCitationFieldsCore).mockRejectedValueOnce(
      new ProjectLockedError(PROJECT),
    );
    expect((await GET(get(GET_QUERY))).status).toBe(401);
    vi.mocked(readCitationFieldsCore).mockRejectedValueOnce(
      new MissingProjectKeyError(PROJECT),
    );
    expect((await GET(get(GET_QUERY))).status).toBe(409);
  });

  it("does not turn an unexpected core failure into empty fields", async () => {
    vi.mocked(readCitationFieldsCore).mockRejectedValueOnce(new Error("disk"));
    await expect(GET(get(GET_QUERY))).rejects.toThrow("disk");
  });
});

describe("PUT /api/citations/fields", () => {
  it("passes the ids and fields to the core and returns the stored value", async () => {
    const res = await PUT(send(PUT_BODY));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ fields: STORED_FIELDS });
    expect(writeCitationFieldsCore).toHaveBeenCalledWith(
      PROJECT,
      RESOURCE,
      PUT_BODY.fields,
    );
  });

  it.each([
    ["invalid JSON", "{ not json"],
    ["an array body", []],
    ["an unknown top-level key (a path)", { ...PUT_BODY, path: "/etc/SECRET" }],
  ])(
    "refuses %s with the one refusal text, before the core runs",
    async (_n, body) => {
      const res = await PUT(send(body));
      expect(res.status).toBe(400);
      const text = JSON.stringify(await res.json());
      expect(text).toBe(JSON.stringify({ error: CITATION_FIELDS_REFUSAL }));
      expect(writeCitationFieldsCore).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["an unknown reference type", new CitationFieldsInvalidError()],
    ["a malformed resource id", new CitationFieldsResourceIdError()],
    ["a malformed project id", new InvalidProjectIdCoreError("SECRET")],
  ])("refuses %s with the same text, without echoing input", async (_n, e) => {
    vi.mocked(writeCitationFieldsCore).mockRejectedValueOnce(e);
    const res = await PUT(
      send({ ...PUT_BODY, fields: { referenceType: "SECRET-<b>" } }),
    );
    expect(res.status).toBe(400);
    const text = JSON.stringify(await res.json());
    expect(text).toBe(JSON.stringify({ error: CITATION_FIELDS_REFUSAL }));
    expect(text).not.toContain("SECRET");
  });

  it("maps a non-Source to 400 and an unknown resource to 404", async () => {
    vi.mocked(writeCitationFieldsCore).mockRejectedValueOnce(
      new CitationFieldsSourceTypeError(),
    );
    expect((await PUT(send(PUT_BODY))).status).toBe(400);
    vi.mocked(writeCitationFieldsCore).mockRejectedValueOnce(
      new CitationFieldsNotFoundError(),
    );
    expect((await PUT(send(PUT_BODY))).status).toBe(404);
  });

  it("fails closed on a locked project with the existing locked responses", async () => {
    vi.mocked(writeCitationFieldsCore).mockRejectedValueOnce(
      new ProjectLockedError(PROJECT),
    );
    expect((await PUT(send(PUT_BODY))).status).toBe(401);
    vi.mocked(writeCitationFieldsCore).mockRejectedValueOnce(
      new MissingProjectKeyError(PROJECT),
    );
    expect((await PUT(send(PUT_BODY))).status).toBe(409);
  });
});

describe("hosted tenancy (core faked over the request's storage context)", () => {
  beforeEach(() => {
    isHostedAuthActiveMock.mockReturnValue(true);
    // The fake writes under the projects dir the way a real core does, so
    // where it lands is decided by the storage context the route established.
    vi.mocked(writeCitationFieldsCore).mockImplementation(
      async (projectId: string) => {
        const dir = path.join(resolveProjectsDir(), projectId);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(path.join(dir, "fields.json"), "written");
        return STORED_FIELDS;
      },
    );
  });

  it("writes only under the signed-in tenant's root", async () => {
    const tenantA = await tmp("gw-cit-a-");
    const tenantB = await tmp("gw-cit-b-");
    tenantState.root = tenantA;
    const res = await PUT(send(PUT_BODY, { origin: ORIGIN }));
    expect(res.status).toBe(200);
    await expect(
      fs.readFile(path.join(tenantA, PROJECT, "fields.json"), "utf8"),
    ).resolves.toBe("written");
    await expect(
      fs.access(path.join(tenantB, PROJECT, "fields.json")),
    ).rejects.toThrow();
  });

  it("refuses a cross-site write before the core runs", async () => {
    tenantState.root = await tmp("gw-cit-a-");
    const res = await PUT(send(PUT_BODY, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect(writeCitationFieldsCore).not.toHaveBeenCalled();
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
    sharingDir = await tmp("gw-cit-gate-");
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

  it.each([["GET"], ["PUT"]])(
    "%s: a paired device passes as for /api/annotations, an unpaired one is refused",
    async (method) => {
      const { token, device } = mintCredential("Device");
      await addDevice(sharingDir, device);
      const cookie = { cookie: `${DEVICE_COOKIE}=${token}` };
      for (const route of ["/api/citations/fields", "/api/annotations"]) {
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
