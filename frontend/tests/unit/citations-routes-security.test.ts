/**
 * Feature 116, Task 47 (FR-21, FR-22): security, tenancy and gate pins for
 * every route the feature adds or extends: `PUT/GET /api/citations/fields`,
 * `POST /api/citations/check` and the citations option on
 * `POST /api/compile/pdf` and `POST /api/compile/docx`.
 *
 * Unlike the per-route tests (which fake the cores), these run the real
 * routes over the real cores, the real style loader and the real engine, on a
 * real directory per tenant. Only tenant resolution and the hosted-auth flag
 * are replaced (as every route test does), so what a route sees is decided by
 * the storage context `withStorageContext` establishes.
 *
 * What this file does not show: a real paired device, a real hosted session,
 * a packaged build or any browser. The paired-device case runs `runGate`, the
 * function `proxy.ts` calls. A pin that fails is a finding for the owner. The
 * CitationsCompileError pins (Task 63) are ordinary tests now that the compile
 * routes map the error.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
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
vi.mock("../../src/lib/citations/style-loader", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/citations/style-loader")
    >();
  return { ...actual, loadBundledStyle: vi.fn(actual.loadBundledStyle) };
});
vi.mock("../../src/lib/citations/citation-engine", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../src/lib/citations/citation-engine")
    >();
  return { ...actual, renderCitations: vi.fn(actual.renderCitations) };
});

import {
  GET as fieldsGET,
  PUT as fieldsPUT,
} from "../../app/api/citations/fields/route";
import { POST as checkPOST } from "../../app/api/citations/check/route";
import { POST as docxPOST } from "../../app/api/compile/docx/route";
import { POST as pdfPOST } from "../../app/api/compile/pdf/route";
import { renderCitations } from "../../src/lib/citations/citation-engine";
import { loadBundledStyle } from "../../src/lib/citations/style-loader";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import * as io from "../../src/lib/models/io";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import {
  __resetKeyringSessionForTests,
  createWorkspaceKeyring,
  lockSession,
  registerProject,
  requireSessionKeyring,
} from "../../src/lib/models/crypto/keyring-session";
import { CITATION_FIELDS_REFUSAL } from "../../src/lib/models/citations-fields-validation";
import { generateUUID } from "../../src/lib/models/uuid";
import { tiptapToPlainText } from "../../src/lib/tiptap-text";
import type {
  Annotation,
  MetadataValue,
  TipTapDocument,
} from "../../src/lib/models/types";
import { runGate } from "../../src/lib/sharing/gate";
import type { OwnMachine } from "../../src/lib/sharing/host-allowlist";
import { DEVICE_COOKIE } from "../../src/lib/sharing/classify-request";
import {
  addDevice,
  mintCredential,
} from "../../src/lib/sharing/credential-store";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { extractPdfPageTexts } from "../helpers/pdf-text";
import { removeDirRetry } from "./helpers/fs-utils";

const FRONTEND = path.resolve(__dirname, "../..");
const ORIGIN = "https://app.getwrite.example";
const STYLE_ID = "chicago-notes-bibliography";
const T0 = "1970-01-01T00:00:00.000Z";
const PASS = "correct horse battery staple";
const dirs: string[] = [];
let savedAuthUrl: string | undefined;
let savedProjectsDir: string | undefined;

beforeEach(() => {
  savedAuthUrl = process.env.BETTER_AUTH_URL;
  savedProjectsDir = process.env.GETWRITE_PROJECTS_DIR;
  process.env.BETTER_AUTH_URL = ORIGIN;
  isHostedAuthActiveMock.mockReturnValue(false);
  __resetKeyringSessionForTests();
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(loadBundledStyle).mockClear();
  vi.mocked(renderCitations).mockClear();
  __resetKeyringSessionForTests();
  if (savedAuthUrl === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = savedAuthUrl;
  if (savedProjectsDir === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = savedProjectsDir;
  while (dirs.length > 0) {
    const dir = dirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

// ---------------------------------------------------------------- fixtures

async function tmp(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

interface Seeded {
  projectId: string;
  source: string;
  chapter: string;
  note: string;
}

type Fields = Record<string, unknown>;

function paragraph(...parts: [string, string?][]): TipTapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: parts.map(([value, markId]) =>
          markId === undefined
            ? { type: "text", text: value }
            : {
                type: "text",
                text: value,
                marks: [{ type: "annotation", attrs: { id: markId } }],
              },
        ),
      },
    ],
  };
}

async function putResource(
  root: string,
  name: string,
  type: "text" | "source",
  extra: Record<string, unknown>,
  document?: TipTapDocument,
): Promise<string> {
  const id = generateUUID();
  await writeSidecar(root, id, {
    id,
    slug: name.toLowerCase(),
    type,
    name,
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
    ...extra,
  } as Record<string, MetadataValue>);
  const dir = `${root}/resources/${id}`;
  await io.mkdir(dir, { recursive: true });
  if (document !== undefined) {
    await io.writeFile(
      `${dir}/content.tiptap.json`,
      JSON.stringify(document),
      "utf8",
    );
    await io.writeFile(
      `${dir}/content.txt`,
      tiptapToPlainText(document),
      "utf8",
    );
  }
  return id;
}

/**
 * Seeds a project under `workspace` with one Source (with `fields`) and one
 * text chapter that cites it. Writes through the active io adapter, so it
 * seals the files when called inside an encrypting storage context.
 */
async function seedProject(
  workspace: string,
  fields: Fields = {
    referenceType: "book",
    authors: [{ given: "Jane", family: "Smith" }],
    title: "The Ledger",
    publisher: "Penguin",
    place: "London",
    date: "1999",
  },
  projectId: string = generateUUID(),
): Promise<Seeded> {
  const root = `${workspace}/${projectId}`;
  await io.mkdir(root, { recursive: true });
  await io.writeFile(
    `${root}/${PROJECT_FILENAME}`,
    JSON.stringify(createProject({ name: "secret-project-name" })),
    "utf8",
  );
  const source = await putResource(root, "Ledger", "source", {
    citationFields: fields,
  });
  const note = generateUUID();
  const annotation: Annotation = {
    id: note,
    body: "",
    quote: "the claim",
    createdAt: T0,
    updatedAt: T0,
    target: { sourceId: source },
  };
  const chapter = await putResource(
    root,
    "Chapter",
    "text",
    { annotations: [annotation] },
    paragraph(["Before "], ["the claim", note], [" after."]),
  );
  return { projectId, source, chapter, note };
}

function post(
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

const sendCheck = (body: unknown, h?: Record<string, string>): never =>
  post("http://localhost/api/citations/check", body, h);
const sendPut = (body: unknown, h?: Record<string, string>): never =>
  new Request("http://localhost/api/citations/fields", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...h },
    body: JSON.stringify(body),
  }) as never;
const sendGet = (query: string): never =>
  new Request(`http://localhost/api/citations/fields?${query}`) as never;
const sendDocx = (body: unknown, h?: Record<string, string>): never =>
  post("http://localhost/api/compile/docx", body, h);
const sendPdf = (body: unknown, h?: Record<string, string>): never =>
  post("http://localhost/api/compile/pdf", body, h);

function compileBody(s: Seeded, extra: Record<string, unknown> = {}): unknown {
  return {
    projectId: s.projectId,
    resourceIds: [s.chapter],
    resources: [{ id: s.chapter, name: "Chapter", type: "text" }],
    includeHeaders: true,
    projectName: "Book",
    citations: { styleId: STYLE_ID },
    ...extra,
  };
}

/** Each route as a uniform caller of a seeded project, with an Origin for hosted CSRF. */
interface RouteCase {
  name: string;
  call: (s: Seeded, h?: Record<string, string>) => Promise<Response>;
}
const HEADERS = { origin: ORIGIN };
const ROUTES: readonly RouteCase[] = [
  {
    name: "GET /api/citations/fields",
    call: async (s) =>
      fieldsGET(sendGet(`projectId=${s.projectId}&resourceId=${s.source}`)),
  },
  {
    name: "PUT /api/citations/fields",
    call: async (s, h) =>
      fieldsPUT(
        sendPut(
          {
            projectId: s.projectId,
            resourceId: s.source,
            fields: { referenceType: "book", title: "Written By Request" },
          },
          h,
        ),
      ),
  },
  {
    name: "POST /api/citations/check",
    call: async (s, h) =>
      checkPOST(
        sendCheck({ projectId: s.projectId, resourceIds: [s.chapter] }, h),
      ),
  },
  {
    name: "POST /api/compile/docx (citations)",
    call: async (s, h) => docxPOST(sendDocx(compileBody(s), h)),
  },
  {
    name: "POST /api/compile/pdf (citations)",
    call: async (s, h) => pdfPOST(sendPdf(compileBody(s), h)),
  },
];

// ------------------------------------------------- 1. the routes, by source

const ROUTE_FILES: Record<string, string> = {
  fields: "app/api/citations/fields/route.ts",
  check: "app/api/citations/check/route.ts",
  pdf: "app/api/compile/pdf/route.ts",
  docx: "app/api/compile/docx/route.ts",
};

describe("route sources: storage context, no path, no limit switch", () => {
  const sources = new Map<string, string>();
  beforeEach(async () => {
    for (const [key, file] of Object.entries(ROUTE_FILES)) {
      sources.set(key, await fs.readFile(path.join(FRONTEND, file), "utf8"));
    }
  });

  it("every exported handler is wrapped in withStorageContext", () => {
    for (const [key, source] of sources) {
      const exported = [
        ...source.matchAll(/export const (GET|POST|PUT|PATCH|DELETE) = (.*);/g),
      ];
      expect(exported.length, key).toBeGreaterThan(0);
      for (const [, method, rhs] of exported) {
        expect(rhs, `${key} ${method}`).toMatch(/^withStorageContext\(/);
      }
      expect(source, key).not.toMatch(
        /export (async )?function (GET|POST|PUT|PATCH|DELETE)\b/,
      );
    }
  });

  it("no route reads a path, joins one or touches the file system itself", () => {
    for (const [key, source] of sources) {
      expect(source, key).not.toMatch(
        /projectPath|projectsDir|resolveProjectsDir|node:fs|node:path|path\.(join|resolve)|from "fs"/,
      );
    }
  });

  it("no route imports the limit check or anything under lib/sharing (Task 11's record names no limit)", () => {
    for (const [key, source] of sources) {
      expect(source, key).not.toMatch(
        /checkLimit|limits-check|limits-store|refusalFor|lib\/sharing/,
      );
    }
  });

  it("the limit-checking routes stay the five Task 11 named, none of them ours", async () => {
    const found: string[] = [];
    async function walk(dir: string): Promise<void> {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name === "route.ts") {
          const text = await fs.readFile(full, "utf8");
          if (/checkLimit|limits-check/.test(text)) {
            found.push(path.relative(path.join(FRONTEND, "app/api"), full));
          }
        }
      }
    }
    await walk(path.join(FRONTEND, "app/api"));
    expect(found.length).toBeGreaterThanOrEqual(5);
    expect(found.filter((f) => /^(citations|compile)\//.test(f))).toEqual([]);
  });
});

// ------------------------------------------ 2. paired-device gate (runGate)

describe("paired-device gate classifies each route as /api/annotations is", () => {
  const MACHINE: OwnMachine = {
    hostname: "test-machine",
    interfaces: {
      en0: [{ address: "10.0.0.5", family: "IPv4", internal: false }],
    } as OwnMachine["interfaces"],
  };
  let sharingDir = "";

  beforeEach(async () => {
    sharingDir = await tmp("gw-cite-sec-gate-");
    vi.stubEnv("GETWRITE_SHARING", "1");
    vi.stubEnv("GETWRITE_SHARING_DIR", sharingDir);
    vi.stubEnv("GETWRITE_WINDOW_SECRET", "w".repeat(64));
    vi.stubEnv("PORT", "3000");
  });
  afterEach(() => vi.unstubAllEnvs());

  const passes = (res: NextResponse): boolean =>
    res.headers.get("x-middleware-next") === "1";

  it.each([
    ["PUT", "/api/citations/fields"],
    ["GET", "/api/citations/fields"],
    ["POST", "/api/citations/check"],
    ["POST", "/api/compile/pdf"],
    ["POST", "/api/compile/docx"],
    ["POST", "/api/annotations"],
  ])(
    "%s %s: a paired device passes, an unpaired one is refused",
    async (method, route) => {
      const { token, device } = mintCredential("Device");
      await addDevice(sharingDir, device);
      const host = "10.0.0.5:3000";
      const make = (headers: Record<string, string>): NextRequest =>
        new NextRequest(`http://${host}${route}`, {
          method,
          headers: { host, origin: `http://${host}`, ...headers },
        });
      const paired = await runGate(
        make({ cookie: `${DEVICE_COOKIE}=${token}` }),
        process.env,
        MACHINE,
      );
      expect(passes(paired), "paired").toBe(true);
      const unpaired = await runGate(make({}), process.env, MACHINE);
      expect(passes(unpaired), "unpaired").toBe(false);
      expect([401, 403, 302, 303, 307]).toContain(unpaired.status);
    },
  );

  it("a paired device is not refused by a limit switch on any of these routes (no switch is read)", async () => {
    // The five switches are enforced inside the routes that import the check;
    // the source pin above shows none of ours does, so the gate is the only
    // classification they have. Here the gate itself, with every switch off,
    // gives the same answer for ours as for /api/annotations.
    const { token, device } = mintCredential("Device");
    await addDevice(sharingDir, device);
    await fs.writeFile(
      path.join(sharingDir, "sharing-limits.json"),
      JSON.stringify({
        projectDeletion: false,
        unlocking: false,
        locking: false,
        encryptionChanges: false,
        permanentDeletion: false,
      }),
    );
    const host = "10.0.0.5:3000";
    for (const route of [
      "/api/citations/fields",
      "/api/citations/check",
      "/api/compile/pdf",
      "/api/compile/docx",
      "/api/annotations",
    ]) {
      const res = await runGate(
        new NextRequest(`http://${host}${route}`, {
          method: "POST",
          headers: {
            host,
            origin: `http://${host}`,
            cookie: `${DEVICE_COOKIE}=${token}`,
          },
        }),
        process.env,
        MACHINE,
      );
      expect(passes(res), route).toBe(true);
    }
  });
});

// --------------------------------- 3. behaviour over real cores, one tenant

describe("every route works over a real project (non-vacuity for the refusals below)", () => {
  it.each(ROUTES.map((r) => [r.name, r] as const))(
    "%s answers 200 for a well-formed request",
    async (_name, route) => {
      tenantState.root = await tmp("gw-cite-sec-ok-");
      const seeded = await seedProject(tenantState.root);
      const res = await route.call(seeded, HEADERS);
      expect(res.status).toBe(200);
    },
  );
});

// ---------------------------------------------------- 4. fail closed, locked

describe("a locked project fails closed on every route", () => {
  async function sealedProject(root: string): Promise<Seeded> {
    await createWorkspaceKeyring(PASS, root, undefined, TEST_ARGON2_PARAMS);
    const keyring = requireSessionKeyring();
    const projectId = generateUUID();
    await registerProject(projectId, root);
    const plain = io.getStorageAdapter();
    const sealing = workspaceEncryptionAdapter(plain, root, keyring);
    await plain.mkdir(`${root}/${projectId}`, { recursive: true });
    await writeProjectMarker(`${root}/${projectId}`, plain);
    return runInStorageContext({ tenantRoot: root, adapter: sealing }, () =>
      seedProject(root, undefined, projectId),
    );
  }

  it.each(ROUTES.map((r) => [r.name, r] as const))(
    "%s: 401 with the locked sentence, never an empty or ok result, no content or project name",
    async (_name, route) => {
      tenantState.root = await tmp("gw-cite-sec-lock-");
      const seeded = await sealedProject(tenantState.root);
      lockSession();
      const res = await route.call(seeded, HEADERS);
      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).not.toContain("secret-project-name");
      expect(text).not.toContain("The Ledger");
      expect(text).not.toContain("Written By Request");
    },
  );

  it("non-vacuity: unlocked, the same sealed project answers 200", async () => {
    tenantState.root = await tmp("gw-cite-sec-lock-");
    const seeded = await sealedProject(tenantState.root);
    const res = await ROUTES[2].call(seeded, HEADERS);
    expect(res.status).toBe(200);
  });
});

// ------------------------------------------------------- 5. hosted tenancy

describe("a hosted tenant touches only the signed-in tenant's project", () => {
  beforeEach(() => isHostedAuthActiveMock.mockReturnValue(true));

  const OTHER = "tenant-A-only-secret-title";

  it.each(ROUTES.map((r) => [r.name, r] as const))(
    "%s: tenant B cannot reach tenant A's project and sees none of its data",
    async (_name, route) => {
      const tenantA = await tmp("gw-cite-sec-a-");
      const tenantB = await tmp("gw-cite-sec-b-");
      const seeded = await seedProject(tenantA, {
        referenceType: "book",
        title: OTHER,
        authors: [{ given: "A", family: "Author" }],
      });
      tenantState.root = tenantB;
      const outcome = await route.call(seeded, HEADERS).then(
        async (res) => ({ status: res.status, text: await res.text() }),
        (err: unknown) => ({
          status: 0,
          text: err instanceof Error ? err.message : String(err),
        }),
      );
      expect(outcome.text).not.toContain(OTHER);
      expect(outcome.text).not.toContain("secret-project-name");
      expect(outcome.status === 0 || outcome.status >= 400).toBe(true);
      // Tenant A's files are unchanged by a request made as tenant B.
      const sidecar = await readSidecar(
        `${tenantA}/${seeded.projectId}`,
        seeded.source,
      );
      expect(JSON.stringify(sidecar)).toContain(OTHER);
      expect(JSON.stringify(sidecar)).not.toContain("Written By Request");
    },
  );

  it.each(ROUTES.map((r) => [r.name, r] as const))(
    "%s: tenant A reaches its own project (non-vacuity)",
    async (_name, route) => {
      tenantState.root = await tmp("gw-cite-sec-a-");
      const seeded = await seedProject(tenantState.root);
      expect((await route.call(seeded, HEADERS)).status).toBe(200);
    },
  );

  it.each(ROUTES.slice(1).filter((r) => !r.name.startsWith("GET")))(
    "$name: refuses a state-changing request without a same-site Origin before any core runs",
    async (route) => {
      tenantState.root = await tmp("gw-cite-sec-csrf-");
      const seeded = await seedProject(tenantState.root);
      const res = await route.call(seeded, { origin: "https://evil.example" });
      expect(res.status).toBe(403);
      expect(vi.mocked(loadBundledStyle)).not.toHaveBeenCalled();
      const sidecar = await readSidecar(
        `${tenantState.root}/${seeded.projectId}`,
        seeded.source,
      );
      expect(JSON.stringify(sidecar)).not.toContain("Written By Request");
    },
  );
});

// ------------------------------------------------- 6. boundary refusals

describe("boundary input is refused without echoing it", () => {
  let seeded: Seeded;
  beforeEach(async () => {
    tenantState.root = await tmp("gw-cite-sec-bnd-");
    seeded = await seedProject(tenantState.root);
  });

  async function storedFields(): Promise<unknown> {
    const sidecar = await readSidecar(
      `${tenantState.root}/${seeded.projectId}`,
      seeded.source,
    );
    return (sidecar as Record<string, unknown> | null)?.citationFields;
  }

  describe("style id", () => {
    it.each([
      ["an unbundled id", { styleId: "apa-secret-style" }],
      ["a path-shaped id", { styleId: "../../../etc/passwd-secret" }],
      ["a URL id", { styleId: "https://evil.example/s.csl?secret" }],
      ["an empty id", { styleId: "" }],
      ["a non-string id", { styleId: 7 }],
      ["an extra key beside a good id", { styleId: STYLE_ID, path: "/x" }],
      ["an inline style document", { styleId: STYLE_ID, style: "<style/>" }],
      ["a string option", "chicago-notes-bibliography"],
      ["an array option", [STYLE_ID]],
      ["null", null],
    ])(
      "%s is 400 on PDF and DOCX, the engine never runs, nothing is echoed",
      async (_n, option) => {
        for (const [send, route] of [
          [sendDocx, docxPOST],
          [sendPdf, pdfPOST],
        ] as const) {
          const res = await route(
            send(compileBody(seeded, { citations: option })),
          );
          expect(res.status).toBe(400);
          const text = await res.text();
          for (const secret of ["secret", "evil", "passwd", "/x", "<style"]) {
            expect(text).not.toContain(secret);
          }
        }
        expect(vi.mocked(loadBundledStyle)).not.toHaveBeenCalled();
        expect(vi.mocked(renderCitations)).not.toHaveBeenCalled();
      },
    );

    it("non-vacuity: the bundled id is accepted", async () => {
      expect((await docxPOST(sendDocx(compileBody(seeded)))).status).toBe(200);
    });
  });

  describe("client-supplied path", () => {
    it("fields PUT and GET and check refuse a path key without echoing it", async () => {
      const marker = "/etc/path-marker-secret";
      const put = await fieldsPUT(
        sendPut({
          projectId: seeded.projectId,
          resourceId: seeded.source,
          fields: { referenceType: "book", title: "X" },
          path: marker,
        }),
      );
      expect(put.status).toBe(400);
      expect(await put.text()).not.toContain("path-marker-secret");
      const get = await fieldsGET(
        sendGet(
          `projectId=${seeded.projectId}&resourceId=${seeded.source}&path=${encodeURIComponent(marker)}`,
        ),
      );
      expect(get.status).toBe(400);
      expect(await get.text()).not.toContain("path-marker-secret");
      const check = await checkPOST(
        sendCheck({
          projectId: seeded.projectId,
          resourceIds: [seeded.chapter],
          projectPath: marker,
        }),
      );
      expect(check.status).toBe(400);
      expect(await check.text()).not.toContain("path-marker-secret");
    });

    it.each([
      ["a traversal", "../../etc"],
      ["an absolute path", "/etc"],
      ["a Windows path", "C:\\Windows"],
      ["a nested id", "a/b"],
      ["a null byte", "x\u0000y"],
    ])(
      "a project id that is %s is 400 on every route and is not echoed",
      async (_n, bad) => {
        const probes: Response[] = [
          await fieldsGET(
            sendGet(
              `projectId=${encodeURIComponent(bad)}&resourceId=${seeded.source}`,
            ),
          ),
          await fieldsPUT(
            sendPut({
              projectId: bad,
              resourceId: seeded.source,
              fields: { referenceType: "book" },
            }),
          ),
          await checkPOST(
            sendCheck({ projectId: bad, resourceIds: [seeded.chapter] }),
          ),
          await docxPOST(sendDocx(compileBody(seeded, { projectId: bad }))),
          await pdfPOST(sendPdf(compileBody(seeded, { projectId: bad }))),
        ];
        for (const res of probes) {
          expect(res.status).toBe(400);
          const text = await res.text();
          for (const part of ["etc", "Windows", "a/b"]) {
            expect(text).not.toContain(part);
          }
        }
      },
    );

    it("a resource id that is a path is 400 on every route and is not echoed", async () => {
      const bad = "../../../resource-secret";
      const probes: Response[] = [
        await fieldsGET(
          sendGet(
            `projectId=${seeded.projectId}&resourceId=${encodeURIComponent(bad)}`,
          ),
        ),
        await fieldsPUT(
          sendPut({
            projectId: seeded.projectId,
            resourceId: bad,
            fields: { referenceType: "book" },
          }),
        ),
        await checkPOST(
          sendCheck({ projectId: seeded.projectId, resourceIds: [bad] }),
        ),
        await docxPOST(sendDocx(compileBody(seeded, { resourceIds: [bad] }))),
        await pdfPOST(sendPdf(compileBody(seeded, { resourceIds: [bad] }))),
      ];
      for (const res of probes) {
        expect(res.status).toBe(400);
        expect(await res.text()).not.toContain("resource-secret");
      }
    });

    it("a projectPath in a compile body is ignored: the compile reads the project of projectId", async () => {
      const decoy = await seedProject(await tmp("gw-cite-sec-decoy-"), {
        referenceType: "book",
        title: "Decoy Title",
        authors: [{ given: "D", family: "Decoy" }],
      });
      const decoyRoot = path.join(
        path.dirname(path.join(dirs[dirs.length - 1], "x")),
        decoy.projectId,
      );
      const res = await docxPOST(
        sendDocx(
          compileBody(seeded, { projectPath: decoyRoot, path: decoyRoot }),
        ),
      );
      expect(res.status).toBe(200);
      const zip = await JSZip.loadAsync(await res.arrayBuffer());
      const notes =
        (await zip.file("word/footnotes.xml")?.async("string")) ?? "";
      expect(notes).toContain("The Ledger");
      expect(notes).not.toContain("Decoy");
    });
  });

  describe("reference type and field values", () => {
    const put = (fields: unknown): Promise<Response> =>
      Promise.resolve(
        fieldsPUT(
          sendPut({
            projectId: seeded.projectId,
            resourceId: seeded.source,
            fields,
          }),
        ),
      );

    it.each([
      ["an unknown type", { referenceType: "podcast-secret", title: "x" }],
      ["no type", { title: "x" }],
      ["a non-string type", { referenceType: 4 }],
      ["a prototype-ish type", { referenceType: "__proto__" }],
      ["a field of another type", { referenceType: "book", journal: "x" }],
      ["an unknown field", { referenceType: "book", evil: "x" }],
      ["a non-object", "book"],
      ["an array", ["book"]],
    ])(
      "%s: the one fixed sentence, 400, nothing stored, input not echoed",
      async (_n, fields) => {
        const before = await storedFields();
        const res = await put(fields);
        expect(res.status).toBe(400);
        const text = await res.text();
        expect(JSON.parse(text)).toEqual({ error: CITATION_FIELDS_REFUSAL });
        for (const echoed of [
          "podcast",
          "secret",
          "journal",
          "evil",
          "__proto__",
        ]) {
          expect(text).not.toContain(echoed);
        }
        expect(await storedFields()).toEqual(before);
      },
    );

    it("a refusal is the same body whatever the cause (no input-dependent oracle)", async () => {
      const bodies = new Set<string>();
      for (const fields of [
        { referenceType: "podcast" },
        { referenceType: "book", evil: "x" },
        { referenceType: "book", date: "not-a-date" },
        { referenceType: "book", title: "x".repeat(501) },
      ]) {
        bodies.add(await (await put(fields)).text());
      }
      expect(bodies.size).toBe(1);
    });

    it("stores a URL and markup as plain text, unchanged", async () => {
      const fields = {
        referenceType: "web-page",
        title: '<b>bold</b> & "quoted"',
        url: "javascript:alert(1)//<script>x</script>",
      };
      const res = await put(fields);
      expect(res.status).toBe(200);
      expect(await storedFields()).toEqual(fields);
    });

    it("a PUT to a text resource is refused, not written", async () => {
      const res = await fieldsPUT(
        sendPut({
          projectId: seeded.projectId,
          resourceId: seeded.chapter,
          fields: { referenceType: "book", title: "x" },
        }),
      );
      expect(res.status).toBe(400);
      const sidecar = await readSidecar(
        `${tenantState.root}/${seeded.projectId}`,
        seeded.chapter,
      );
      expect(sidecar).not.toHaveProperty("citationFields");
    });
  });
});

// ---------------------------- 7. a CitationsCompileError the routes do not map

describe("a citations compile that fails is answered with a status and a sentence", () => {
  // Task 43 reported, and this group measured, that the routes did not map a
  // CitationsCompileError: the handler rejected with no JSON. Task 63 maps it:
  // 422 for the writer's own cases (here FR-17, a citation whose passage is not
  // in the document), 500 for engine, style and PDF-layout failures.
  async function unplaced(): Promise<Seeded> {
    tenantState.root = await tmp("gw-cite-sec-unplaced-");
    const seeded = await seedProject(tenantState.root);
    const root = `${tenantState.root}/${seeded.projectId}`;
    // The chapter text no longer carries the mark the annotation names.
    await io.writeFile(
      `${root}/resources/${seeded.chapter}/content.tiptap.json`,
      JSON.stringify(paragraph(["Before the claim after."])),
      "utf8",
    );
    return seeded;
  }

  it.each([
    ["docx", sendDocx, docxPOST],
    ["pdf", sendPdf, pdfPOST],
  ] as const)(
    "%s route answers the writer's own case (unplaced citation) with a 4xx and the core's message",
    async (_n, send, route) => {
      const seeded = await unplaced();
      const res = await route(send(compileBody(seeded)));
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(res.headers.get("Content-Type")).toContain("application/json");
      const { error } = (await res.json()) as { error: unknown };
      expect(typeof error).toBe("string");
      expect(error).toContain("not in the document");
    },
  );

  it.each([
    ["docx", sendDocx, docxPOST],
    ["pdf", sendPdf, pdfPOST],
  ] as const)(
    "%s route answers a style failure with a 5xx and the core's message",
    async (_n, send, route) => {
      tenantState.root = await tmp("gw-cite-sec-style-");
      const seeded = await seedProject(tenantState.root);
      vi.mocked(loadBundledStyle).mockResolvedValueOnce({
        ok: false,
        message: "STYLE-LOAD-FAILURE-SENTENCE",
      } as Awaited<ReturnType<typeof loadBundledStyle>>);
      const res = await route(send(compileBody(seeded)));
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(((await res.json()) as { error: string }).error).toBe(
        "STYLE-LOAD-FAILURE-SENTENCE",
      );
    },
  );

  it.each([
    ["docx", sendDocx, docxPOST],
    ["pdf", sendPdf, pdfPOST],
  ] as const)(
    "%s route logs no message or cause of the error it maps",
    async (_n, send, route) => {
      const seeded = await unplaced();
      const spies = (["log", "info", "warn", "error", "debug"] as const).map(
        (m) => vi.spyOn(console, m).mockImplementation(() => undefined),
      );
      const res = await route(send(compileBody(seeded)));
      expect(res.status).toBeGreaterThanOrEqual(400);
      const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
      expect(logged).not.toContain("not in the document");
      expect(logged).not.toContain("Ledger");
      expect(logged).not.toContain("Chapter");
    },
  );

  it.each([
    ["docx", sendDocx, docxPOST],
    ["pdf", sendPdf, pdfPOST],
  ] as const)(
    "%s route never returns a document when the citations cannot be placed",
    async (_n, send, route) => {
      const seeded = await unplaced();
      const outcome = await route(send(compileBody(seeded))).then(
        (res: Response) => ({ ok: true as const, status: res.status }),
        () => ({ ok: false as const, status: 0 }),
      );
      expect(outcome.ok === false || outcome.status >= 400).toBe(true);
    },
  );
});

// --------------------------- 8. URL and field values printed as text only

const HOSTILE = {
  referenceType: "web-page",
  authors: [{ given: "Ann", family: "O<b>Brien</b>" }],
  title: '<script>alert(1)</script> & "Q"',
  website: "Site <i>x</i>",
  date: "2020",
  url: "https://example.test/a?b=<b>x</b>&c=1",
} as const;

function unescapeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

async function renderedZipXml(
  zip: JSZip,
): Promise<{ all: string; rels: string }> {
  let all = "";
  let rels = "";
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    const content = await zip.file(name)?.async("string");
    if (content === undefined) continue;
    if (name.endsWith(".rels")) rels += content;
    else if (name.endsWith(".xml")) all += content;
  }
  return { all, rels };
}

describe("a URL and a field value are printed as text, never as a link or markup", () => {
  it("DOCX: no hyperlink element or relationship, markup escaped, URL text present", async () => {
    tenantState.root = await tmp("gw-cite-sec-docx-");
    const seeded = await seedProject(tenantState.root, HOSTILE);
    const res = await docxPOST(sendDocx(compileBody(seeded)));
    expect(res.status).toBe(200);
    const { all, rels } = await renderedZipXml(
      await JSZip.loadAsync(await res.arrayBuffer()),
    );
    // Non-vacuity: the hostile values reached the document, as text.
    const flat = unescapeXml(all.replace(/<[^>]+>/g, ""));
    expect(flat).toContain("https://example.test/a?b=");
    expect(flat).toContain("alert(1)");
    expect(flat).toContain("<script>");
    expect(flat).toContain("<b>x</b>");
    expect(all).toContain("&lt;script&gt;");
    expect(all).toContain("&amp;c=1");
    // No markup was produced from a value, and no link was made.
    expect(all).not.toMatch(/<script\b/i);
    expect(all).not.toMatch(/<b>x<\/b>/);
    expect(all).not.toMatch(/<w:hyperlink\b/);
    expect(all).not.toMatch(/<w:fldSimple\b|w:instrText[^>]*>[^<]*HYPERLINK/i);
    expect(rels).not.toMatch(/relationships\/hyperlink/i);
    expect(rels).not.toMatch(/TargetMode="External"/);
    expect(rels).not.toContain("example.test");
  });

  it("DOCX: a javascript: URL is text too", async () => {
    tenantState.root = await tmp("gw-cite-sec-docx-js-");
    const seeded = await seedProject(tenantState.root, {
      ...HOSTILE,
      url: "javascript:alert(document.cookie)",
    });
    const res = await docxPOST(sendDocx(compileBody(seeded)));
    const { all, rels } = await renderedZipXml(
      await JSZip.loadAsync(await res.arrayBuffer()),
    );
    expect(unescapeXml(all.replace(/<[^>]+>/g, ""))).toContain(
      "javascript:alert(",
    );
    expect(all).not.toMatch(/<w:hyperlink\b/);
    expect(rels).not.toMatch(/javascript:|hyperlink/i);
  });

  it("PDF: the URL is in the page text and no page carries a link annotation or URI action", async () => {
    tenantState.root = await tmp("gw-cite-sec-pdf-");
    const seeded = await seedProject(tenantState.root, HOSTILE);
    const res = await pdfPOST(sendPdf(compileBody(seeded)));
    expect(res.status).toBe(200);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const text = (await extractPdfPageTexts(bytes)).join("\n");
    const squashed = text.replace(/\s+/g, "");
    // Non-vacuity: the hostile values reached the PDF, as characters.
    expect(squashed).toContain("https://example.test/a?b=<b>x</b>&c=1");
    expect(squashed).toContain("<script>alert(1)</script>");
    // pdfjs reads every annotation of every page; none is a link.
    const task = getDocument({
      data: new Uint8Array(bytes),
      useSystemFonts: false,
      verbosity: 0,
    });
    try {
      const doc = await task.promise;
      let annotationCount = 0;
      for (let n = 1; n <= doc.numPages; n += 1) {
        const page = await doc.getPage(n);
        const annotations = await page.getAnnotations();
        annotationCount += annotations.length;
        for (const a of annotations as { subtype?: string; url?: string }[]) {
          expect(a.subtype).not.toBe("Link");
          expect(a.url).toBeUndefined();
        }
      }
      expect(annotationCount).toBe(0);
    } finally {
      await task.destroy();
    }
    const raw = Buffer.from(bytes).toString("latin1");
    expect(raw).not.toMatch(/\/URI\b|\/Subtype\s*\/Link/);
  });
});

// -------------------------------------------- 9. no network, engine or loader

describe("the engine and the style loader make no network request", () => {
  it("static: neither source names a network API", async () => {
    for (const file of [
      "src/lib/citations/citation-engine.ts",
      "src/lib/citations/style-loader.ts",
    ]) {
      const code = (await fs.readFile(path.join(FRONTEND, file), "utf8"))
        // Comments describe the browser asset path; only code is scanned.
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // `init()` with no bytes is the browser path (a same-origin asset fetch
      // inside the glue); the server compile passes bytes, shown below.
      expect(code, file).not.toMatch(
        /\bfetch\s*\(|XMLHttpRequest|node:https?|node:net|WebSocket|sendBeacon|https?:\/\//,
      );
    }
  });

  it("a real DOCX and PDF compile with citations, a style load and a render open no connection", async () => {
    const calls: string[] = [];
    const record = (name: string) => (): never => {
      calls.push(name);
      throw new Error(`network: ${name}`);
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(record("fetch") as never);
    vi.spyOn(http, "request").mockImplementation(
      record("http.request") as never,
    );
    vi.spyOn(http, "get").mockImplementation(record("http.get") as never);
    vi.spyOn(https, "request").mockImplementation(
      record("https.request") as never,
    );
    vi.spyOn(https, "get").mockImplementation(record("https.get") as never);
    vi.spyOn(net, "connect").mockImplementation(record("net.connect") as never);
    vi.spyOn(net.Socket.prototype, "connect").mockImplementation(
      record("socket.connect") as never,
    );

    tenantState.root = await tmp("gw-cite-sec-net-");
    const seeded = await seedProject(tenantState.root, HOSTILE);
    const style = await loadBundledStyle(STYLE_ID);
    expect(style.ok).toBe(true);
    expect((await docxPOST(sendDocx(compileBody(seeded)))).status).toBe(200);
    expect((await pdfPOST(sendPdf(compileBody(seeded)))).status).toBe(200);
    expect(
      (
        await checkPOST(
          sendCheck({
            projectId: seeded.projectId,
            resourceIds: [seeded.chapter],
          }),
        )
      ).status,
    ).toBe(200);

    // Non-vacuity: the engine really ran, and the guard would have seen a call.
    expect(vi.mocked(renderCitations)).toHaveBeenCalled();
    expect(() => http.get("http://example.test")).toThrow("network: http.get");
    calls.length = 0;
    expect(calls).toEqual([]);
  });
});
