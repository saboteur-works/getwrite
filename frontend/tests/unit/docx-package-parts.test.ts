import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { detectDocxPackageFeatures } from "../../src/lib/models/docx/package-parts";

const FIXTURES_DIR = path.join(
  __dirname,
  "..",
  "fixtures",
  "docx",
);

function loadFixture(fileName: string): Buffer {
  return readFileSync(path.join(FIXTURES_DIR, fileName));
}

describe("detectDocxPackageFeatures", () => {
  it("detects comments in comments.docx and nothing else", async () => {
    const result = await detectDocxPackageFeatures(loadFixture("comments.docx"));

    expect(result.commentCount).toBeGreaterThan(0);
    expect(result.trackedChangeCount).toBe(0);
    expect(result.imageCount).toBe(0);
  });

  it("detects tracked changes in tracked-changes.docx and nothing else", async () => {
    const result = await detectDocxPackageFeatures(
      loadFixture("tracked-changes.docx"),
    );

    expect(result.trackedChangeCount).toBeGreaterThan(0);
    expect(result.commentCount).toBe(0);
    expect(result.imageCount).toBe(0);
  });

  it("detects an image in with-image.docx and nothing else", async () => {
    const result = await detectDocxPackageFeatures(
      loadFixture("with-image.docx"),
    );

    expect(result.imageCount).toBeGreaterThan(0);
    expect(result.commentCount).toBe(0);
    expect(result.trackedChangeCount).toBe(0);
  });

  it("detects none of the three features in no-headings.docx", async () => {
    const result = await detectDocxPackageFeatures(
      loadFixture("no-headings.docx"),
    );

    expect(result).toEqual({
      commentCount: 0,
      trackedChangeCount: 0,
      imageCount: 0,
    });
  });
});
