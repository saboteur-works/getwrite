// Last Updated: 2026-10-22

/**
 * Feature 91, Task 8 (FR-11, FR-12, FR-21): value codecs for the shared
 * typography component. Stored forms are never rewritten unless edited.
 */
import { describe, expect, it } from "vitest";
import {
  formatEmSpacing,
  formatPxSize,
  normalizeEditedColour,
  parseEmSpacing,
  parsePxSize,
  weightSelectState,
  weightsForFamily,
} from "../../src/lib/typography-values";

describe("px size codec", () => {
  it("parses 28px to 28 and formats back to 28px", () => {
    expect(parsePxSize("28px")).toEqual({ ok: true, value: 28 });
    expect(formatPxSize(28)).toBe("28px");
  });
  it("round-trips a decimal", () => {
    expect(parsePxSize("18.5px")).toEqual({ ok: true, value: 18.5 });
    expect(formatPxSize(18.5)).toBe("18.5px");
  });
  it.each(["1.5rem", "2em", "large", "", "px", "12"])(
    "reports %j unparseable and returns it as stored",
    (stored) => {
      expect(parsePxSize(stored)).toEqual({ ok: false, stored });
    },
  );
});

describe("em letter-spacing codec", () => {
  it("parses 0.05em to 0.05 and formats back", () => {
    expect(parseEmSpacing("0.05em")).toEqual({ ok: true, value: 0.05 });
    expect(formatEmSpacing(0.05)).toBe("0.05em");
  });
  it("reports a non-em value unparseable and returned as stored", () => {
    expect(parseEmSpacing("2px")).toEqual({ ok: false, stored: "2px" });
    expect(parseEmSpacing("normal")).toEqual({ ok: false, stored: "normal" });
  });
});

describe("normalizeEditedColour", () => {
  it("normalises a picked colour to lowercase #rrggbb", () => {
    expect(normalizeEditedColour("#AABBCC")).toBe("#aabbcc");
  });
  it("expands a typed #FFF on edit", () => {
    expect(normalizeEditedColour("#FFF")).toBe("#ffffff");
  });
  it("returns an unparseable edit unchanged (never invents a colour)", () => {
    expect(normalizeEditedColour("red")).toBe("red");
  });
});

const labels = (family: string): string[] =>
  weightsForFamily(family).map((o) => o.label);

describe("weightsForFamily", () => {
  it("offers labelled weights per FR-11", () => {
    expect(labels("Playwrite IE")).toEqual([
      "Thin 100",
      "ExtraLight 200",
      "Light 300",
      "Regular 400",
    ]);
    expect(labels("Source Serif 4")).toEqual(["Regular 400", "Semibold 600"]);
    expect(labels("IBM Plex Serif")).toEqual([
      "Regular 400",
      "Medium 500",
      "Bold 700",
    ]);
    expect(labels("Inter")).toEqual(["Regular 400", "Medium 500", "Bold 700"]);
  });
  it("offers 400 and 700 for generic, system and unlisted names", () => {
    for (const f of ["serif", "Arial", "Garamond", ""]) {
      expect(labels(f)).toEqual(["Regular 400", "Bold 700"]);
    }
  });
  it("matches the family case-insensitively", () => {
    expect(labels("source serif 4")).toEqual(["Regular 400", "Semibold 600"]);
  });
  it("uses numeric string values and no 'Use default' entry", () => {
    expect(weightsForFamily("Lato").map((o) => o.value)).toEqual([
      "400",
      "700",
    ]);
  });
});

describe("weightSelectState", () => {
  it("selects an offered stored weight with no extra", () => {
    expect(weightSelectState("Lato", "700")).toEqual({
      selected: "700",
      extra: null,
    });
  });
  it("shows keywords normal and bold as 400 and 700 for display only", () => {
    expect(weightSelectState("Lato", "normal").selected).toBe("400");
    expect(weightSelectState("Lato", "bold").selected).toBe("700");
    expect(weightSelectState("Lato", "bold").extra).toBeNull();
  });
  it("reports lighter and bolder as extras with the stored string unchanged", () => {
    for (const w of ["lighter", "bolder"]) {
      const s = weightSelectState("Lato", w);
      expect(s.extra?.value).toBe(w);
      expect(s.extra?.label).toContain(w);
      expect(s.selected).toBe(w);
    }
  });
  it("reports 700 for Source Serif 4 as an extra, stored string unchanged", () => {
    const s = weightSelectState("Source Serif 4", "700");
    expect(s.extra?.value).toBe("700");
    expect(s.selected).toBe("700");
  });
  it("reports keyword bold for Source Serif 4 as an extra labelled 700, value unchanged", () => {
    const s = weightSelectState("Source Serif 4", "bold");
    expect(s.extra).toEqual({ value: "bold", label: "700 (current value)" });
  });
  it("treats empty or missing as Use default with no extra", () => {
    expect(weightSelectState("Lato", "")).toEqual({
      selected: "",
      extra: null,
    });
    expect(weightSelectState("Lato", undefined)).toEqual({
      selected: "",
      extra: null,
    });
  });
});
