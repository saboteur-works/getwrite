/**
 * Feature 89, Task 10 (FR-17, FR-24): MEASUREMENT of what the real
 * `updateSidecarCore` stores for `entityKind` when a second, whole-resource
 * payload omits it. No product change; the assertions pin the values observed
 * on the unfixed tree, as a record of current behaviour. Runs against a
 * throwaway projects directory (GETWRITE_PROJECTS_DIR), never `projects/`.
 *
 * Payloads:
 * - "recorded": the second `updateSidecar` payload recorded by
 *   `tests/page-stale-sidecar-save.test.tsx` (no `entityKind` key).
 * - "page": what `updateResource` in `app/(app)/page.tsx` builds, read from
 *   the code: `applyUpdate(resource)` = the updater's result (the page's local
 *   resource copy spread, `userMetadata` replaced), then the Redux
 *   `resourceSubtype` overlay (key deleted when Redux holds none) and, when
 *   Redux holds a numeric `wordCount`, that value. No other key is added, so a
 *   local copy without `entityKind` sends none. The payload is passed through
 *   a JSON round trip, as the HTTP transport does.
 *
 * `aliases` and `wordCountGoal` are observed by the same method as
 * observations for those keys only (FR-24).
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { updateSidecarCore } from "../../src/lib/models/resource-crud-core";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { removeDirRetry } from "./helpers/fs-utils";

const tmpDirs: string[] = [];

afterEach(async () => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) await removeDirRetry(dir);
  }
});

const baseResource = {
  name: "Chapter One",
  type: "text",
  folderId: null,
  orderIndex: 0,
};

async function withSidecar(
  initial: Record<string, unknown>,
  update: (ids: { projectId: string; resourceId: string }) => Promise<void>,
): Promise<Record<string, unknown> | null> {
  const projectsDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-entity-kind-omitted-"),
  );
  tmpDirs.push(projectsDir);
  const projectId = generateUUID();
  const projectPath = path.join(projectsDir, projectId);
  await fs.mkdir(projectPath, { recursive: true });
  const resourceId = generateUUID();
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  try {
    await writeSidecar(projectPath, resourceId, {
      ...baseResource,
      id: resourceId,
      ...initial,
    } as Parameters<typeof writeSidecar>[2]);
    await update({ projectId, resourceId });
    return (await readSidecar(projectPath, resourceId)) as Record<
      string,
      unknown
    > | null;
  } finally {
    if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

function overHttp(payload: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
}

describe("updateSidecarCore — payload omitting entityKind (Feature 89 Task 10, measurement)", () => {
  it("recorded payload shape: entityKind is kept", async () => {
    const after = await withSidecar(
      { entityKind: "character", userMetadata: {} },
      async ({ projectId, resourceId }) => {
        await updateSidecarCore(projectId, resourceId, {
          id: resourceId,
          ...baseResource,
          userMetadata: { mood: "calm" },
        });
      },
    );
    expect(after?.entityKind).toBe("character");
    expect(after?.userMetadata).toEqual({ mood: "calm" });
  });

  it("page.tsx updateResource payload (local copy without entityKind, Redux wordCount and no subtype): entityKind is kept", async () => {
    const after = await withSidecar(
      { entityKind: "character", userMetadata: {}, wordCount: 5 },
      async ({ projectId, resourceId }) => {
        const payload = overHttp({
          id: resourceId,
          ...baseResource,
          userMetadata: { mood: "calm" },
          wordCount: 42,
        });
        expect(payload).not.toHaveProperty("entityKind");
        await updateSidecarCore(projectId, resourceId, payload);
      },
    );
    expect(after?.entityKind).toBe("character");
    expect(after?.userMetadata).toEqual({ mood: "calm" });
    // the server drops a client-sent wordCount (SERVER_DERIVED_SIDECAR_KEYS)
    expect(after?.wordCount).toBe(5);
  });

  it("page.tsx payload when the local copy holds an explicit undefined entityKind: dropped by JSON, entityKind is kept", async () => {
    const after = await withSidecar(
      { entityKind: "character", userMetadata: {} },
      async ({ projectId, resourceId }) => {
        await updateSidecarCore(
          projectId,
          resourceId,
          overHttp({
            id: resourceId,
            ...baseResource,
            userMetadata: {},
            entityKind: undefined,
          }),
        );
      },
    );
    expect(after?.entityKind).toBe("character");
  });

  it("core-level observation only: a payload carrying a different entityKind replaces the stored one", async () => {
    // Not a claim that the app sends such a payload; whether a stale local
    // copy reaches the page's updateResource in a running app was not measured.
    const after = await withSidecar(
      { entityKind: "place", userMetadata: {} },
      async ({ projectId, resourceId }) => {
        await updateSidecarCore(projectId, resourceId, {
          id: resourceId,
          ...baseResource,
          userMetadata: { mood: "calm" },
          entityKind: "character",
        });
      },
    );
    expect(after?.entityKind).toBe("character");
  });

  it("observation for aliases and wordCountGoal only: both are kept when the payload omits them", async () => {
    const after = await withSidecar(
      {
        entityKind: "character",
        aliases: ["Al", "Ally"],
        wordCountGoal: 1500,
        userMetadata: {},
      },
      async ({ projectId, resourceId }) => {
        await updateSidecarCore(projectId, resourceId, {
          id: resourceId,
          ...baseResource,
          userMetadata: { mood: "calm" },
        });
      },
    );
    expect(after?.aliases).toEqual(["Al", "Ally"]);
    expect(after?.wordCountGoal).toBe(1500);
  });
});
