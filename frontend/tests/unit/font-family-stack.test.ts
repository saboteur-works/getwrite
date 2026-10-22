// Last Updated: 2026-10-21

/**
 * Feature 91, Task 7 (FR-9, FR-21): the single font-family declaration helper
 * and the validator for newly typed "Other..." names.
 *
 * Why the helper quotes: experiments.md Task 3 (e) measured that a stored
 * "Source Serif 4" was applied unquoted (`--gw-body-font-family: Source Serif 4`)
 * and the declaration was invalid, so the body fell back to "IBM Plex Sans",
 * sans-serif and the h1 style attribute carried no font-family at all.
 */
import { describe, expect, it } from "vitest";
import {
  buildFontFamilyValue,
  validateTypedFontName,
} from "../../src/lib/fonts/font-family-stack";

describe("buildFontFamilyValue", () => {
  it("quotes a name and appends the IBM Plex Serif fallback", () => {
    expect(buildFontFamilyValue("Source Serif 4")).toBe(
      '"Source Serif 4", "IBM Plex Serif", serif',
    );
    expect(buildFontFamilyValue("Garamond")).toBe(
      '"Garamond", "IBM Plex Serif", serif',
    );
  });

  it.each(["serif", "sans-serif", "monospace"])(
    "returns the generic keyword %s bare",
    (keyword) => {
      expect(buildFontFamilyValue(keyword)).toBe(keyword);
    },
  );

  it("returns a stored value containing a comma as stored", () => {
    const stored = 'Georgia, "Times New Roman", serif';
    expect(buildFontFamilyValue(stored)).toBe(stored);
  });

  it.each([undefined, null, "", "   ", "\t\n"])(
    "returns nothing for %j",
    (value) => {
      expect(buildFontFamilyValue(value)).toBeUndefined();
    },
  );

  it("does not re-case the name", () => {
    expect(buildFontFamilyValue("domine")).toBe(
      '"domine", "IBM Plex Serif", serif',
    );
    expect(buildFontFamilyValue("Garamond")).toContain('"Garamond"');
  });
});

describe("validateTypedFontName", () => {
  it.each([
    ['"', "double quote"],
    ["'", "single quote"],
    [";", "semicolon"],
    ["{", "open brace"],
    ["}", "close brace"],
    ["\\", "backslash"],
    ["(", "open paren"],
    [")", "close paren"],
    ["<", "less than"],
    [">", "greater than"],
    [",", "comma"],
    ["\u0000", "NUL"],
    ["\n", "newline"],
    ["\t", "tab"],
    ["\u007f", "DEL"],
  ])("refuses a name containing %j (%s)", (char) => {
    const result = validateTypedFontName(`Gar${char}amond`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("accepts Garamond and Source Serif 4", () => {
    expect(validateTypedFontName("Garamond")).toEqual({
      ok: true,
      value: "Garamond",
    });
    expect(validateTypedFontName("Source Serif 4")).toEqual({
      ok: true,
      value: "Source Serif 4",
    });
  });

  it("trims", () => {
    expect(validateTypedFontName("  Garamond  ")).toEqual({
      ok: true,
      value: "Garamond",
    });
  });

  it("treats an empty name as accepted and empty (clears)", () => {
    expect(validateTypedFontName("")).toEqual({ ok: true, value: "" });
    expect(validateTypedFontName("   ")).toEqual({ ok: true, value: "" });
  });
});

describe("stored values bypass the validator", () => {
  it("applies a stored comma value while the same text typed is refused", () => {
    const text = 'Georgia, "Times New Roman", serif';
    expect(buildFontFamilyValue(text)).toBe(text);
    expect(validateTypedFontName(text).ok).toBe(false);
  });
});
