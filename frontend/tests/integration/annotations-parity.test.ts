/**
 * Feature 101 Task 14 (FR-22, FR-11, FR-32): the annotation route family, the
 * HTTP client wired to the real route over a real temp directory, and the
 * native backend over a fake Capacitor filesystem. The same invalid input is
 * refused with the same message on both; the route maps refusals to 400/404 and
 * lets locked-access errors reach withStorageContext (401/409).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/annotations-core", async (importActual) => {
  const actual =
    await importActual<
      typeof import("../../src/lib/models/annotations-core")
    >();
  return { ...actual, listAnnotationsCore: vi.fn(actual.listAnnotationsCore) };
});

import { DELETE, GET, PATCH, POST, PUT } from "../../app/api/annotations/route";
import { httpAnnotationsTransport } from "../../src/lib/api/annotations";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { listAnnotationsCore } from "../../src/lib/models/annotations-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import { createNativeAnnotationsTransport } from "../../src/store/transport/native-annotations-backend";
import { removeDirRetry } from "../unit/helpers/fs-utils";

const NATIVE_DIR = "/projects";
const T0 = "1970-01-01T00:00:00.000Z";
const ENDPOINT = "http://localhost/api/annotations";

const tmpDirs: string[] = [];
const originalDir = process.env.GETWRITE_PROJECTS_DIR;

afterEach(async () => {
  vi.restoreAllMocks();
  vi.mocked(listAnnotationsCore).mockClear();
  if (originalDir === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalDir;
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

function sidecar(id: string, type: string): Record<string, MetadataValue> {
  return {
    id,
    slug: "r",
    type,
    name: "R",
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
    wordCount: 4,
  } as Record<string, MetadataValue>;
}

/** Seeds a project with a text resource and an image resource on disk. */
async function seedHttp(): Promise<{
  projectId: string;
  textId: string;
  imageId: string;
}> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-ann-parity-"));
  tmpDirs.push(dir);
  const projectId = generateUUID();
  const root = path.join(dir, projectId);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id: projectId, name: "p", config: {} }),
  );
  process.env.GETWRITE_PROJECTS_DIR = dir;
  const textId = generateUUID();
  const imageId = generateUUID();
  await writeSidecar(root, textId, sidecar(textId, "text"));
  await writeSidecar(root, imageId, sidecar(imageId, "image"));
  return { projectId, textId, imageId };
}

async function seedNative(): Promise<{
  nativeFs: ReturnType<typeof createFakeCapacitorFilesystem>;
  projectId: string;
  textId: string;
  imageId: string;
}> {
  const nativeFs = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(nativeFs);
  const projectId = generateUUID();
  await adapter.mkdir(path.join(NATIVE_DIR, projectId), { recursive: true });
  await adapter.writeFile(
    path.join(NATIVE_DIR, projectId, "project.json"),
    JSON.stringify({ id: projectId, name: "p", config: {} }),
  );
  const textId = generateUUID();
  const imageId = generateUUID();
  await adapter.mkdir(path.join(NATIVE_DIR, projectId, "meta"), {
    recursive: true,
  });
  for (const [id, type] of [
    [textId, "text"],
    [imageId, "image"],
  ] as const) {
    await adapter.writeFile(
      path.join(NATIVE_DIR, projectId, "meta", `resource-${id}.meta.json`),
      JSON.stringify(sidecar(id, type)),
    );
  }
  return { nativeFs, projectId, textId, imageId };
}

function request(method: string, body: unknown): NextRequest {
  return new NextRequest(ENDPOINT, {
    method,
    headers: {
      "Content-Type": "application/json",
      // The desktop window is never limited (Feature 103, FR-13).
      "x-getwrite-classification": "window",
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Routes the HTTP client's fetch to the real route handlers. */
function wireFetch(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const method = init?.method ?? "GET";
    const handlers: Record<string, (r: NextRequest) => Promise<Response>> = {
      GET,
      POST,
      PUT,
      PATCH,
      DELETE,
    };
    return handlers[method](
      new NextRequest(`http://localhost${String(url)}`, {
        method,
        headers: {
          ...(init?.headers as Record<string, string>),
          "x-getwrite-classification": "window",
        },
        body: init?.body as string | undefined,
      }),
    );
  });
}

async function message(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as Error).message;
  }
  return "NO ERROR";
}

describe("annotation routes", () => {
  it("adds, lists, updates and deletes through the route", async () => {
    const { projectId, textId } = await seedHttp();
    const id = generateUUID();
    const added = await POST(
      request("POST", {
        projectId,
        resourceId: textId,
        annotation: { id, body: "note", quote: "q" },
      }),
    );
    expect(added.status).toBe(200);
    const stored = (await added.json()).annotation;
    expect(stored.id).toBe(id);

    const list = await GET(
      new NextRequest(
        `${ENDPOINT}?projectId=${projectId}&resourceId=${textId}`,
      ),
    );
    expect(list.status).toBe(200);
    expect((await list.json()).annotations).toEqual([stored]);

    const updated = await PUT(
      request("PUT", {
        projectId,
        resourceId: textId,
        annotationId: id,
        body: "edited",
      }),
    );
    expect((await updated.json()).annotation.body).toBe("edited");

    const removed = await DELETE(
      request("DELETE", { projectId, resourceId: textId, annotationId: id }),
    );
    expect(removed.status).toBe(200);
    const after = await GET(
      new NextRequest(
        `${ENDPOINT}?projectId=${projectId}&resourceId=${textId}`,
      ),
    );
    expect((await after.json()).annotations).toEqual([]);
  });

  it("maps an invalid project id, resource id, body and non-text resource to 400 with a message", async () => {
    const { projectId, textId, imageId } = await seedHttp();
    const annotation = { id: generateUUID(), body: "n", quote: "q" };
    const cases: Response[] = [
      await POST(
        request("POST", { projectId: "nope", resourceId: textId, annotation }),
      ),
      await POST(
        request("POST", { projectId, resourceId: "nope", annotation }),
      ),
      await POST(
        request("POST", {
          projectId,
          resourceId: textId,
          annotation: { ...annotation, body: "" },
        }),
      ),
      await POST(
        request("POST", { projectId, resourceId: imageId, annotation }),
      ),
      await PUT(
        request("PUT", {
          projectId,
          resourceId: textId,
          annotationId: "nope",
          body: "x",
        }),
      ),
      await POST(request("POST", "{")),
      await POST(request("POST", [1])),
      await GET(new NextRequest(`${ENDPOINT}?projectId=${projectId}`)),
    ];
    for (const res of cases) {
      expect(res.status).toBe(400);
      expect(typeof (await res.json()).error).toBe("string");
    }
  });

  it("maps a missing resource and a missing annotation to 404", async () => {
    const { projectId, textId } = await seedHttp();
    const missingResource = await DELETE(
      request("DELETE", {
        projectId,
        resourceId: generateUUID(),
        annotationId: generateUUID(),
      }),
    );
    expect(missingResource.status).toBe(404);
    const missingAnnotation = await DELETE(
      request("DELETE", {
        projectId,
        resourceId: textId,
        annotationId: generateUUID(),
      }),
    );
    expect(missingAnnotation.status).toBe(404);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409", async () => {
    const { projectId, textId } = await seedHttp();
    const url = `${ENDPOINT}?projectId=${projectId}&resourceId=${textId}`;
    vi.mocked(listAnnotationsCore).mockRejectedValueOnce(
      new ProjectLockedError(projectId),
    );
    expect((await GET(new NextRequest(url))).status).toBe(401);
    vi.mocked(listAnnotationsCore).mockRejectedValueOnce(
      new MissingProjectKeyError(projectId),
    );
    expect((await GET(new NextRequest(url))).status).toBe(409);
  });

  it("returns an error status, never an empty list, when the read fails", async () => {
    const { projectId, textId } = await seedHttp();
    const file = path.join(
      process.env.GETWRITE_PROJECTS_DIR ?? "",
      projectId,
      "meta",
      `resource-${textId}.meta.json`,
    );
    await fs.writeFile(file, "{ not json", "utf8");
    await expect(
      GET(
        new NextRequest(
          `${ENDPOINT}?projectId=${projectId}&resourceId=${textId}`,
        ),
      ),
    ).rejects.toThrow();
  });
});

describe("annotations: HTTP client vs native backend", () => {
  it("refuses the same invalid input with the same message on both", async () => {
    const http = await seedHttp();
    wireFetch();
    const native = await seedNative();
    const backend = createNativeAnnotationsTransport({
      fs: native.nativeFs,
      projectsDir: NATIVE_DIR,
    });
    const good = { id: generateUUID(), body: "n", quote: "q" };
    const inputs: ReadonlyArray<{
      name: string;
      run: (
        t: typeof httpAnnotationsTransport,
        s: { projectId: string; textId: string; imageId: string },
      ) => Promise<unknown>;
    }> = [
      {
        name: "empty body",
        run: (t, s) => t.add(s.projectId, s.textId, { ...good, body: "" }),
      },
      {
        name: "bad annotation id",
        run: (t, s) => t.add(s.projectId, s.textId, { ...good, id: "x" }),
      },
      { name: "bad resource id", run: (t, s) => t.add(s.projectId, "x", good) },
      {
        name: "non-text resource",
        run: (t, s) => t.add(s.projectId, s.imageId, good),
      },
      {
        name: "bad update id",
        run: (t, s) => t.update(s.projectId, s.textId, "x", "b"),
      },
      {
        name: "bad reattach id",
        run: (t, s) => t.reattach(s.projectId, s.textId, "x", "q"),
      },
      {
        name: "over-long reattach quote",
        run: (t, s) =>
          t.reattach(s.projectId, s.textId, generateUUID(), "q".repeat(501)),
      },
      {
        name: "bad delete id",
        run: (t, s) => t.remove(s.projectId, s.textId, "x"),
      },
    ];
    for (const input of inputs) {
      const viaHttp = await message(input.run(httpAnnotationsTransport, http));
      const viaNative = await message(input.run(backend, native));
      expect(viaHttp, input.name).not.toBe("NO ERROR");
      expect(viaNative, input.name).toBe(viaHttp);
    }
  });

  it("re-attaches (quote only) identically on both and through the PATCH route", async () => {
    const http = await seedHttp();
    wireFetch();
    const native = await seedNative();
    const backend = createNativeAnnotationsTransport({
      fs: native.nativeFs,
      projectsDir: NATIVE_DIR,
    });
    const input = { id: generateUUID(), body: "n", quote: "old" };
    await httpAnnotationsTransport.add(http.projectId, http.textId, input);
    await backend.add(native.projectId, native.textId, input);
    const viaHttp = await httpAnnotationsTransport.reattach(
      http.projectId,
      http.textId,
      input.id,
      "new",
    );
    const viaNative = await backend.reattach(
      native.projectId,
      native.textId,
      input.id,
      "new",
    );
    expect(viaHttp).toMatchObject({ id: input.id, body: "n", quote: "new" });
    expect({ ...viaNative, createdAt: "", updatedAt: "" }).toEqual({
      ...viaHttp,
      createdAt: "",
      updatedAt: "",
    });
    const missing = await PATCH(
      request("PATCH", {
        projectId: http.projectId,
        resourceId: http.textId,
        annotationId: generateUUID(),
        quote: "q",
      }),
    );
    expect(missing.status).toBe(404);
    const bad = await PATCH(
      request("PATCH", {
        projectId: http.projectId,
        resourceId: http.textId,
        annotationId: input.id,
        quote: 7,
      }),
    );
    expect(bad.status).toBe(400);
  });

  it("refuses an invalid project id on both (the route's uniform 400 wording differs from the core's by design)", async () => {
    const http = await seedHttp();
    wireFetch();
    const native = await seedNative();
    const backend = createNativeAnnotationsTransport({
      fs: native.nativeFs,
      projectsDir: NATIVE_DIR,
    });
    expect(
      await message(httpAnnotationsTransport.list("nope", http.textId)),
    ).toMatch(/Invalid projectId/);
    expect(await message(backend.list("nope", native.textId))).toMatch(
      /Invalid projectId/,
    );
  });

  it("adds and lists identically on both", async () => {
    const http = await seedHttp();
    wireFetch();
    const native = await seedNative();
    const backend = createNativeAnnotationsTransport({
      fs: native.nativeFs,
      projectsDir: NATIVE_DIR,
    });
    const input = { id: generateUUID(), body: "n", quote: "q" };
    const viaHttp = await httpAnnotationsTransport.add(
      http.projectId,
      http.textId,
      input,
    );
    const viaNative = await backend.add(native.projectId, native.textId, input);
    expect({ ...viaNative, createdAt: "", updatedAt: "" }).toEqual({
      ...viaHttp,
      createdAt: "",
      updatedAt: "",
    });
    expect(
      await httpAnnotationsTransport.list(http.projectId, http.textId),
    ).toEqual([viaHttp]);
    expect(await backend.list(native.projectId, native.textId)).toEqual([
      viaNative,
    ]);
  });
});
