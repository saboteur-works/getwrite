/**
 * Entity mention navigation Task 7: PUT /api/project/mention-highlight-duration
 * route. Sets or clears config.mentionHighlightDurationSeconds. projectId is
 * validated; no client path is accepted; locked-access errors are not caught
 * here and propagate to withStorageContext for 401/409 mapping.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "../../src/lib/models/mention-highlight-duration-core",
  async (importActual) => {
    const actual =
      await importActual<
        typeof import("../../src/lib/models/mention-highlight-duration-core")
      >();
    return {
      ...actual,
      setMentionHighlightDurationCore: vi.fn(
        actual.setMentionHighlightDurationCore,
      ),
    };
  },
);

import { PUT } from "../../app/api/project/mention-highlight-duration/route";
import { setMentionHighlightDurationCore } from "../../src/lib/models/mention-highlight-duration-core";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { generateUUID } from "../../src/lib/models/uuid";

const tmpDirs: string[] = [];

afterEach(async () => {
  vi.mocked(setMentionHighlightDurationCore).mockClear();
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

async function setup(): Promise<{ dir: string; id: string; root: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-mhd-route-"));
  tmpDirs.push(dir);
  const id = generateUUID();
  const root = path.join(dir, id);
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(
    path.join(root, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "mhd" }), null, 2),
    "utf8",
  );
  return { dir, id, root };
}

async function withDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

function put(body: unknown): never {
  return new Request(
    "http://localhost/api/project/mention-highlight-duration",
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  ) as never;
}

describe("PUT /api/project/mention-highlight-duration", () => {
  it("sets then clears mentionHighlightDurationSeconds", async () => {
    const { dir, id, root } = await setup();
    const set = await withDir(dir, () =>
      PUT(put({ projectId: id, mentionHighlightDurationSeconds: 5 })),
    );
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ mentionHighlightDurationSeconds: 5 });
    const saved = JSON.parse(
      await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
    );
    expect(saved.config.mentionHighlightDurationSeconds).toBe(5);

    const cleared = await withDir(dir, () =>
      PUT(put({ projectId: id, mentionHighlightDurationSeconds: null })),
    );
    expect(cleared.status).toBe(200);
    expect(
      (await cleared.json()).mentionHighlightDurationSeconds,
    ).toBeUndefined();
    const after = JSON.parse(
      await fs.readFile(path.join(root, PROJECT_FILENAME), "utf8"),
    );
    expect(after.config.mentionHighlightDurationSeconds).toBeUndefined();
    expect(setMentionHighlightDurationCore).toHaveBeenCalledWith(id, null);
  });

  it.each([[0], [11], [2.5], ["5"], [undefined]])(
    "rejects invalid duration %s with 400",
    async (seconds) => {
      const { dir, id } = await setup();
      const res = await withDir(dir, () =>
        PUT(put({ projectId: id, mentionHighlightDurationSeconds: seconds })),
      );
      expect(res.status).toBe(400);
    },
  );

  it("returns the uniform 400 for an invalid projectId and 400 for bad JSON", async () => {
    const { dir } = await setup();
    const res = await withDir(dir, () =>
      PUT(put({ projectId: "nope", mentionHighlightDurationSeconds: 5 })),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid projectId");
    const bad = await withDir(dir, () =>
      PUT(
        new Request("http://localhost/api/project/mention-highlight-duration", {
          method: "PUT",
          body: "{",
        }) as never,
      ),
    );
    expect(bad.status).toBe(400);
  });

  it("maps ProjectLockedError to 401 and MissingProjectKeyError to 409 (not caught by the route handler itself)", async () => {
    const { dir, id } = await setup();
    vi.mocked(setMentionHighlightDurationCore).mockRejectedValueOnce(
      new ProjectLockedError(id),
    );
    const locked = await withDir(dir, () =>
      PUT(put({ projectId: id, mentionHighlightDurationSeconds: 5 })),
    );
    expect(locked.status).toBe(401);

    vi.mocked(setMentionHighlightDurationCore).mockRejectedValueOnce(
      new MissingProjectKeyError(id),
    );
    const keyless = await withDir(dir, () =>
      PUT(put({ projectId: id, mentionHighlightDurationSeconds: 5 })),
    );
    expect(keyless.status).toBe(409);
  });
});
