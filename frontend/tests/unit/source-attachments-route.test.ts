/**
 * Feature 102, Task 27 (FR-23 HTTP half, FR-24, FR-32, FR-34): the Source
 * attachment routes. Real project, real core; only the locked-access case
 * stubs the core. Restore goes through the existing Trash restore route.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../src/lib/models/source-attachments-core",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../src/lib/models/source-attachments-core")
      >();
    return { ...actual, addAttachmentCore: vi.fn(actual.addAttachmentCore) };
  },
);

import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../app/api/project/source-attachments/route";
import { POST as RESTORE } from "../../app/api/project/[project-id]/trash/restore/route";
import {
  addAttachmentCore,
  listAttachmentsCore,
  MAX_ATTACHMENTS_PER_SOURCE,
} from "../../src/lib/models/source-attachments-core";
import { ATTACHMENT_MESSAGES } from "../../src/lib/models/media-validation";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { mutateSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import type { MetadataValue } from "../../src/lib/models/types";

const SPEC_PATH = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const PNG2 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6, 7, 8,
]);
const ROUTE_URL = "http://localhost/api/project/source-attachments";

let projectsDir: string;
let projectId: string;
let projectRoot: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-attach-route-"));
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  projectId = generateUUID();
  projectRoot = path.join(projectsDir, projectId);
  await createAndAssertProject(SPEC_PATH, {
    projectRoot,
    name: "Attachment Route Test",
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await flushIndexer();
  if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  await removeDirRetry(projectsDir);
});

async function createSource(): Promise<string> {
  const created = await createResourceCore(projectId, {
    type: "source",
    name: "Interview",
    text: { plainText: "first words" },
  });
  return created.id;
}

function form(fields: Record<string, string>, file?: File): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  if (file) data.set("file", file);
  return data;
}

function pngFile(name = "a.png", bytes: Uint8Array = PNG): File {
  return new File([bytes as BlobPart], name, { type: "image/png" });
}

function multipart(method: "POST" | "PUT", data: FormData): never {
  return new Request(ROUTE_URL, { method, body: data }) as never;
}

function json(method: "DELETE" | "PATCH", body: unknown): never {
  return new Request(ROUTE_URL, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function get(projectIdValue: string, resourceId: string): never {
  const q = new URLSearchParams({ projectId: projectIdValue, resourceId });
  return new Request(`${ROUTE_URL}?${q.toString()}`) as never;
}

async function add(
  resourceId: string,
  name = "a.png",
  bytes: Uint8Array = PNG,
): Promise<{ id: string; fileName: string }> {
  const res = await POST(
    multipart("POST", form({ projectId, resourceId }, pngFile(name, bytes))),
  );
  expect(res.status).toBe(200);
  return (await res.json()) as { id: string; fileName: string };
}

async function ids(resourceId: string): Promise<string[]> {
  return (await listAttachmentsCore(projectId, resourceId)).map((e) => e.id);
}

describe("attachment routes: each operation for a Source", () => {
  it("adds, lists, reorders, replaces and removes", async () => {
    const id = await createSource();
    const a = await add(id, "a.png");
    const b = await add(id, "b.png", PNG2);

    const listed = await GET(get(projectId, id));
    expect(listed.status).toBe(200);
    expect(
      ((await listed.json()) as { id: string }[]).map((e) => e.id),
    ).toEqual([a.id, b.id]);

    const reordered = await PATCH(
      json("PATCH", { projectId, resourceId: id, orderedIds: [b.id, a.id] }),
    );
    expect(reordered.status).toBe(200);
    expect(await ids(id)).toEqual([b.id, a.id]);

    const replaced = await PUT(
      multipart(
        "PUT",
        form(
          { projectId, resourceId: id, attachmentId: b.id },
          pngFile("c.png", PNG2),
        ),
      ),
    );
    expect(replaced.status).toBe(200);
    const replacedBody = (await replaced.json()) as {
      trashId: string;
      entry: { id: string };
    };
    expect(replacedBody.trashId).toBe(b.id);
    expect(await ids(id)).toEqual([replacedBody.entry.id, a.id]);

    const removed = await DELETE(
      json("DELETE", { projectId, resourceId: id, attachmentId: a.id }),
    );
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ trashId: a.id });
    expect(await ids(id)).toEqual([replacedBody.entry.id]);
  });
});

describe("attachment routes: boundary refusals", () => {
  it("maps an invalid project id, resource id and body to 400", async () => {
    const id = await createSource();
    const badProject = await POST(
      multipart("POST", form({ projectId: "nope", resourceId: id }, pngFile())),
    );
    expect(badProject.status).toBe(400);
    expect((await badProject.json()).error).toBe("Invalid projectId");

    const badResource = await POST(
      multipart("POST", form({ projectId, resourceId: "nope" }, pngFile())),
    );
    expect(badResource.status).toBe(400);

    const noFile = await POST(
      multipart("POST", form({ projectId, resourceId: id })),
    );
    expect(noFile.status).toBe(400);

    const notMultipart = await POST(
      new Request(ROUTE_URL, { method: "POST", body: "x" }) as never,
    );
    expect(notMultipart.status).toBe(400);

    const badJson = await DELETE(
      new Request(ROUTE_URL, { method: "DELETE", body: "{" }) as never,
    );
    expect(badJson.status).toBe(400);

    const badOrder = await PATCH(
      json("PATCH", { projectId, resourceId: id, orderedIds: "x" }),
    );
    expect(badOrder.status).toBe(400);

    const badAttachmentId = await DELETE(
      json("DELETE", { projectId, resourceId: id, attachmentId: 7 }),
    );
    expect(badAttachmentId.status).toBe(400);
    expect((await GET(get("nope", id))).status).toBe(400);
    expect((await GET(get(projectId, "nope"))).status).toBe(400);
  });

  it("maps a missing resource or attachment to 404 and a non-Source to 400", async () => {
    const id = await createSource();
    const missing = await POST(
      multipart(
        "POST",
        form({ projectId, resourceId: generateUUID() }, pngFile()),
      ),
    );
    expect(missing.status).toBe(404);
    const unknownAttachment = await DELETE(
      json("DELETE", {
        projectId,
        resourceId: id,
        attachmentId: generateUUID(),
      }),
    );
    expect(unknownAttachment.status).toBe(404);
    const text = await createResourceCore(projectId, {
      type: "text",
      name: "T",
      text: { plainText: "x" },
    });
    const notSource = await POST(
      multipart("POST", form({ projectId, resourceId: text.id }, pngFile())),
    );
    expect(notSource.status).toBe(400);
  });

  it("returns the Task 22 message for a refused file and stores nothing", async () => {
    const id = await createSource();
    const mismatch = await POST(
      multipart(
        "POST",
        form(
          { projectId, resourceId: id },
          new File([new Uint8Array([1, 2, 3, 4])], "x.png", {
            type: "image/png",
          }),
        ),
      ),
    );
    expect(mismatch.status).toBe(400);
    expect((await mismatch.json()).error).toBe(
      ATTACHMENT_MESSAGES.contentMismatch,
    );
    const video = await POST(
      multipart(
        "POST",
        form(
          { projectId, resourceId: id },
          new File([PNG as BlobPart], "clip.mp4", { type: "video/mp4" }),
        ),
      ),
    );
    expect(video.status).toBe(400);
    expect((await video.json()).error).toBe(
      ATTACHMENT_MESSAGES.videoNotSupported,
    );
    expect(await ids(id)).toEqual([]);
    const files = await fs.readdir(path.join(projectRoot, "resources", id));
    expect(files.filter((f) => f.startsWith("attachment-"))).toEqual([]);
  });

  it("refuses the 501st add and stores nothing", async () => {
    const id = await createSource();
    const entries = Array.from(
      { length: MAX_ATTACHMENTS_PER_SOURCE },
      (_, i) => ({
        id: generateUUID(),
        fileName: `attachment-${generateUUID()}.png`,
        originalName: `f${i}.png`,
        mime: "image/png",
        size: 1,
        addedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    await mutateSidecar(projectRoot, id, (current) => ({
      ...(current as Record<string, MetadataValue>),
      attachments: entries as unknown as MetadataValue,
    }));
    const before = await fs.readdir(path.join(projectRoot, "resources", id));
    const res = await POST(
      multipart("POST", form({ projectId, resourceId: id }, pngFile())),
    );
    expect(res.status).toBe(400);
    expect(typeof (await res.json()).error).toBe("string");
    expect(await ids(id)).toHaveLength(MAX_ATTACHMENTS_PER_SOURCE);
    expect(await fs.readdir(path.join(projectRoot, "resources", id))).toEqual(
      before,
    );
  });

  it("maps locked-access errors to the existing 401/409 responses", async () => {
    const id = await createSource();
    vi.mocked(addAttachmentCore).mockRejectedValueOnce(
      new ProjectLockedError(projectId),
    );
    const locked = await POST(
      multipart("POST", form({ projectId, resourceId: id }, pngFile())),
    );
    expect(locked.status).toBe(401);
    vi.mocked(addAttachmentCore).mockRejectedValueOnce(
      new MissingProjectKeyError(projectId),
    );
    const keyless = await POST(
      multipart("POST", form({ projectId, resourceId: id }, pngFile())),
    );
    expect(keyless.status).toBe(409);
  });
});

describe("attachment routes: no path in, no value logged", () => {
  it("ignores client path fields and logs no stored value or file name", async () => {
    const id = await createSource();
    const other = await fs.mkdtemp(path.join(os.tmpdir(), "gw-attach-other-"));
    try {
      const spies = (["log", "info", "warn", "error", "debug"] as const).map(
        (m) => vi.spyOn(console, m).mockImplementation(() => undefined),
      );
      const res = await POST(
        multipart(
          "POST",
          form(
            { projectId, resourceId: id, path: other, projectRoot: other },
            pngFile("secret-name.png"),
          ),
        ),
      );
      expect(res.status).toBe(200);
      const stored = (await res.json()) as { fileName: string };
      expect(await fs.readdir(other)).toEqual([]);
      const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
      expect(logged).not.toContain("secret-name");
      expect(logged).not.toContain(stored.fileName);
    } finally {
      await removeDirRetry(other);
    }
  });
});

describe("Trash restore route and the attachment kind", () => {
  it("restores a removed attachment to the end of the list", async () => {
    const id = await createSource();
    const a = await add(id, "a.png");
    const b = await add(id, "b.png", PNG2);
    await DELETE(
      json("DELETE", { projectId, resourceId: id, attachmentId: a.id }),
    );
    const res = await RESTORE(
      new Request(`http://localhost/api/project/${projectId}/trash/restore`, {
        method: "POST",
        body: JSON.stringify({ ids: [a.id] }),
      }) as never,
      { params: Promise.resolve({ "project-id": projectId }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      results: { id: string; ok: boolean }[];
    };
    expect(body.results[0]).toMatchObject({ id: a.id, ok: true });
    expect(await ids(id)).toEqual([b.id, a.id]);
  });
});
