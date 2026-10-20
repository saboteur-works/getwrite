/**
 * Feature 90, Task 19: the three write routes over the Task 18 core.
 * Every test uses throwaway directories under the OS temp folder.
 */
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST, GET } from "../../app/api/project-types/route";
import { PUT, DELETE } from "../../app/api/project-types/[id]/route";
import { clearProjectTypeCache } from "../../src/lib/projectTypes";
import { MAX_PROJECT_TYPE_ID_LENGTH } from "../../src/lib/project-types-write-core";
import {
  MAX_PROJECT_TYPE_BODY_BYTES,
  statusForRefusal,
} from "../../src/lib/project-types-write-http";

const ENV_KEYS = [
  "GETWRITE_SAVED_PROJECT_TYPES_DIR",
  "GETWRITE_PROJECT_TYPES_DIR",
  "GETWRITE_TEMPLATES_DIR",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
] as const;

function spec(id: string, name: string): Record<string, unknown> {
  return { id, name, folders: [{ name: "Workspace" }] };
}

function post(body: unknown): Request {
  return new Request("http://localhost/api/project-types", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function put(id: string, body: unknown): Request {
  return new Request(`http://localhost/api/project-types/${id}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

describe("project-types write routes (Task 19)", () => {
  let root: string;
  let savedDir: string;
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(async () => {
    for (const k of ENV_KEYS) originalEnv[k] = process.env[k];
    root = await fsp.mkdtemp(path.join(os.tmpdir(), "gw-ptroute-"));
    const builtInDir = path.join(root, "builtin");
    savedDir = path.join(root, "saved");
    await fsp.mkdir(builtInDir);
    await fsp.writeFile(
      path.join(builtInDir, "novel.json"),
      JSON.stringify(spec("novel", "Novel")),
    );
    delete process.env.GETWRITE_TEMPLATES_DIR;
    delete process.env.DATABASE_URL;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.GETWRITE_PROJECT_TYPES_DIR = builtInDir;
    process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR = savedDir;
    clearProjectTypeCache();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
    await fsp.rm(root, { recursive: true, force: true });
    clearProjectTypeCache();
  });

  async function savedFiles(): Promise<string[]> {
    return fsp.readdir(savedDir).catch(() => []);
  }

  describe("POST", () => {
    it("creates a type and returns 201 with fileName and spec", async () => {
      const res = await POST(post(spec("mine", "Mine")));
      expect(res.status).toBe(201);
      expect(await res.json()).toEqual({
        fileName: "mine.json",
        spec: { ...spec("mine", "Mine") },
      });
      expect(await savedFiles()).toEqual(["mine.json"]);
      const written = JSON.parse(
        await fsp.readFile(path.join(savedDir, "mine.json"), "utf8"),
      );
      expect(written.id).toBe("mine");
    });

    const badIds = [
      "../x",
      "a/b",
      "%2e%2e",
      "",
      "a".repeat(MAX_PROJECT_TYPE_ID_LENGTH + 1),
    ];
    for (const id of badIds) {
      it(`refuses id ${JSON.stringify(id.slice(0, 20))} with 400 and writes no file`, async () => {
        const res = await POST(post(spec(id, "Bad")));
        expect(res.status).toBe(400);
        expect((await res.json()).reason).toBe("invalid");
        expect(await savedFiles()).toEqual([]);
      });
    }

    it("refuses a body that fails a FR-28 rule with 400 and writes no file", async () => {
      for (const bad of [
        { ...spec("mine", "Mine"), statuses: ["Draft", ""] },
        { ...spec("mine", "  ") },
        { ...spec("mine", "Mine"), folders: [{ name: "A" }, { name: "A!" }] },
      ]) {
        const res = await POST(post(bad));
        expect(res.status).toBe(400);
        expect((await res.json()).reason).toBe("invalid");
      }
      expect(await savedFiles()).toEqual([]);
    });

    it("refuses a body with an extra key (no client path or source) with 400", async () => {
      for (const extra of [
        { source: "built-in" },
        { path: "/etc/x" },
        { fileName: "x.json" },
        { directory: "/tmp" },
      ]) {
        const res = await POST(post({ ...spec("mine", "Mine"), ...extra }));
        expect(res.status).toBe(400);
      }
      expect(await savedFiles()).toEqual([]);
    });

    it("refuses an oversize body with 400 before parsing it", async () => {
      const parse = vi.spyOn(JSON, "parse");
      const big = JSON.stringify({
        ...spec("mine", "Mine"),
        description: "x".repeat(MAX_PROJECT_TYPE_BODY_BYTES + 10),
      });
      const res = await POST(post(big));
      expect(res.status).toBe(400);
      expect((await res.json()).reason).toBe("invalid");
      expect(
        parse.mock.calls.some(
          (c) => typeof c[0] === "string" && c[0].length > 100_000,
        ),
      ).toBe(false);
      expect(await savedFiles()).toEqual([]);
    });

    it("refuses a declared content-length over the cap without reading", async () => {
      const req = new Request("http://localhost/api/project-types", {
        method: "POST",
        headers: { "content-length": String(MAX_PROJECT_TYPE_BODY_BYTES + 1) },
        body: JSON.stringify(spec("mine", "Mine")),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(await savedFiles()).toEqual([]);
    });

    it("refuses an oversize body that declares no content-length", async () => {
      const chunk = new TextEncoder().encode("x".repeat(64 * 1024));
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (let i = 0; i < 6; i += 1) controller.enqueue(chunk);
          controller.close();
        },
      });
      const req = new Request("http://localhost/api/project-types", {
        method: "POST",
        body: stream,
        duplex: "half",
      } as RequestInit);
      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(await savedFiles()).toEqual([]);
    });

    it("refuses malformed JSON and non-object bodies with 400", async () => {
      for (const body of ["{ nope", "[]", "null", '"s"', ""]) {
        const res = await POST(post(body));
        expect(res.status).toBe(400);
      }
      expect(await savedFiles()).toEqual([]);
    });

    it("returns 409 { error, reason, conflictsWith } for an id clash", async () => {
      const res = await POST(post(spec("novel", "Something")));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: "Novel (built-in) already uses this id.",
        reason: "id-clash",
        conflictsWith: { id: "novel", name: "Novel", source: "built-in" },
      });
    });

    it("returns 409 naming the built-in type for a name clash with a built-in", async () => {
      const res = await POST(post(spec("probe", " novel ")));
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({
        error: "Novel (built-in) already uses this name.",
        reason: "name-clash",
        conflictsWith: { id: "novel", name: "Novel", source: "built-in" },
      });
    });

    it("returns 409 for a name clash", async () => {
      await POST(post(spec("mine", "Mine")));
      const res = await POST(post(spec("other", "  MINE ")));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.reason).toBe("name-clash");
      expect(body.error).toBe("Mine (saved) already uses this name.");
      expect(body.conflictsWith).toEqual({
        id: "mine",
        name: "Mine",
        source: "saved",
      });
      expect(await savedFiles()).toEqual(["mine.json"]);
    });

    it("returns saving-unavailable (503) with its message when unconfigured", async () => {
      delete process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
      const res = await POST(post(spec("mine", "Mine")));
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({
        error: "Saving project types is not available here.",
        reason: "saving-unavailable",
      });
    });
  });

  describe("PUT", () => {
    it("replaces a saved type and returns 200 with fileName and spec", async () => {
      await POST(post(spec("mine", "Mine")));
      const res = await PUT(put("mine", spec("mine", "Renamed")), ctx("mine"));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.fileName).toBe("mine.json");
      expect(body.spec.name).toBe("Renamed");
      const written = JSON.parse(
        await fsp.readFile(path.join(savedDir, "mine.json"), "utf8"),
      );
      expect(written.name).toBe("Renamed");
    });

    it("refuses a path id that differs from the body id with 400 and writes nothing", async () => {
      await POST(post(spec("mine", "Mine")));
      const res = await PUT(put("mine", spec("other", "Other")), ctx("mine"));
      expect(res.status).toBe(400);
      expect(await savedFiles()).toEqual(["mine.json"]);
      const res2 = await PUT(
        put("other", spec("mine", "Hijack")),
        ctx("other"),
      );
      expect(res2.status).toBe(400);
      const written = JSON.parse(
        await fsp.readFile(path.join(savedDir, "mine.json"), "utf8"),
      );
      expect(written.name).toBe("Mine");
    });

    it("refuses a body that fails a FR-28 rule with 400 and leaves the stored file unchanged", async () => {
      await POST(post(spec("mine", "Mine")));
      const res = await PUT(
        put("mine", { ...spec("mine", "Mine"), statuses: ["Draft", " draft"] }),
        ctx("mine"),
      );
      expect(res.status).toBe(400);
      expect(await savedFiles()).toEqual(["mine.json"]);
      const written = JSON.parse(
        await fsp.readFile(path.join(savedDir, "mine.json"), "utf8"),
      );
      expect(written.statuses).toBeUndefined();
    });

    it("refuses an unsafe path id, an extra key and an oversize body with 400", async () => {
      for (const id of ["..", "a/b", "", "a".repeat(65)]) {
        const res = await PUT(put("x", spec(id, "X")), ctx(id));
        expect(res.status).toBe(400);
      }
      await POST(post(spec("mine", "Mine")));
      const extra = await PUT(
        put("mine", { ...spec("mine", "Mine"), source: "saved" }),
        ctx("mine"),
      );
      expect(extra.status).toBe(400);
      const big = await PUT(
        put(
          "mine",
          JSON.stringify({
            ...spec("mine", "Mine"),
            description: "x".repeat(MAX_PROJECT_TYPE_BODY_BYTES + 10),
          }),
        ),
        ctx("mine"),
      );
      expect(big.status).toBe(400);
      expect(await savedFiles()).toEqual(["mine.json"]);
    });

    it("returns 404 for an unknown id, 403 for a built-in, 409 for a name clash", async () => {
      const nf = await PUT(put("ghost", spec("ghost", "Ghost")), ctx("ghost"));
      expect(nf.status).toBe(404);
      expect((await nf.json()).reason).toBe("not-found");
      const bi = await PUT(
        put("novel", spec("novel", "Novel 2")),
        ctx("novel"),
      );
      expect(bi.status).toBe(403);
      expect((await bi.json()).reason).toBe("built-in");
      await POST(post(spec("a", "Alpha")));
      await POST(post(spec("b", "Beta")));
      const clash = await PUT(put("b", spec("b", "alpha")), ctx("b"));
      expect(clash.status).toBe(409);
      const body = await clash.json();
      expect(body.reason).toBe("name-clash");
      expect(body.conflictsWith.id).toBe("a");
    });

    it("returns saving-unavailable (503) when unconfigured", async () => {
      delete process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
      const res = await PUT(put("mine", spec("mine", "Mine")), ctx("mine"));
      expect(res.status).toBe(503);
      expect((await res.json()).reason).toBe("saving-unavailable");
    });
  });

  describe("DELETE", () => {
    it("deletes a saved type with 200 { fileName }", async () => {
      await POST(post(spec("mine", "Mine")));
      const res = await DELETE(
        new Request("http://localhost/api/project-types/mine", {
          method: "DELETE",
        }),
        ctx("mine"),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ fileName: "mine.json" });
      expect(await savedFiles()).toEqual([]);
    });

    it("returns 403 with reason built-in for a built-in", async () => {
      const res = await DELETE(
        new Request("http://localhost/api/project-types/novel", {
          method: "DELETE",
        }),
        ctx("novel"),
      );
      expect(res.status).toBe(403);
      expect((await res.json()).reason).toBe("built-in");
    });

    it("returns 404 for an unknown id and 400 for unsafe ids", async () => {
      const req = () =>
        new Request("http://localhost/api/project-types/x", {
          method: "DELETE",
        });
      expect((await DELETE(req(), ctx("ghost"))).status).toBe(404);
      for (const id of ["..", "../x", "a/b", "", "a".repeat(65)]) {
        expect((await DELETE(req(), ctx(id))).status).toBe(400);
      }
    });

    it("returns saving-unavailable (503) when unconfigured", async () => {
      delete process.env.GETWRITE_SAVED_PROJECT_TYPES_DIR;
      const res = await DELETE(
        new Request("http://localhost/api/project-types/mine", {
          method: "DELETE",
        }),
        ctx("mine"),
      );
      expect(res.status).toBe(503);
    });
  });

  describe("contract", () => {
    it("maps every refusal reason to a status", () => {
      expect(statusForRefusal("invalid")).toBe(400);
      expect(statusForRefusal("id-clash")).toBe(409);
      expect(statusForRefusal("name-clash")).toBe(409);
      expect(statusForRefusal("built-in")).toBe(403);
      expect(statusForRefusal("not-found")).toBe(404);
      expect(statusForRefusal("unreadable")).toBe(500);
      expect(statusForRefusal("write-failed")).toBe(500);
      expect(statusForRefusal("saving-unavailable")).toBe(503);
    });

    it("GET is still exported beside POST", () => {
      expect(typeof GET).toBe("function");
    });

    it("route files do not use withStorageContext, read no client path, and explain why", async () => {
      const files = [
        path.resolve(__dirname, "../../app/api/project-types/route.ts"),
        path.resolve(__dirname, "../../app/api/project-types/[id]/route.ts"),
      ];
      for (const f of files) {
        const src = await fsp.readFile(f, "utf8");
        expect(src).not.toMatch(/import[^;]*withStorageContext/);
        expect(src).toMatch(/not wrapped by `withStorageContext`/);
        expect(src).not.toMatch(/body\.(source|path|fileName|dir)/);
      }
    });
  });
});
