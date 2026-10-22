// Last Updated: 2026-10-22

/**
 * Feature 91, Task 9 (FR-2, FR-3, FR-4): the bundled-face stylesheet imports
 * exactly the shipped subset/weight files of the Task 6 catalogue from the
 * installed @fontsource packages, carries no remote reference, and the layout
 * no longer links Google hosts or Domine.
 *
 * Known deviation: @fontsource/playwrite-ie ships only the latin subset (no
 * latin-ext file at any weight; experiments.md, "Package justifications"), so
 * only latin is imported for it.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FONT_FAMILY_LIST } from "../../src/lib/fonts/fonts";

const ROOT = path.resolve(__dirname, "../..");
const CSS_PATH = path.join(ROOT, "styles/bundled-fonts.css");
const css = readFileSync(CSS_PATH, "utf8");

const slugOf = (label: string): string =>
  label.toLowerCase().replace(/\s+/g, "-");

/** Subsets imported per family; Playwrite IE has no latin-ext package file. */
const subsetsOf = (label: string): string[] =>
  label === "Playwrite IE" ? ["latin"] : ["latin", "latin-ext"];

function expectedImports(): string[] {
  const out: string[] = [];
  for (const family of FONT_FAMILY_LIST) {
    if (family.kind !== "bundled") continue;
    for (const subset of subsetsOf(family.label)) {
      for (const w of family.weights) {
        out.push(
          `@fontsource/${slugOf(family.label)}/${subset}-${w.weight}.css`,
        );
      }
      if (family.italic400) {
        out.push(
          `@fontsource/${slugOf(family.label)}/${subset}-400-italic.css`,
        );
      }
    }
  }
  return out.sort();
}

const importedSpecifiers = [...css.matchAll(/@import\s+["']([^"']+)["']\s*;/g)]
  .map((m) => m[1])
  .sort();

describe("bundled-fonts.css (FR-2, FR-3)", () => {
  it("imports exactly the catalogue's shipped subset/weight files", () => {
    expect(importedSpecifiers).toEqual(expectedImports());
  });

  it("imports only @fontsource files that exist in node_modules", () => {
    for (const spec of importedSpecifiers) {
      expect(existsSync(path.join(ROOT, "node_modules", spec)), spec).toBe(
        true,
      );
    }
  });

  it("imports no other subset, no Domine and no variable package", () => {
    for (const spec of importedSpecifiers) {
      expect(spec).toMatch(
        /^@fontsource\/[a-z0-9-]+\/latin(-ext)?-\d{3}(-italic)?\.css$/,
      );
      expect(spec).not.toMatch(/cyrillic|greek|vietnamese|domine|variable/);
    }
  });

  it("has no remote reference and no @font-face of its own", () => {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toMatch(/url\(\s*["']?(https?:)?\/\//);
    expect(withoutComments).not.toMatch(/https?:\/\//);
    expect(withoutComments).not.toMatch(/@font-face/);
  });

  it("is imported by the layout and the Storybook preview", () => {
    const layout = readFileSync(path.join(ROOT, "app/layout.tsx"), "utf8");
    const preview = readFileSync(
      path.join(ROOT, ".storybook/preview.tsx"),
      "utf8",
    );
    expect(layout).toMatch(/import\s+["']\.\.\/styles\/bundled-fonts\.css["']/);
    expect(preview).toMatch(
      /import\s+["']\.\.\/styles\/bundled-fonts\.css["']/,
    );
  });
});

describe("app/layout.tsx (FR-4, layout half)", () => {
  const layout = readFileSync(path.join(ROOT, "app/layout.tsx"), "utf8");

  it("has no Google font host and no Domine link", () => {
    expect(layout).not.toContain("fonts.googleapis.com");
    expect(layout).not.toContain("fonts.gstatic.com");
    expect(layout).not.toMatch(/Domine/i);
  });
});
