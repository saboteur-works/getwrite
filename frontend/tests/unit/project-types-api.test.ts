/**
 * Regression coverage for `src/lib/api/project-types.ts`'s
 * `httpProjectTypesTransport.list` (Feature 48, Task 4): the response body
 * must be validated against the existing `ProjectTypeSchema`
 * (`src/lib/models/schemas.ts`) before being handed back to callers.
 *
 * This is a separate file from `tests/unit/project-types.test.ts`, which
 * covers the unrelated `src/lib/projectTypes` on-disk template loader, not
 * this HTTP transport module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fsp from "node:fs/promises";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { httpProjectTypesTransport } from "../../src/lib/api/project-types";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

const validProjectType = {
  id: "novel",
  name: "Novel",
  folders: [{ name: "Workspace" }, { name: "Chapters" }],
};

describe("httpProjectTypesTransport.list", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed list on a well-formed 2xx response", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse([validProjectType]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await httpProjectTypesTransport.list();

    expect(result).toEqual([validProjectType]);
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("returns the specs from the list-object response (Feature 90 route shape)", async () => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          entries: [
            {
              spec: validProjectType,
              fileName: "novel.json",
              source: "built-in",
            },
          ],
          unusable: [],
          savedStatus: "ok",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    expect(await httpProjectTypesTransport.list()).toEqual([validProjectType]);
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("throws on a non-ok HTTP response without validating the body", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpProjectTypesTransport.list()).rejects.toThrow(
      "Failed to load project types (500)",
    );
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("reports and throws on a malformed body despite a 2xx response", async () => {
    const malformed = [{ id: "Bad ID!", name: "Bad", folders: [] }];
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(malformed));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpProjectTypesTransport.list()).rejects.toThrow(
      "Invalid project types response shape",
    );
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "project-types.list",
      expect.any(Array),
    );
  });
});

describe("GET /api/project-types (resolver-backed, FR-3 / FR-6)", () => {
  const KEYS = [
    "GETWRITE_PROJECT_TYPES_DIR",
    "GETWRITE_TEMPLATES_DIR",
    "GETWRITE_SAVED_PROJECT_TYPES_DIR",
  ] as const;
  const original: Record<string, string | undefined> = {};
  let root: string;
  let builtInDir: string;
  let savedDir: string;

  const spec = (id: string) => ({
    id,
    name: id,
    folders: [{ name: "Workspace" }],
  });

  beforeEach(async () => {
    for (const k of KEYS) original[k] = process.env[k];
    root = await fsp.mkdtemp(path.join(os.tmpdir(), "gw-route-"));
    builtInDir = path.join(root, "built-in");
    savedDir = path.join(root, "saved");
    await fsp.mkdir(builtInDir);
    await fsp.mkdir(savedDir);
    delete process.env.GETWRITE_TEMPLATES_DIR;
    process.env.GETWRITE_PROJECT_TYPES_DIR = builtInDir;
    process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = savedDir;
    const { clearProjectTypeCache } =
      await import("../../src/lib/projectTypes");
    clearProjectTypeCache();
  });

  afterEach(async () => {
    for (const k of KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
    await fsp.rm(root, { recursive: true, force: true });
  });

  async function get(): Promise<{
    entries: { spec: { id: string }; fileName: string; source: string }[];
    unusable: { fileName: string; reason: string }[];
    savedStatus: string;
  }> {
    const { GET } = await import("../../app/api/project-types/route");
    const response = await GET();
    expect(response.status).toBe(200);
    return response.json();
  }

  it("returns built-in and saved entries with source, unusable files and status", async () => {
    await fsp.writeFile(
      path.join(builtInDir, "novel.json"),
      JSON.stringify(spec("novel")),
    );
    await fsp.writeFile(
      path.join(savedDir, "mine.json"),
      JSON.stringify(spec("mine")),
    );
    await fsp.writeFile(path.join(savedDir, "broken.json"), "{ not json");

    const body = await get();

    expect(body.entries.map((e) => [e.spec.id, e.source])).toEqual([
      ["novel", "built-in"],
      ["mine", "saved"],
    ]);
    expect(body.unusable).toEqual([
      { fileName: "broken.json", reason: "unparseable" },
    ]);
    expect(body.savedStatus).toBe("ok");
  });

  it("does not expose server file paths", async () => {
    await fsp.writeFile(
      path.join(savedDir, "mine.json"),
      JSON.stringify(spec("mine")),
    );
    const text = JSON.stringify(await get());
    expect(text).not.toContain(root);
  });

  it("reports not-configured when the saved variable is unset", async () => {
    delete process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
    await fsp.writeFile(
      path.join(builtInDir, "novel.json"),
      JSON.stringify(spec("novel")),
    );
    const body = await get();
    expect(body.savedStatus).toBe("not-configured");
    expect(body.entries.map((e) => e.spec.id)).toEqual(["novel"]);
  });

  it("reads GETWRITE_PROJECT_TYPES_DIR, the variable the library reads", async () => {
    delete process.env.GETWRITE_TEMPLATES_DIR;
    await fsp.writeFile(
      path.join(builtInDir, "only-here.json"),
      JSON.stringify(spec("only-here")),
    );
    expect((await get()).entries.map((e) => e.spec.id)).toEqual(["only-here"]);
  });
});

describe("single project-type reader (FR-3 source-tree check)", () => {
  const FRONTEND = path.resolve(__dirname, "../..");
  const RESOLVER = path.join(FRONTEND, "src", "lib", "projectTypes.ts");
  const ROOTS = ["src", "app", "components"].map((d) => path.join(FRONTEND, d));

  function walk(dir: string, out: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(ts|tsx|mjs)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it("no file outside the resolver reads a project-type directory", () => {
    const files = ROOTS.flatMap((r) => walk(r, []));
    expect(files.length).toBeGreaterThan(100);
    const readsDir = /\breaddir\s*\(/;
    const namesTypeDir =
      /GETWRITE_(PROJECT_TYPES|TEMPLATES|SAVED_PROJECT_TYPES)_DIR|["']templates["']\s*,\s*["']project-types["']/;
    const offenders = files
      .filter((f) => f !== RESOLVER)
      .filter((f) => {
        const text = fs.readFileSync(f, "utf8");
        return readsDir.test(text) && namesTypeDir.test(text);
      })
      .map((f) => path.relative(FRONTEND, f));
    expect(offenders).toEqual([]);
  });
});
