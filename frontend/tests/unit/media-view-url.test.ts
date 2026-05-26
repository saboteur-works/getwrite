import { describe, it, expect } from "vitest";
import { mediaFileUrl } from "../../components/WorkArea/Media/MediaView";

describe("mediaFileUrl", () => {
  it("builds the file-serving URL with the project path as a query parameter", () => {
    expect(mediaFileUrl("abc-123", "/Users/me/projects/novel")).toBe(
      "/api/resource/abc-123/file?projectPath=%2FUsers%2Fme%2Fprojects%2Fnovel",
    );
  });

  it("encodes path characters that would otherwise break the query string", () => {
    const url = mediaFileUrl("id", "/a b/c&d");
    expect(url).toContain("projectPath=%2Fa%20b%2Fc%26d");
    expect(url.startsWith("/api/resource/id/file?")).toBe(true);
  });
});
