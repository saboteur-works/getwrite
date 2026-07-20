/**
 * Regression coverage for the media-serving self-heal: a GetWrite image node's
 * displayed `src` is reconstructed from its stable `resourceId` + the active
 * project's directory id, so a document that persisted an older serving URL —
 * notably the pre-ADR-018 `?projectPath=` form the hard-cutover
 * `/api/resource/[resource-id]/file` route now rejects with a 400 — renders
 * correctly on load without any content migration.
 */
import { describe, it, expect } from "vitest";
import { resolveGetWriteImageSrc } from "../../components/Editor/Extensions/GetWriteImage";

const DIR_ID = "aaaaaaaa-1111-4111-8111-111111111111";

describe("resolveGetWriteImageSrc", () => {
  it("rebuilds the serving URL from resourceId + projectId when both are present", () => {
    expect(resolveGetWriteImageSrc("res-1", null, DIR_ID)).toBe(
      `/api/resource/res-1/file?projectId=${encodeURIComponent(DIR_ID)}`,
    );
  });

  it("self-heals a stale ?projectPath= src persisted before the hard cutover", () => {
    const staleSrc = "/api/resource/res-1/file?projectPath=%2Fold%2Fabsolute";

    const resolved = resolveGetWriteImageSrc("res-1", staleSrc, DIR_ID);

    expect(resolved).toBe(
      `/api/resource/res-1/file?projectId=${encodeURIComponent(DIR_ID)}`,
    );
    expect(resolved).not.toContain("projectPath=");
  });

  it("encodes the projectId in the query string", () => {
    const resolved = resolveGetWriteImageSrc("res-1", null, "a b/c");
    expect(resolved).toBe("/api/resource/res-1/file?projectId=a%20b%2Fc");
  });

  it("falls back to the stored src when no project is active (e.g. markdown export)", () => {
    const storedSrc = "/api/resource/res-1/file?projectId=old-dir";
    expect(resolveGetWriteImageSrc("res-1", storedSrc, null)).toBe(storedSrc);
  });

  it("falls back to the stored src for a plain image with no resourceId", () => {
    expect(
      resolveGetWriteImageSrc(null, "https://example.com/x.png", DIR_ID),
    ).toBe("https://example.com/x.png");
  });

  it("returns an empty string when neither a rebuildable id nor a stored src exists", () => {
    expect(resolveGetWriteImageSrc(null, null, DIR_ID)).toBe("");
    expect(resolveGetWriteImageSrc(null, undefined, null)).toBe("");
  });
});
