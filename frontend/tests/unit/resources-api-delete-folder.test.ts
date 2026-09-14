/**
 * Regression coverage for `src/lib/api/resources.ts`'s `deleteFolder` and
 * `collectFolderDescendantIds` (Feature 26 trash-ui, FR-3, Task 13):
 * `deleteFolder` must POST the tenant-scoped `projectId` (the active
 * project's on-disk directory basename) to `/api/folder/[folder-id]/delete`,
 * mirroring `deleteResource`'s shape, and `collectFolderDescendantIds` — the
 * helper `app/(app)/page.tsx`'s `handleResourceAction` `"delete"` branch
 * uses to purge a deleted folder's whole subtree from local + Redux state —
 * must return the folder id plus every nested folder/resource id
 * transitively, leaving unrelated siblings out.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnyResource, Folder } from "../../src/lib/models/types";
import {
  collectFolderDescendantIds,
  deleteFolder,
} from "../../src/lib/api/resources";

const directoryUuid = "aaaaaaaa-1111-4111-8111-111111111111";
const folderId = "folder-1";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("resources.ts deleteFolder", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs to /api/folder/[folder-id]/delete with projectId in the body", async () => {
    await deleteFolder(folderId, directoryUuid);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`/api/folder/${folderId}/delete`);
    expect((init as RequestInit).method).toBe("POST");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe(directoryUuid);
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });
});

function makeFolder(id: string, parentId: string | null): Folder {
  return { id, type: "folder", name: id, parentId } as Folder;
}

function makeResource(id: string, folderId: string | null): AnyResource {
  return { id, type: "text", name: id, folderId } as AnyResource;
}

describe("resources.ts collectFolderDescendantIds", () => {
  it("returns the folder id plus every nested folder/resource id, excluding unrelated siblings", () => {
    // top -> mid -> leaf, each with a resource; sibling subtree untouched.
    const top = makeFolder("top", null);
    const mid = makeFolder("mid", "top");
    const leaf = makeFolder("leaf", "mid");
    const sibling = makeFolder("sibling", null);

    const topResource = makeResource("top-resource", "top");
    const midResource = makeResource("mid-resource", "mid");
    const leafResource = makeResource("leaf-resource", "leaf");
    const siblingResource = makeResource("sibling-resource", "sibling");

    const result = collectFolderDescendantIds(
      [top, mid, leaf, sibling],
      [topResource, midResource, leafResource, siblingResource],
      "top",
    );

    expect(result).toEqual(
      new Set([
        "top",
        "mid",
        "leaf",
        "top-resource",
        "mid-resource",
        "leaf-resource",
      ]),
    );
    expect(result.has("sibling")).toBe(false);
    expect(result.has("sibling-resource")).toBe(false);
  });

  it("returns just the folder id when it has no descendants", () => {
    const lonely = makeFolder("lonely", null);
    const result = collectFolderDescendantIds([lonely], [], "lonely");
    expect(result).toEqual(new Set(["lonely"]));
  });
});
