/**
 * Regression coverage for Task 9g: `mediaFileUrl` (and the `MediaView`
 * component that calls it) must build the file-serving URL with the
 * tenant-scoped `projectId` query param — the active project's on-disk
 * directory basename — never the legacy `projectPath` query param the
 * hard-cutover `/api/resource/[resource-id]/file` route now rejects.
 *
 * The fixture below is the same FR12 basename-vs-id shape used elsewhere
 * (e.g. `resources-api.test.ts`, `revision-transport-service.test.ts`): the
 * directory basename (`rootPath`'s trailing segment) and `project.json`'s
 * internal `id` are two independently generated UUIDs that must never be
 * conflated.
 */
import { describe, it, expect } from "vitest";
import { mediaFileUrl } from "../../components/WorkArea/Media/MediaView";

describe("mediaFileUrl", () => {
  it("builds the file-serving URL with projectId (the directory basename) as a query parameter", () => {
    const directoryUuid = "aaaaaaaa-1111-4111-8111-111111111111";
    expect(mediaFileUrl("abc-123", directoryUuid)).toBe(
      `/api/resource/abc-123/file?projectId=${encodeURIComponent(directoryUuid)}`,
    );
  });

  it("does not build a projectPath query parameter", () => {
    const directoryUuid = "aaaaaaaa-1111-4111-8111-111111111111";
    const url = mediaFileUrl("abc-123", directoryUuid);
    expect(url).not.toContain("projectPath=");
  });

  it("encodes characters that would otherwise break the query string", () => {
    const url = mediaFileUrl("id", "a b&c");
    expect(url).toContain("projectId=a%20b%26c");
    expect(url.startsWith("/api/resource/id/file?")).toBe(true);
  });
});
