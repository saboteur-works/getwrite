import { describe, it, expect } from "vitest";

import {
  dedupeSubtypeLabels,
  isFieldVisibleForSubtype,
  isLabelInList,
  normalizeSubtypeLabel,
} from "../../src/lib/models/field-subtype-scope";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";

describe("models/field-subtype-scope", () => {
  describe("normalizeSubtypeLabel", () => {
    it("trims then lowercases", () => {
      expect(normalizeSubtypeLabel("  Scene ")).toBe("scene");
    });

    it("returns an empty string for whitespace-only input", () => {
      expect(normalizeSubtypeLabel("   ")).toBe("");
    });
  });

  describe("isFieldVisibleForSubtype", () => {
    it("treats a field with no appliesTo as visible for any subtype and for none", () => {
      expect(isFieldVisibleForSubtype("mood", undefined, "Scene")).toBe(true);
      expect(isFieldVisibleForSubtype("mood", undefined, undefined)).toBe(true);
    });

    it("treats an empty appliesTo as unrestricted", () => {
      expect(isFieldVisibleForSubtype("mood", [], "Scene")).toBe(true);
      expect(isFieldVisibleForSubtype("mood", [], undefined)).toBe(true);
    });

    it("hides a restricted field when the resource has no subtype", () => {
      expect(isFieldVisibleForSubtype("mood", ["Scene"], undefined)).toBe(
        false,
      );
    });

    it("shows a restricted field only when the subtype matches an entry", () => {
      expect(isFieldVisibleForSubtype("mood", ["Scene"], "Scene")).toBe(true);
      expect(isFieldVisibleForSubtype("mood", ["Scene"], "Chapter")).toBe(
        false,
      );
    });

    it("matches insensitive to case and surrounding whitespace", () => {
      expect(isFieldVisibleForSubtype("mood", [" scene "], "SCENE")).toBe(true);
      expect(isFieldVisibleForSubtype("mood", ["Scene"], "  scene")).toBe(true);
    });

    it("ignores a restriction on a built-in key", () => {
      const builtInKeys = DEFAULT_METADATA_SCHEMA.groups.flatMap((g) =>
        g.fields.map((f) => f.key),
      );
      expect(builtInKeys.length).toBeGreaterThan(0);
      for (const key of builtInKeys) {
        expect(isFieldVisibleForSubtype(key, ["Scene"], undefined)).toBe(true);
        expect(isFieldVisibleForSubtype(key, ["Scene"], "Chapter")).toBe(true);
      }
    });

    it("takes no project list: the FR-18 worked example still matches", () => {
      // List held "Scene", was replaced by "scene"; resource stores "Scene",
      // field is restricted to "Scene". Matching is by label only.
      expect(isFieldVisibleForSubtype("mood", ["Scene"], "Scene")).toBe(true);
      expect(isFieldVisibleForSubtype.length).toBe(3);
    });
  });

  describe("isLabelInList", () => {
    it("finds a label under the comparison key", () => {
      expect(isLabelInList("Scene", ["scene", "Chapter"])).toBe(true);
      expect(isLabelInList(" CHAPTER ", ["scene", "Chapter"])).toBe(true);
    });

    it("returns false when absent or when the list is empty", () => {
      expect(isLabelInList("Act", ["scene"])).toBe(false);
      expect(isLabelInList("Scene", [])).toBe(false);
    });
  });

  describe("dedupeSubtypeLabels", () => {
    it("drops later duplicates under the key, keeping first and order", () => {
      expect(dedupeSubtypeLabels(["Scene", "Act", "scene", " ACT "])).toEqual([
        "Scene",
        "Act",
      ]);
    });

    it("returns an empty array for an empty input and does not mutate", () => {
      const input: string[] = ["A", "a"];
      expect(dedupeSubtypeLabels([])).toEqual([]);
      dedupeSubtypeLabels(input);
      expect(input).toEqual(["A", "a"]);
    });
  });
});
