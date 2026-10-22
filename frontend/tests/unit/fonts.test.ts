import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as fontsModule from "../../src/lib/fonts/fonts";
import { FONT_FAMILY_LIST, OTHER_FONT_OPTION } from "../../src/lib/fonts/fonts";

const EXPECTED_LIST: readonly string[] = [
  "Inter",
  "Merriweather",
  "Playfair Display",
  "Lato",
  "Source Serif 4",
  "Playwrite IE",
  "Fascinate Inline",
  "IBM Plex Sans",
  "IBM Plex Sans Condensed",
  "IBM Plex Mono",
  "IBM Plex Serif",
  "Arial",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Verdana",
  "Trebuchet MS",
  "serif",
  "sans-serif",
  "monospace",
];

const EXPECTED_WEIGHTS: Readonly<Record<string, readonly number[]>> = {
  Inter: [400, 500, 700],
  Merriweather: [400, 700],
  "Playfair Display": [400, 700],
  Lato: [400, 700],
  "Source Serif 4": [400, 600],
  "Playwrite IE": [100, 200, 300, 400],
  "Fascinate Inline": [400],
  "IBM Plex Sans": [400, 700],
  "IBM Plex Sans Condensed": [400, 700],
  "IBM Plex Mono": [400, 500],
  "IBM Plex Serif": [400, 500, 700],
};

describe("font catalogue", () => {
  it("exports the list in the FR-8 order, without Other...", () => {
    expect(FONT_FAMILY_LIST.map((f) => f.label)).toEqual(EXPECTED_LIST);
    expect(OTHER_FONT_OPTION).toBe("Other...");
    expect(FONT_FAMILY_LIST.map((f) => f.label)).not.toContain(
      OTHER_FONT_OPTION,
    );
  });

  it("excludes Garamond, Helvetica, Palatino, Tahoma and Domine", () => {
    const labels = FONT_FAMILY_LIST.map((f) => f.label.toLowerCase());
    for (const name of [
      "garamond",
      "helvetica",
      "palatino",
      "tahoma",
      "domine",
    ]) {
      expect(labels).not.toContain(name);
    }
  });

  it("ships exactly the specified weights per bundled family", () => {
    for (const [label, weights] of Object.entries(EXPECTED_WEIGHTS)) {
      const entry = FONT_FAMILY_LIST.find((f) => f.label === label);
      expect(entry?.kind).toBe("bundled");
      expect(entry?.weights.map((w) => w.weight)).toEqual(weights);
    }
  });

  it("gives every shipped weight a plain label", () => {
    const serif = FONT_FAMILY_LIST.find((f) => f.label === "IBM Plex Serif");
    expect(serif?.weights.map((w) => w.label)).toEqual([
      "Regular",
      "Medium",
      "Bold",
    ]);
    const ie = FONT_FAMILY_LIST.find((f) => f.label === "Playwrite IE");
    expect(ie?.weights.map((w) => w.label)).toEqual([
      "Thin",
      "ExtraLight",
      "Light",
      "Regular",
    ]);
  });

  it("ships 400 italic for IBM Plex Serif only", () => {
    const withItalic = FONT_FAMILY_LIST.filter((f) => f.italic400).map(
      (f) => f.label,
    );
    expect(withItalic).toEqual(["IBM Plex Serif"]);
  });

  it("marks kinds and gives system and generic families no shipped weights", () => {
    const kinds = Object.fromEntries(
      FONT_FAMILY_LIST.map((f) => [f.label, f.kind]),
    );
    expect(kinds["Arial"]).toBe("system");
    expect(kinds["Trebuchet MS"]).toBe("system");
    expect(kinds["serif"]).toBe("generic");
    expect(kinds["monospace"]).toBe("generic");
    for (const f of FONT_FAMILY_LIST.filter((x) => x.kind !== "bundled")) {
      expect(f.weights).toEqual([]);
    }
  });

  it("has one list constant and no function reading installed fonts or the platform", () => {
    const listExports = Object.entries(fontsModule).filter(
      ([, v]: [string, unknown]) =>
        Array.isArray(v) &&
        v.some(
          (e: unknown) => typeof e === "object" && e !== null && "kind" in e,
        ),
    );
    expect(listExports.map(([name]) => name)).toEqual(["FONT_FAMILY_LIST"]);
    expect(
      Object.values(fontsModule).filter((v) => typeof v === "function"),
    ).toEqual([]);
    const source = readFileSync(
      path.join(process.cwd(), "src/lib/fonts/fonts.ts"),
      "utf8",
    );
    for (const token of [
      "navigator",
      "queryLocalFonts",
      "process.platform",
      "userAgent",
      "document.fonts",
    ]) {
      expect(source).not.toContain(token);
    }
  });
});
