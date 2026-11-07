import { describe, it, expect } from "vitest";

import {
  dedupeSubtypeLabels,
  getFieldsOfferedOnFolder,
  isFieldVisibleForSubtype,
  isLabelInList,
  normalizeSubtypeLabel,
} from "../../src/lib/models/field-subtype-scope";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import type { MetadataSchema } from "../../src/lib/models/types";

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

  describe("getFieldsOfferedOnFolder (Feature 102, FR-9, FR-10)", () => {
    const schema: MetadataSchema = {
      groups: [
        ...DEFAULT_METADATA_SCHEMA.groups,
        {
          id: "custom",
          label: "Custom",
          fields: [
            { key: "plain", label: "Plain", type: "text" },
            {
              key: "marked",
              label: "Marked",
              type: "text",
              appliesToFolders: true,
            },
            {
              key: "scene-only",
              label: "Scene only",
              type: "text",
              appliesTo: ["Scene"],
            },
            {
              key: "marked-chapter",
              label: "Marked chapter",
              type: "text",
              appliesToFolders: true,
              appliesTo: ["Chapter"],
            },
          ],
        },
      ],
    };
    const keys = (subtype: string | undefined): string[] =>
      getFieldsOfferedOnFolder(schema, subtype).map((f) => f.key);

    it("case 1: no appliesTo, flag off, is offered on a folder", () => {
      expect(keys(undefined)).toContain("plain");
      expect(keys("Scene")).toContain("plain");
    });

    it("case 2: no appliesTo, flag on, is offered on a folder", () => {
      expect(keys(undefined)).toContain("marked");
      expect(keys("Scene")).toContain("marked");
    });

    it("case 3: appliesTo matches the folder subtype, flag off, is NOT offered", () => {
      expect(keys("Scene")).not.toContain("scene-only");
      expect(keys("  sCENE ")).not.toContain("scene-only");
    });

    it("case 4: appliesTo matches the folder subtype, flag on, is offered (normalised)", () => {
      expect(keys("Chapter")).toContain("marked-chapter");
      expect(keys("  cHAPTER ")).toContain("marked-chapter");
    });

    it("case 5: appliesTo does not match the folder subtype, flag on, is NOT offered", () => {
      expect(keys("Scene")).not.toContain("marked-chapter");
      expect(keys(undefined)).not.toContain("marked-chapter");
    });

    it("offers exactly notes, plain and marked on a folder with no subtype", () => {
      expect(keys(undefined)).toEqual(["notes", "plain", "marked"]);
    });

    it("offers no built-in field other than notes", () => {
      const builtIns = DEFAULT_METADATA_SCHEMA.groups.flatMap((g) =>
        g.fields.map((f) => f.key),
      );
      const offered = keys("Chapter").filter((k) => builtIns.includes(k));
      expect(offered).toEqual(["notes"]);
    });

    it("offers a field with appliesToFolders and no appliesTo on documents too", () => {
      const field = schema.groups[2].fields.find((f) => f.key === "marked")!;
      expect(field.appliesTo).toBeUndefined();
      expect(
        isFieldVisibleForSubtype(field.key, field.appliesTo, undefined),
      ).toBe(true);
      expect(
        isFieldVisibleForSubtype(field.key, field.appliesTo, "Scene"),
      ).toBe(true);
    });

    it("agrees with isFieldVisibleForSubtype, which keeps its three-argument contract", () => {
      expect(isFieldVisibleForSubtype).toHaveLength(3);
      const builtIns = new Set(
        DEFAULT_METADATA_SCHEMA.groups.flatMap((g) =>
          g.fields.map((f) => f.key),
        ),
      );
      for (const subtype of [undefined, "Scene", "chapter", "Other"]) {
        const expected = schema.groups
          .flatMap((g) => g.fields)
          .filter(
            (f) =>
              !builtIns.has(f.key) &&
              isFieldVisibleForSubtype(f.key, f.appliesTo, subtype) &&
              (!f.appliesTo?.length || f.appliesToFolders === true),
          )
          .map((f) => f.key);
        const customOffered = keys(subtype).filter((k) => !builtIns.has(k));
        expect(customOffered).toEqual(expected);
      }
    });

    it("does not mutate the schema", () => {
      const before = structuredClone(schema);
      getFieldsOfferedOnFolder(schema, "Scene");
      expect(schema).toEqual(before);
    });
  });
});
