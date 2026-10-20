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

import {
  httpProjectTypesTransport,
  projectTypeListNotice,
  type ProjectTypeList,
} from "../../src/lib/api/project-types";
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

const listBody = (over: Record<string, unknown> = {}) => ({
  entries: [
    { spec: validProjectType, fileName: "novel.json", source: "built-in" },
    {
      spec: { ...validProjectType, id: "mine", name: "Mine" },
      fileName: "mine.json",
      source: "saved",
    },
  ],
  unusable: [{ fileName: "broken.json", reason: "unparseable" }],
  savedStatus: "ok",
  ...over,
});

describe("httpProjectTypesTransport.list", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns entries, unusable files and saved status from a well-formed response", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(listBody()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await httpProjectTypesTransport.list();

    expect(
      result.entries.map((e) => [e.spec.id, e.source, e.fileName]),
    ).toEqual([
      ["novel", "built-in", "novel.json"],
      ["mine", "saved", "mine.json"],
    ]);
    expect(result.unusable).toEqual([
      { fileName: "broken.json", reason: "unparseable" },
    ]);
    expect(result.savedStatus).toBe("ok");
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("carries a not-configured and an unreadable status through", async () => {
    for (const savedStatus of ["not-configured", "unreadable"]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(listBody({ savedStatus }))),
      );
      expect((await httpProjectTypesTransport.list()).savedStatus).toBe(
        savedStatus,
      );
    }
  });

  it("throws on a non-ok HTTP response without validating the body", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpProjectTypesTransport.list()).rejects.toThrow(
      "Failed to load project types (500)",
    );
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it.each([
    ["a bare array (the old shape)", [validProjectType]],
    [
      "an entry that fails the spec schema",
      listBody({
        entries: [
          {
            spec: { id: "Bad ID!", name: "Bad", folders: [] },
            fileName: "x.json",
            source: "saved",
          },
        ],
      }),
    ],
    ["a missing savedStatus", { entries: [], unusable: [] }],
    ["an unknown savedStatus", listBody({ savedStatus: "weird" })],
  ])("reports and throws on %s, never an empty list", async (_label, body) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));

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

describe("httpProjectTypesTransport writes (Feature 90, FR-8)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const spec = { ...validProjectType, id: "mine", name: "Mine" };
  const refusalBody = (
    reason: string,
    extra: Record<string, unknown> = {},
  ) => ({ error: `msg for ${reason}`, reason, ...extra });

  it("create posts the whole spec once and returns fileName and spec", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ fileName: "mine.json", spec }, true, 201),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await httpProjectTypesTransport.create(spec);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/project-types");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(spec);
    expect(result).toMatchObject({ ok: true, fileName: "mine.json" });
    expect(result.ok && result.spec?.id).toBe("mine");
  });

  it("update puts to the encoded path id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ fileName: "mine.json", spec }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await httpProjectTypesTransport.update("mine", spec);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/project-types/mine");
    expect(init.method).toBe("PUT");
    expect(result.ok).toBe(true);
  });

  it("remove deletes and returns fileName only", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ fileName: "mine.json" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await httpProjectTypesTransport.remove("mine");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/project-types/mine");
    expect(init.method).toBe("DELETE");
    expect(result).toEqual({ ok: true, fileName: "mine.json" });
  });

  it.each([
    ["invalid", 400],
    ["id-clash", 409],
    ["built-in", 403],
    ["not-found", 404],
    ["write-failed", 500],
    ["saving-unavailable", 503],
  ])(
    "returns a %s (%i) response as a refusal value",
    async (reason, status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(jsonResponse(refusalBody(reason), false, status)),
      );

      const result = await httpProjectTypesTransport.create(spec);

      expect(result).toEqual({
        ok: false,
        reason,
        message: `msg for ${reason}`,
      });
      expect(reportTransportValidationFailure).not.toHaveBeenCalled();
    },
  );

  it("carries fieldErrors through on an invalid refusal", async () => {
    const fieldErrors = { "statuses.0": "Status label must not be blank." };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(refusalBody("invalid", { fieldErrors }), false, 400),
        ),
    );

    const result = await httpProjectTypesTransport.create(spec);

    expect(result).toEqual({
      ok: false,
      reason: "invalid",
      message: "msg for invalid",
      fieldErrors,
    });
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("carries conflictsWith through on a name clash", async () => {
    const conflictsWith = { id: "novel", name: "Novel", source: "built-in" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(
            refusalBody("name-clash", { conflictsWith }),
            false,
            409,
          ),
        ),
    );

    const result = await httpProjectTypesTransport.create(spec);

    expect(result).toMatchObject({ ok: false, reason: "name-clash" });
    expect(!result.ok && result.conflictsWith).toEqual(conflictsWith);
  });

  it.each([
    ["a 201 without a spec", { fileName: "mine.json" }, true, 201],
    [
      "a 201 whose spec fails the schema",
      {
        fileName: "mine.json",
        spec: { id: "Bad ID!", name: "x", folders: [] },
      },
      true,
      201,
    ],
    [
      "a refusal status with an unknown reason",
      refusalBody("weird"),
      false,
      409,
    ],
    ["a refusal status with no body shape", { nope: 1 }, false, 500],
  ])(
    "reports and throws on %s, never success",
    async (_l, body, ok, status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(body, ok, status)),
      );

      await expect(httpProjectTypesTransport.create(spec)).rejects.toThrow();
      expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
      expect(reportTransportValidationFailure).toHaveBeenCalledWith(
        "project-types.create",
        expect.any(Array),
      );
    },
  );
});

describe("projectTypeListNotice", () => {
  const base: ProjectTypeList = {
    entries: [],
    unusable: [],
    savedStatus: "ok",
  };

  it("is null when nothing is wrong", () => {
    expect(projectTypeListNotice(base)).toBeNull();
    expect(
      projectTypeListNotice({ ...base, savedStatus: "not-configured" }),
    ).toBeNull();
  });

  it("names unusable files by count and an unreadable saved directory", () => {
    expect(
      projectTypeListNotice({
        ...base,
        unusable: [{ fileName: "a.json", reason: "invalid" }],
      }),
    ).toBe("1 saved project type file could not be used.");
    expect(
      projectTypeListNotice({
        ...base,
        unusable: [
          { fileName: "a.json", reason: "invalid" },
          { fileName: "b.json", reason: "unreadable" },
        ],
      }),
    ).toBe("2 saved project type files could not be used.");
    expect(projectTypeListNotice({ ...base, savedStatus: "unreadable" })).toBe(
      "Saved project types could not be read.",
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
