// Last Updated: 2026-10-22

/**
 * Feature 91, Task 22 (FR-7): THIRD_PARTY_FONTS.txt names every bundled family
 * of the font catalogue with the copyright line its installed @fontsource
 * package carries (first line of the package LICENSE), carries the SIL OFL text
 * once, and exists at the repo root and at frontend/public/ (the copy that
 * Next serves and exports). Presence in the build outputs is Task 24's check.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FONT_FAMILY_LIST } from "../../src/lib/fonts/fonts";

const FRONTEND = path.resolve(__dirname, "../..");
const ROOT_FILE = path.resolve(FRONTEND, "..", "THIRD_PARTY_FONTS.txt");
const PUBLIC_FILE = path.join(FRONTEND, "public", "THIRD_PARTY_FONTS.txt");

const slugOf = (label: string): string =>
  label.toLowerCase().replace(/\s+/g, "-");

const bundledFamilies = FONT_FAMILY_LIST.filter((f) => f.kind === "bundled");

function packageCopyrightLine(label: string): string {
  const licensePath = path.join(
    FRONTEND,
    "node_modules",
    "@fontsource",
    slugOf(label),
    "LICENSE",
  );
  const first = readFileSync(licensePath, "utf8").split("\n")[0]?.trim();
  if (first === undefined || first.length === 0) {
    throw new Error(`No copyright line in ${licensePath}`);
  }
  return first;
}

describe("THIRD_PARTY_FONTS.txt (FR-7)", () => {
  it("exists at the repo root and at the public path", () => {
    expect(existsSync(ROOT_FILE)).toBe(true);
    expect(existsSync(PUBLIC_FILE)).toBe(true);
  });

  it("the public copy is identical to the root file", () => {
    expect(readFileSync(PUBLIC_FILE, "utf8")).toBe(
      readFileSync(ROOT_FILE, "utf8"),
    );
  });

  it("names every bundled family with its package copyright line", () => {
    const text = readFileSync(ROOT_FILE, "utf8");
    expect(bundledFamilies.length).toBeGreaterThan(0);
    for (const family of bundledFamilies) {
      const header = `Family: ${family.label}\n`;
      const start = text.indexOf(header);
      expect(start, `${family.label} section`).toBeGreaterThanOrEqual(0);
      const nextHeader = text.indexOf("\nFamily: ", start + header.length);
      const section = text.slice(
        start,
        nextHeader === -1 ? undefined : nextHeader,
      );
      expect(section, `${family.label} copyright`).toContain(
        packageCopyrightLine(family.label),
      );
      expect(section).toContain(`@fontsource/${slugOf(family.label)}`);
    }
  });

  it("carries the SIL Open Font License text exactly once", () => {
    const text = readFileSync(ROOT_FILE, "utf8");
    const matches = text.match(/SIL OPEN FONT LICENSE Version 1\.1/g) ?? [];
    expect(matches).toHaveLength(1);
  });
});
