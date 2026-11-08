/**
 * Route-level enforcement of the paired-device limits (Feature 77, Task 12;
 * FR-9, FR-12, FR-31). A text-match walk of every file under app/ and src/,
 * in the style of sharing-no-device-routes.test.ts; TypeScript is not parsed.
 *
 * - Each limited route imports and calls the shared check before its work.
 * - Under app/, only the pairing route (its existing allowance) and the five
 *   limits routes import lib/sharing, and each of the five imports only the
 *   check, the reader and the copy module.
 * - Nothing under app/ or src/ imports an electron/ path or the main-side
 *   limits writer, and no limits route handles a method that writes.
 * - Routes outside the limited set do not call the check; the limits modules
 *   do not name the credential store.
 */
import { afterEach, describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import { NextRequest } from "next/server";

const FRONTEND = path.resolve(__dirname, "../..");
const APP_ROOT = path.join(FRONTEND, "app");
const SRC_ROOT = path.join(FRONTEND, "src");
const API_ROOT = path.join(APP_ROOT, "api");

/** FR-11: routes that call the shared check before their work. */
const LIMITED_ROUTES: Record<string, RegExp> = {
  "encryption/route.ts":
    /await enforceEncryptionLimits\(request\)[\s\S]*assertEncryptionAvailable\(\)/,
  "project/[project-id]/trash/purge/route.ts":
    /checkLimit\(req, "permanentDeletion"\) \?\? /,
  "project/delete/route.ts": /checkLimit\(req, "projectDeletion"\) \?\? /,
  "resource/revision/[resource-id]/route.ts":
    /checkLimit\(\s*req,\s*"permanentDeletion",[^)]*\)\s*\?\? /,
  // Feature 103, FR-13, OQ-10: an annotation delete is permanent (no Trash).
  "annotations/route.ts": /checkLimit\(req, "permanentDeletion"\) \?\? /,
};
/** The read route (Task 13); allowed to exist or not. */
const LIMITS_READ_ROUTE = "sharing/limits/route.ts";
const LIMITS_ROUTES = new Set([
  ...Object.keys(LIMITED_ROUTES),
  LIMITS_READ_ROUTE,
]);
/** Feature 96: refuses every paired caller on every method; imports only the check. */
const USER_WORD_LIST_ROUTE = "user-word-list/route.ts";
/** The only lib/sharing modules a limits route may import. */
const ALLOWED_MODULES = new Set([
  "limits-check",
  "limits-store",
  "limits-copy",
]);
/** The pairing route keeps its existing allowance (any lib/sharing module). */
const PAIR_ROUTE = "sharing/pair/route.ts";
/** FR-12: routes that must NOT call the check. */
const UNLIMITED_ROUTES = [
  "project/[project-id]/trash/route.ts",
  "project/[project-id]/trash/restore/route.ts",
  "folder/[folder-id]/delete/route.ts",
  "resource/[resource-id]/delete/route.ts",
  // Feature 99, FR-10: editing the status list (a `statuses` body) is allowed
  // on a paired device, as the subtype list is; it is not a limit.
  "project/features/route.ts",
];

function walk(dir: string, accept: (name: string) => boolean): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, accept);
    return accept(entry.name) ? [full] : [];
  });
}

const relTo = (root: string, file: string): string =>
  path.relative(root, file).split(path.sep).join("/");
const read = (file: string): string => fs.readFileSync(file, "utf8");

/** Module names imported from lib/sharing/, by import specifier text. */
function sharingImports(text: string): string[] {
  const names: string[] = [];
  const re = /from\s+["'][^"']*lib\/sharing\/([^"']+)["']/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) names.push(m[1]);
  return names;
}

const routes = walk(API_ROOT, (n) => n === "route.ts");
const appFiles = walk(APP_ROOT, (n) => /\.tsx?$/.test(n));
const srcFiles = walk(SRC_ROOT, (n) => /\.tsx?$/.test(n));

describe("limited routes call the shared check", () => {
  it("the walk is not vacuous", () => {
    expect(routes.length).toBeGreaterThan(20);
    const names = routes.map((f) => relTo(API_ROOT, f));
    for (const name of Object.keys(LIMITED_ROUTES))
      expect(names).toContain(name);
  });

  it.each(Object.keys(LIMITED_ROUTES))(
    "%s imports and calls the check first",
    (name) => {
      const text = read(path.join(API_ROOT, name));
      expect(sharingImports(text)).toContain("limits-check");
      expect(text).toMatch(/import \{[^}]*\bcheckLimit\b[^}]*\} from/);
      expect(text).toMatch(LIMITED_ROUTES[name]);
    },
  );
});

describe("lib/sharing imports from app/", () => {
  it("only the pair route and the limits routes import lib/sharing", () => {
    const offenders = appFiles
      .filter((f) => sharingImports(read(f)).length > 0)
      .map((f) => relTo(APP_ROOT, f))
      .filter(
        (n) =>
          n !== `api/${PAIR_ROUTE}` &&
          n !== `api/${USER_WORD_LIST_ROUTE}` &&
          !LIMITS_ROUTES.has(n.replace(/^api\//, "")),
      );
    expect(offenders).toEqual([]);
  });

  it.each([...LIMITS_ROUTES])(
    "%s imports only the check, the reader and the copy",
    (name) => {
      const file = path.join(API_ROOT, name);
      if (!fs.existsSync(file)) return; // the read route arrives in Task 13
      const imported = sharingImports(read(file));
      expect(imported.filter((m) => !ALLOWED_MODULES.has(m))).toEqual([]);
    },
  );
});

describe("user word list route (Feature 96)", () => {
  it("imports only limits-check and calls checkUserWordListAccess on every method", () => {
    const text = read(path.join(API_ROOT, USER_WORD_LIST_ROUTE));
    expect(sharingImports(text)).toEqual(["limits-check"]);
    expect(text.match(/checkUserWordListAccess\(request\)/g)).toHaveLength(2);
    expect(text).toMatch(/export const GET = withStorageContext/);
    expect(text).toMatch(/export const POST = withStorageContext/);
    expect(text).toMatch(/export const DELETE = withStorageContext/);
  });
});

describe("no writer, no electron import, no writing method", () => {
  it("no file under app/ or src/ imports an electron/ path or the main-side writer", () => {
    const offenders = [...appFiles, ...srcFiles]
      .filter((f) => /from\s+["'][^"']*(\belectron\/|limits-ipc)/.test(read(f)))
      .map((f) => relTo(FRONTEND, f));
    expect(offenders).toEqual([]);
  });

  it("no limits route exports a method that writes", () => {
    for (const name of LIMITS_ROUTES) {
      const file = path.join(API_ROOT, name);
      if (name === "encryption/route.ts" || !fs.existsSync(file)) continue;
      const text = read(file);
      if (name === LIMITS_READ_ROUTE) {
        expect(text).not.toMatch(
          /export (async )?(function|const) (POST|PUT|PATCH|DELETE)\b/,
        );
      }
    }
  });

  it("nothing outside the limits modules writes sharing-limits.json", () => {
    const offenders = [...appFiles, ...srcFiles]
      .filter((f) => !relTo(SRC_ROOT, f).startsWith("lib/sharing/limits-"))
      .filter((f) => /sharing-limits\.json/.test(read(f)))
      .map((f) => relTo(FRONTEND, f));
    expect(offenders).toEqual([]);
  });
});

describe("routes outside the limited set", () => {
  it.each(UNLIMITED_ROUTES)("%s exists and does not call the check", (name) => {
    const file = path.join(API_ROOT, name);
    expect(fs.existsSync(file)).toBe(true);
    expect(read(file)).not.toMatch(/checkLimit|limits-check/);
  });

  it("GET /api/encryption does not call the check (the call is inside the POST path)", () => {
    const text = read(path.join(API_ROOT, "encryption/route.ts"));
    expect(text).toMatch(
      /export const GET = withStorageContext\(getEncryptionStatus\)/,
    );
    const start = text.indexOf("function getEncryptionStatus");
    expect(start).toBeGreaterThan(-1);
    const slice = text.slice(start, text.indexOf("\n}\n", start));
    expect(slice).not.toMatch(/checkLimit|enforceEncryptionLimits/);
  });

  it("sharing-limits has exactly the five switches; none is added for statuses (Feature 99, FR-10)", () => {
    const text = read(path.join(SRC_ROOT, "lib/sharing/limits-store.ts"));
    const block = /const LIMIT_KEYS = \[([\s\S]*?)\] as const/.exec(text);
    expect(block).not.toBeNull();
    const keys = [...(block as RegExpExecArray)[1].matchAll(/"([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(keys).toEqual([
      "projectDeletion",
      "unlocking",
      "locking",
      "encryptionChanges",
      "permanentDeletion",
    ]);
  });

  it("only the limited routes (and the read route) call checkLimit", () => {
    const callers = routes
      .filter((f) => /\bcheckLimit\(/.test(read(f)))
      .map((f) => relTo(API_ROOT, f))
      .filter((n) => !LIMITS_ROUTES.has(n));
    expect(callers).toEqual([]);
  });
});

describe("limits modules and the credential store", () => {
  it.each(["limits-check", "limits-store", "limits-copy"])(
    "%s does not name the credential store",
    (m) => {
      const text = read(path.join(SRC_ROOT, "lib/sharing", `${m}.ts`));
      expect(text).not.toMatch(/credential-store|device-credentials/);
    },
  );
});

describe("annotations DELETE and permanentDeletion (Feature 103, FR-13, OQ-10)", () => {
  const ENDPOINT = "http://localhost/api/annotations";
  const NOTE_ID = "3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b";
  const tmpDirs: string[] = [];
  const originalProjects = process.env.GETWRITE_PROJECTS_DIR;
  const originalSharing = process.env.GETWRITE_SHARING_DIR;

  afterEach(() => {
    for (const dir of tmpDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    if (originalProjects === undefined)
      delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = originalProjects;
    if (originalSharing === undefined) delete process.env.GETWRITE_SHARING_DIR;
    else process.env.GETWRITE_SHARING_DIR = originalSharing;
  });

  function limitsText(permanentDeletion: boolean): string {
    return JSON.stringify({
      version: 1,
      limits: {
        projectDeletion: true,
        unlocking: true,
        locking: true,
        encryptionChanges: true,
        permanentDeletion,
      },
    });
  }

  /** A project with one text resource carrying one plain note. */
  async function seed(
    permanentDeletion: boolean,
  ): Promise<{ projectId: string; resourceId: string; sidecarFile: string }> {
    const { writeSidecar } = await import("../../src/lib/models/sidecar");
    const { generateUUID } = await import("../../src/lib/models/uuid");
    type MetadataValue = import("../../src/lib/models/types").MetadataValue;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-ann-limit-"));
    tmpDirs.push(dir);
    fs.writeFileSync(
      path.join(dir, "sharing-limits.json"),
      limitsText(permanentDeletion),
    );
    process.env.GETWRITE_SHARING_DIR = dir;
    const projectId = generateUUID();
    const resourceId = generateUUID();
    const root = path.join(dir, projectId);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, "project.json"),
      JSON.stringify({ id: projectId, name: "p", config: {} }),
    );
    process.env.GETWRITE_PROJECTS_DIR = dir;
    const stamp = "1970-01-01T00:00:00.000Z";
    const sidecar: Record<string, MetadataValue> = {
      id: resourceId,
      slug: "r",
      type: "text",
      name: "R",
      orderIndex: 0,
      folderId: null,
      createdAt: stamp,
      updatedAt: stamp,
      wordCount: 4,
      annotations: [
        {
          id: NOTE_ID,
          body: "a plain note",
          quote: "quoted",
          createdAt: stamp,
          updatedAt: stamp,
        },
      ],
    } as unknown as Record<string, MetadataValue>;
    await writeSidecar(root, resourceId, sidecar);
    return {
      projectId,
      resourceId,
      sidecarFile: path.join(root, "meta", `resource-${resourceId}.meta.json`),
    };
  }

  function deleteRequest(
    body: { projectId: string; resourceId: string },
    classification?: string,
  ): NextRequest {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (classification !== undefined) {
      headers["x-getwrite-classification"] = classification;
    }
    return new NextRequest(ENDPOINT, {
      method: "DELETE",
      headers,
      body: JSON.stringify({ ...body, annotationId: NOTE_ID }),
    });
  }

  const noteCount = (file: string): number =>
    (JSON.parse(fs.readFileSync(file, "utf8")) as { annotations: unknown[] })
      .annotations.length;

  it("refuses a paired device with the limit on: 403 { error, limit }, note untouched", async () => {
    const { projectId, resourceId, sidecarFile } = await seed(true);
    const { DELETE } = await import("../../app/api/annotations/route");
    const res = await DELETE(
      deleteRequest({ projectId, resourceId }, "confirmed:d1"),
    );
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: string; limit: string };
    expect(Object.keys(json).sort()).toEqual(["error", "limit"]);
    expect(json.limit).toBe("permanentDeletion");
    expect(noteCount(sidecarFile)).toBe(1);
  });

  it("refuses a request with no classification header (fail closed)", async () => {
    const { projectId, resourceId, sidecarFile } = await seed(false);
    const { DELETE } = await import("../../app/api/annotations/route");
    const res = await DELETE(deleteRequest({ projectId, resourceId }));
    expect(res.status).toBe(403);
    expect(noteCount(sidecarFile)).toBe(1);
  });

  it("deletes for the window even with the limit on", async () => {
    const { projectId, resourceId, sidecarFile } = await seed(true);
    const { DELETE } = await import("../../app/api/annotations/route");
    const res = await DELETE(
      deleteRequest({ projectId, resourceId }, "window"),
    );
    expect(res.status).toBe(200);
    expect(noteCount(sidecarFile)).toBe(0);
  });

  it("deletes for a paired device when the limit is off", async () => {
    const { projectId, resourceId, sidecarFile } = await seed(false);
    const { DELETE } = await import("../../app/api/annotations/route");
    const res = await DELETE(
      deleteRequest({ projectId, resourceId }, "confirmed:d1"),
    );
    expect(res.status).toBe(200);
    expect(noteCount(sidecarFile)).toBe(0);
  });

  it("leaves GET, POST, PUT and PATCH unlimited", () => {
    const text = read(path.join(API_ROOT, "annotations/route.ts"));
    expect(text.match(/checkLimit\(/g)).toHaveLength(1);
    expect(text).toMatch(/export const GET = withStorageContext\(handleGet\)/);
  });
});
