/**
 * Feature 106 Task 3 (FR-3, FR-22, FR-2): the `inboxFolderId` config field,
 * the server-written capture sidecar keys, and the capture request/result
 * types module.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AnyResourceSchema,
  CAPTURED_LINK_MAX_LENGTH,
  ProjectConfigSchema,
  ResourceBaseSchema,
} from "../../src/lib/models/schemas";
import { ProjectApiEntrySchema } from "../../src/lib/api/schemas";
import {
  CLIENT_WRITABLE_SIDECAR_KEYS,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import type { CaptureResult } from "../../src/lib/api/inbox-capture-types";
import { removeDirRetry } from "./helpers/fs-utils";

const FOLDER_ID = "550e8400-e29b-41d4-a716-446655440000";

const baseResourceFields = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  slug: "captured",
  name: "Captured",
  type: "text" as const,
  orderIndex: 0,
  createdAt: "2026-11-09T00:00:00.000Z",
};

const apiEntry = (config: Record<string, unknown>) => ({
  project: {
    id: "aaaaaaaa-1111-4111-8111-111111111111",
    name: "P",
    createdAt: "2026-11-09T00:00:00.000Z",
    config: { editorConfig: {}, ...config },
  },
  folders: [],
  resources: [],
});

describe("inboxFolderId in the config schemas", () => {
  it("ProjectConfigSchema keeps a UUID and rejects a non-UUID", () => {
    const base = { editorConfig: {} };
    const ok = ProjectConfigSchema.parse({ ...base, inboxFolderId: FOLDER_ID });
    expect(ok.inboxFolderId).toBe(FOLDER_ID);
    expect(
      ProjectConfigSchema.safeParse({ ...base, inboxFolderId: "not-a-uuid" })
        .success,
    ).toBe(false);
  });

  it("a config with no value still parses, and the key stays absent", () => {
    const parsed = ProjectConfigSchema.parse({ editorConfig: {} });
    expect(parsed.inboxFolderId).toBeUndefined();
    const api = ProjectApiEntrySchema.parse(apiEntry({}));
    expect(api.project.config?.inboxFolderId).toBeUndefined();
  });

  it("round-trips through the lib/api schema without being stripped", () => {
    const api = ProjectApiEntrySchema.parse(
      apiEntry({ inboxFolderId: FOLDER_ID }),
    );
    expect(api.project.config?.inboxFolderId).toBe(FOLDER_ID);
  });

  it("the lib/api schema rejects a non-UUID value", () => {
    expect(
      ProjectApiEntrySchema.safeParse(apiEntry({ inboxFolderId: "nope" }))
        .success,
    ).toBe(false);
  });
});

describe("capturedAt and capturedLink in the sidecar schema", () => {
  it("accepts a valid timestamp and a link within the bound", () => {
    const link = "x".repeat(CAPTURED_LINK_MAX_LENGTH);
    const parsed = AnyResourceSchema.parse({
      ...baseResourceFields,
      capturedAt: "2026-11-09T12:34:56.789Z",
      capturedLink: link,
    });
    expect(parsed).toMatchObject({
      capturedAt: "2026-11-09T12:34:56.789Z",
      capturedLink: link,
    });
  });

  it("accepts a resource with neither key", () => {
    const parsed = ResourceBaseSchema.parse(baseResourceFields);
    expect(parsed.capturedAt).toBeUndefined();
    expect(parsed.capturedLink).toBeUndefined();
  });

  it("rejects an invalid timestamp", () => {
    expect(
      ResourceBaseSchema.safeParse({
        ...baseResourceFields,
        capturedAt: "yesterday-ish",
      }).success,
    ).toBe(false);
  });

  it("rejects an over-long link and a non-string link", () => {
    expect(
      ResourceBaseSchema.safeParse({
        ...baseResourceFields,
        capturedLink: "x".repeat(CAPTURED_LINK_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      ResourceBaseSchema.safeParse({ ...baseResourceFields, capturedLink: 42 })
        .success,
    ).toBe(false);
  });

  it("states the bound as a positive integer constant", () => {
    expect(Number.isInteger(CAPTURED_LINK_MAX_LENGTH)).toBe(true);
    expect(CAPTURED_LINK_MAX_LENGTH).toBeGreaterThan(0);
  });
});

describe("capture keys are server-written only", () => {
  const tmpDirs: string[] = [];
  afterEach(async () => {
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop();
      if (dir) await removeDirRetry(dir);
    }
  });

  it("neither key is in CLIENT_WRITABLE_SIDECAR_KEYS", () => {
    expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain("capturedAt");
    expect(CLIENT_WRITABLE_SIDECAR_KEYS).not.toContain("capturedLink");
  });

  it("a client sidecar update carrying either key leaves them unchanged", async () => {
    const projectsDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-inbox-capture-schemas-"),
    );
    tmpDirs.push(projectsDir);
    const projectId = generateUUID();
    const projectPath = path.join(projectsDir, projectId);
    await fs.mkdir(projectPath, { recursive: true });
    const original = process.env.GETWRITE_PROJECTS_DIR;
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    try {
      const resourceId = generateUUID();
      await writeSidecar(projectPath, resourceId, {
        id: resourceId,
        capturedAt: "2026-11-09T00:00:00.000Z",
        capturedLink: "https://example.test/original",
      });

      await updateSidecarCore(projectId, resourceId, {
        entityKind: "place",
        capturedAt: "2030-01-01T00:00:00.000Z",
        capturedLink: "https://example.test/changed",
      });

      const sidecar = await readSidecar(projectPath, resourceId);
      expect(sidecar?.entityKind).toBe("place");
      expect(sidecar?.capturedAt).toBe("2026-11-09T00:00:00.000Z");
      expect(sidecar?.capturedLink).toBe("https://example.test/original");
    } finally {
      if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
      else process.env.GETWRITE_PROJECTS_DIR = original;
    }
  });
});

describe("capture request and result types", () => {
  it("the result type distinguishes created, needs-choice and refused", () => {
    const created: CaptureResult = {
      status: "created",
      resourceId: FOLDER_ID,
      inboxFolderId: FOLDER_ID,
      notices: [],
    };
    const needsChoice: CaptureResult = {
      status: "needs-choice",
      state: "inbox-in-trash",
    };
    const refused: CaptureResult = {
      status: "refused",
      notices: [
        { code: "empty", severity: "error", message: "Nothing to capture." },
      ],
    };
    const label = (r: CaptureResult): string =>
      r.status === "created"
        ? `created:${r.notices.length}`
        : r.status === "needs-choice"
          ? `needs-choice:${r.state}`
          : `refused:${r.notices[0]?.code}`;
    expect([created, needsChoice, refused].map(label)).toEqual([
      "created:0",
      "needs-choice:inbox-in-trash",
      "refused:empty",
    ]);
    // needs-choice carries nothing but the state.
    expect(Object.keys(needsChoice).sort()).toEqual(["state", "status"]);
  });

  it("the types module imports no React and no node:* module", async () => {
    const source = await fs.readFile(
      path.join(__dirname, "../../src/lib/api/inbox-capture-types.ts"),
      "utf8",
    );
    const imports = [
      ...source.matchAll(/(?:from|import)\s+["']([^"']+)["']/g),
    ].map((m) => m[1]);
    for (const spec of imports) {
      expect(spec).not.toMatch(/^react/);
      expect(spec).not.toMatch(/^node:/);
    }
  });
});
