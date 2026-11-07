/**
 * Feature 102 Task 28 (FR-23, FR-24, FR-32, FR-34): the same invalid input to
 * each attachment operation is refused with the same message through the HTTP
 * route handlers and the native backend, and the add, reorder, replace,
 * remove and restore lifecycle (plus Source create) runs through the native
 * transport with no HTTP.
 *
 * The route side is a real temp directory, the native side a fake Capacitor
 * filesystem. Outcomes are compared with the literal expected message, so a
 * shared regression cannot pass by agreeing with itself. Native lock behaviour
 * is reasoned from the shared core, not run.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  DELETE,
  GET,
  PATCH,
  POST,
  PUT,
} from "../../app/api/project/source-attachments/route";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";
import { capacitorFsAdapter } from "../../src/lib/models/capacitorFsAdapter";
import { createResourceCore } from "../../src/lib/models/resource-crud-core";
import { ATTACHMENT_MESSAGES } from "../../src/lib/models/media-validation";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import {
  __resetDefaultStorageContextForTests,
  setDefaultStorageContext,
} from "../../src/lib/models/storage-context";
import { generateUUID } from "../../src/lib/models/uuid";
import type { AttachmentTransport } from "../../src/lib/api/source-attachments";
import { createNativeAttachmentsTransport } from "../../src/store/transport/native-source-attachments-backend";
import { createNativeResourcesTransport } from "../../src/store/transport/native-resource-backend";
import { createNativeTrashTransport } from "../../src/store/transport/native-trash-backend";
import { removeDirRetry } from "../unit/helpers/fs-utils";

const NATIVE_PROJECTS_DIR = "/projects";
const ROUTE_URL = "http://localhost/api/project/source-attachments";
const PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4,
]);
const PNG2 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 5, 6, 7, 8,
]);
const tmpDirs: string[] = [];

afterEach(async () => {
  __resetDefaultStorageContextForTests();
  await flushIndexer();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

function png(name = "a.png", bytes: Uint8Array = PNG): File {
  return new File([bytes as BlobPart], name, { type: "image/png" });
}

type Op =
  | { kind: "list"; resourceId: string; projectId?: string }
  | { kind: "add"; resourceId: string; file: File }
  | { kind: "replace"; resourceId: string; attachmentId: string; file: File }
  | { kind: "remove"; resourceId: string; attachmentId: string }
  | { kind: "reorder"; resourceId: string; orderedIds: string[] };

type Outcome = { ok: true } | { ok: false; message: string };

interface Side {
  sourceId: string;
  textId: string;
  /** Adds a valid attachment and returns its id. */
  seed: () => Promise<string>;
  call: (op: Op) => Promise<Outcome>;
}

async function withEnv<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

function formRequest(
  method: "POST" | "PUT",
  fields: Record<string, string>,
  file: File,
): never {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  data.set("file", file);
  return new Request(ROUTE_URL, { method, body: data }) as never;
}

function jsonRequest(method: "DELETE" | "PATCH", body: unknown): never {
  return new Request(ROUTE_URL, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

function routeResponse(projectId: string, op: Op): Promise<Response> {
  switch (op.kind) {
    case "list": {
      const q = new URLSearchParams({
        projectId: op.projectId ?? projectId,
        resourceId: op.resourceId,
      });
      return GET(new Request(`${ROUTE_URL}?${q.toString()}`) as never);
    }
    case "add":
      return POST(
        formRequest("POST", { projectId, resourceId: op.resourceId }, op.file),
      );
    case "replace":
      return PUT(
        formRequest(
          "PUT",
          {
            projectId,
            resourceId: op.resourceId,
            attachmentId: op.attachmentId,
          },
          op.file,
        ),
      );
    case "remove":
      return DELETE(
        jsonRequest("DELETE", {
          projectId,
          resourceId: op.resourceId,
          attachmentId: op.attachmentId,
        }),
      );
    case "reorder":
      return PATCH(
        jsonRequest("PATCH", {
          projectId,
          resourceId: op.resourceId,
          orderedIds: op.orderedIds,
        }),
      );
  }
}

function nativeResult(
  t: AttachmentTransport,
  projectId: string,
  op: Op,
): Promise<unknown> {
  switch (op.kind) {
    case "list":
      return t.listAttachments(op.projectId ?? projectId, op.resourceId);
    case "add":
      return t.addAttachment(projectId, op.resourceId, op.file);
    case "replace":
      return t.replaceAttachment(
        projectId,
        op.resourceId,
        op.attachmentId,
        op.file,
      );
    case "remove":
      return t.removeAttachment(projectId, op.resourceId, op.attachmentId);
    case "reorder":
      return t.reorderAttachments(projectId, op.resourceId, op.orderedIds);
  }
}

async function makeRouteSide(): Promise<Side> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-attach-parity-"));
  tmpDirs.push(dir);
  const projectId = generateUUID();
  await fs.mkdir(path.join(dir, projectId), { recursive: true });
  await fs.writeFile(
    path.join(dir, projectId, "project.json"),
    JSON.stringify({ id: projectId, name: "p" }),
  );
  const { sourceId, textId } = await withEnv(dir, async () => ({
    sourceId: (
      await createResourceCore(projectId, {
        type: "source",
        name: "Interview",
        text: { plainText: "words" },
      })
    ).id,
    textId: (
      await createResourceCore(projectId, {
        type: "text",
        name: "Plain",
        text: { plainText: "words" },
      })
    ).id,
  }));
  return {
    sourceId,
    textId,
    seed: async () => {
      const res = await withEnv(dir, () =>
        routeResponse(projectId, {
          kind: "add",
          resourceId: sourceId,
          file: png(),
        }),
      );
      return ((await res.json()) as { id: string }).id;
    },
    call: async (op) => {
      const res = await withEnv(dir, () => routeResponse(projectId, op));
      if (res.status === 200) return { ok: true };
      const body = (await res.json()) as { error?: string };
      return { ok: false, message: String(body.error) };
    },
  };
}

async function makeNativeSide(): Promise<Side> {
  const nativeFs = createFakeCapacitorFilesystem();
  const adapter = capacitorFsAdapter(nativeFs);
  const projectId = generateUUID();
  const root = path.join(NATIVE_PROJECTS_DIR, projectId);
  await adapter.mkdir(root, { recursive: true });
  await adapter.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({ id: projectId, name: "p" }),
  );
  const deps = { fs: nativeFs, projectsDir: NATIVE_PROJECTS_DIR };
  const resources = createNativeResourcesTransport(deps);
  const sourceId = (
    await resources.create(projectId, {
      type: "source",
      name: "Interview",
      text: { plainText: "words" },
    })
  ).resource.id;
  const textId = (
    await resources.create(projectId, {
      type: "text",
      name: "Plain",
      text: { plainText: "words" },
    })
  ).resource.id;
  const transport = createNativeAttachmentsTransport(deps);
  return {
    sourceId,
    textId,
    seed: async () =>
      (await transport.addAttachment(projectId, sourceId, png())).id,
    call: async (op) => {
      try {
        await nativeResult(transport, projectId, op);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

const MISSING = generateUUID();
const VIDEO = new File([PNG as BlobPart], "clip.mp4", { type: "video/mp4" });
const FAKE_PNG = new File([new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])], "x.png", {
  type: "image/png",
});
const SOURCE_ONLY = "Attachments can only be added to a Source.";
const BAD_RESOURCE = "A resource id must be a valid id.";
const BAD_ORDER = "The new order must list every attachment exactly once.";
const NO_ATTACHMENT = "The attachment was not found.";

interface Case {
  name: string;
  message: string;
  op: (side: Side, seeded: string) => Op;
}

const CASES: Case[] = [
  {
    name: "list with a bad resource id",
    message: BAD_RESOURCE,
    op: () => ({ kind: "list", resourceId: "nope" }),
  },
  {
    name: "list a text resource",
    message: SOURCE_ONLY,
    op: (s) => ({ kind: "list", resourceId: s.textId }),
  },
  {
    name: "list a missing resource",
    message: "The resource was not found.",
    op: () => ({ kind: "list", resourceId: MISSING }),
  },
  {
    name: "add a video",
    message: ATTACHMENT_MESSAGES.videoNotSupported,
    op: (s) => ({ kind: "add", resourceId: s.sourceId, file: VIDEO }),
  },
  {
    name: "add a file whose bytes do not match its type",
    message: ATTACHMENT_MESSAGES.contentMismatch,
    op: (s) => ({ kind: "add", resourceId: s.sourceId, file: FAKE_PNG }),
  },
  {
    name: "add to a text resource",
    message: SOURCE_ONLY,
    op: (s) => ({ kind: "add", resourceId: s.textId, file: png() }),
  },
  {
    name: "add with a bad resource id",
    message: BAD_RESOURCE,
    op: () => ({ kind: "add", resourceId: "nope", file: png() }),
  },
  {
    name: "replace with a video",
    message: ATTACHMENT_MESSAGES.videoNotSupported,
    op: (s, a) => ({
      kind: "replace",
      resourceId: s.sourceId,
      attachmentId: a,
      file: VIDEO,
    }),
  },
  {
    name: "replace with a bad attachment id",
    message: "Invalid resource id",
    op: (s) => ({
      kind: "replace",
      resourceId: s.sourceId,
      attachmentId: "nope",
      file: png(),
    }),
  },
  {
    name: "replace an unknown attachment",
    message: NO_ATTACHMENT,
    op: (s) => ({
      kind: "replace",
      resourceId: s.sourceId,
      attachmentId: MISSING,
      file: png(),
    }),
  },
  {
    name: "remove with a bad attachment id",
    message: "Invalid resource id",
    op: (s) => ({
      kind: "remove",
      resourceId: s.sourceId,
      attachmentId: "nope",
    }),
  },
  {
    name: "remove an unknown attachment",
    message: NO_ATTACHMENT,
    op: (s) => ({
      kind: "remove",
      resourceId: s.sourceId,
      attachmentId: MISSING,
    }),
  },
  {
    name: "reorder with a non-permutation",
    message: BAD_ORDER,
    op: (s) => ({
      kind: "reorder",
      resourceId: s.sourceId,
      orderedIds: [MISSING],
    }),
  },
  {
    name: "reorder with a malformed id",
    message: BAD_ORDER,
    op: (s) => ({
      kind: "reorder",
      resourceId: s.sourceId,
      orderedIds: ["nope"],
    }),
  },
];

describe("attachment parity: route and native refuse the same input the same way", () => {
  it.each(CASES)("$name", async ({ message, op }) => {
    const route = await makeRouteSide();
    const native = await makeNativeSide();
    const routeSeed = await route.seed();
    const nativeSeed = await native.seed();
    expect(await route.call(op(route, routeSeed))).toEqual({
      ok: false,
      message,
    });
    expect(await native.call(op(native, nativeSeed))).toEqual({
      ok: false,
      message,
    });
  });

  it("refuses a bad project id on both; the route's text is constant, the native text echoes the caller's own value", async () => {
    const route = await makeRouteSide();
    const native = await makeNativeSide();
    const op = (s: Side): Op => ({
      kind: "list",
      resourceId: s.sourceId,
      projectId: "nope",
    });
    expect(await route.call(op(route))).toEqual({
      ok: false,
      message: "Invalid projectId",
    });
    expect(await native.call(op(native))).toEqual({
      ok: false,
      message: 'Invalid projectId: "nope"',
    });
  });

  it("accepts a valid add on both", async () => {
    const route = await makeRouteSide();
    const native = await makeNativeSide();
    const op = (s: Side): Op => ({
      kind: "add",
      resourceId: s.sourceId,
      file: png(),
    });
    expect(await route.call(op(route))).toEqual({ ok: true });
    expect(await native.call(op(native))).toEqual({ ok: true });
  });
});

describe("attachment lifecycle through the native transport", () => {
  it("creates a Source, adds, reorders, replaces, removes and restores with no HTTP", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("fetch must not be called in-process");
    }) as unknown as typeof fetch;
    try {
      const nativeFs = createFakeCapacitorFilesystem();
      const adapter = capacitorFsAdapter(nativeFs);
      const projectId = generateUUID();
      const root = path.join(NATIVE_PROJECTS_DIR, projectId);
      await adapter.mkdir(root, { recursive: true });
      await adapter.writeFile(
        path.join(root, "project.json"),
        JSON.stringify({ id: projectId, name: "p" }),
      );
      // The native trash backend resolves the project root before its runner
      // binds a context, so the lifecycle test installs the default one, as
      // the native bootstrap does in production.
      setDefaultStorageContext({ tenantRoot: NATIVE_PROJECTS_DIR, adapter });
      const deps = { fs: nativeFs, projectsDir: NATIVE_PROJECTS_DIR };
      const created = await createNativeResourcesTransport(deps).create(
        projectId,
        { type: "source", name: "Interview", text: { plainText: "words" } },
      );
      expect(created.resource.type).toBe("source");
      const sourceId = created.resource.id;
      const t = createNativeAttachmentsTransport(deps);
      const idsOf = async (): Promise<string[]> =>
        (await t.listAttachments(projectId, sourceId)).map((e) => e.id);

      const a = await t.addAttachment(projectId, sourceId, png("a.png"));
      const b = await t.addAttachment(projectId, sourceId, png("b.png", PNG2));
      expect(await idsOf()).toEqual([a.id, b.id]);

      const reordered = await t.reorderAttachments(projectId, sourceId, [
        b.id,
        a.id,
      ]);
      expect(reordered.map((e) => e.id)).toEqual([b.id, a.id]);

      const replaced = await t.replaceAttachment(
        projectId,
        sourceId,
        b.id,
        png("c.png", PNG2),
      );
      expect(replaced.trashId).toBe(b.id);
      expect(replaced.entry.originalName).toBe("c.png");

      expect(await t.removeAttachment(projectId, sourceId, a.id)).toEqual({
        trashId: a.id,
      });
      expect(await idsOf()).toEqual([replaced.entry.id]);

      const restored = await createNativeTrashTransport(deps).restore(
        projectId,
        [a.id],
      );
      expect(restored).toEqual([expect.objectContaining({ ok: true })]);
      const after = await t.listAttachments(projectId, sourceId);
      expect(after.map((e) => e.originalName)).toEqual(["c.png", "a.png"]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
