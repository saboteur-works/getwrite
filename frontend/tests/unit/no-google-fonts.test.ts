// Last Updated: 2026-10-22

/**
 * Feature 91, Task 21 (FR-4, FR-5, FR-8): no Google font host appears in any
 * source file under `app`, `components` or `src`, and the retired Domine font
 * and the old loader/input are gone from non-test source.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|css|mdx)$/;
const SELF = path.resolve(__filename);

function listSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSource(full));
    else if (SOURCE_EXT.test(entry.name) && full !== SELF) out.push(full);
  }
  return out;
}

function filesContaining(dirs: readonly string[], pattern: RegExp): string[] {
  return dirs
    .flatMap((d) => listSource(path.join(ROOT, d)))
    .filter((f) => pattern.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(ROOT, f));
}

describe("no Google fonts and no Domine in source", () => {
  it("names neither Google font host under app, components or src", () => {
    expect(
      filesContaining(
        ["app", "components", "src"],
        /fonts\.googleapis\.com|fonts\.gstatic\.com/,
      ),
    ).toEqual([]);
  });

  it("names Domine / domine / isDomine in no non-test source", () => {
    expect(
      filesContaining(
        ["app", "components", "src", "styles", "stories"],
        /domine/i,
      ),
    ).toEqual([]);
  });

  it("names the loader and the old input in no source", () => {
    expect(
      filesContaining(
        ["app", "components", "src", "stories"],
        /loadGoogleFont|FontFamilyInput|WEB_SAFE_FONTS/,
      ),
    ).toEqual([]);
  });
});
