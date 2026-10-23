// Last Updated: 2026-10-22

/**
 * Feature 91, Task 11 (FR-9): no non-test source file under `app`,
 * `components` or `src` may build a `font-family` / `fontFamily` value from a
 * family string without `buildFontFamilyValue`.
 *
 * Method: every source line that assigns `fontFamily:` or
 * `"--gw-body-font-family":` is classified by its right-hand side. A string
 * literal, a CSS `var(...)`, an UPPER_CASE constant, a Zod/type declaration
 * and the explicitly listed state reads are not builds. Anything else must
 * contain `buildFontFamilyValue(` on that line. The heading style attribute
 * builder is a dynamic `${property}: ${value}` template, so it is checked by
 * name.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["app", "components", "src"];

/** Reads of editor state, not family builds (file suffix, reason). */
const NON_BUILD_ALLOWLIST: Record<string, string> = {
  "components/Editor/MenuBar/menuBarState.tsx":
    "reads the textStyle mark attribute into toolbar state; Task 20 owns the toolbar",
  "components/Editor/MenuBar/rendered-typography.ts":
    "reads the browser's computed font-family at the cursor for toolbar display (FR-10, amended 2026-10-23)",
};

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "node_modules" || name === ".next") return [];
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) && !/\.(test|stories)\./.test(name)
      ? [full]
      : [];
  });
}

/**
 * Writes of the stored value into form state (`patchHeading(...)`,
 * `patchBody(...)`): the stored family is kept as typed/chosen, never turned
 * into a declaration.
 */
const STATE_WRITE = /\bpatch(?:Heading|Body)\(/;

const ASSIGNMENT = /(?:\bfontFamily|"--gw-body-font-family")\s*:\s*(.+)$/;

function isBuild(rhs: string): boolean {
  const value = rhs.trim();
  if (/^["'`]/.test(value)) return false; // literal
  if (/^[A-Z][A-Z0-9_]*\b/.test(value)) return false; // constant
  if (/^(string|z\.)/.test(value)) return false; // type / schema
  return true;
}

function offenders(): string[] {
  const found: string[] = [];
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      const rel = path.relative(ROOT, file);
      if (NON_BUILD_ALLOWLIST[rel]) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, index) => {
          const match = ASSIGNMENT.exec(line);
          if (
            match &&
            !STATE_WRITE.test(line) &&
            isBuild(match[1]) &&
            !line.includes("buildFontFamilyValue(")
          ) {
            found.push(`${rel}:${index + 1}: ${line.trim()}`);
          }
        });
    }
  }
  return found;
}

describe("font-family call sites", () => {
  it("every family build goes through buildFontFamilyValue", () => {
    expect(offenders()).toEqual([]);
  });

  it("the dynamic heading style builder uses the helper", () => {
    const source = readFileSync(
      path.join(ROOT, "src/lib/editor-heading-settings.ts"),
      "utf8",
    );
    expect(source).toContain("buildFontFamilyValue(");
  });

  it("the classifier flags an unwrapped build (self-check)", () => {
    const rhs = ASSIGNMENT.exec(
      "style={{ fontFamily: draft.fontFamily || undefined }}",
    );
    expect(rhs && isBuild(rhs[1])).toBe(true);
  });
});
