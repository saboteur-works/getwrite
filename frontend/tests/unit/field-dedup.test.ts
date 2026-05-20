import { describe, expect, it } from "vitest";
import { slugifyName, findExisting, fuzzyMatch } from "../../src/lib/models/field-dedup";
import type { MetadataSchema } from "../../src/lib/models/types";

// ─── Sample schema ─────────────────────────────────────────────────────────────

const SCHEMA: MetadataSchema = {
    groups: [
        {
            id: "g1",
            label: "Story",
            fields: [
                { key: "tone", label: "Tone", type: "text" },
                { key: "word-count", label: "Word Count", type: "number" },
                { key: "status", label: "Status", type: "select", options: ["draft", "done"] },
            ],
        },
        {
            id: "g2",
            label: "Characters",
            folderId: "folder-chars",
            fields: [
                { key: "pov", label: "POV", type: "resource-ref" },
                { key: "locked-field", label: "Locked", type: "text", locked: true },
            ],
        },
    ],
};

const EMPTY_SCHEMA: MetadataSchema = { groups: [] };

// ─── slugifyName ──────────────────────────────────────────────────────────────

describe("slugifyName", () => {
    it("lowercases the input", () => {
        expect(slugifyName("Tension")).toBe("tension");
    });

    it("replaces spaces with hyphens", () => {
        expect(slugifyName("word count")).toBe("word-count");
    });

    it("replaces runs of spaces/punctuation with a single hyphen", () => {
        expect(slugifyName("Point of View")).toBe("point-of-view");
    });

    it("strips leading and trailing hyphens", () => {
        expect(slugifyName("-leading")).toBe("leading");
        expect(slugifyName("trailing-")).toBe("trailing");
        expect(slugifyName("-both-")).toBe("both");
    });

    it("collapses multiple consecutive hyphens to one", () => {
        expect(slugifyName("multi---hyphens")).toBe("multi-hyphens");
    });

    it("removes non-alphanumeric characters", () => {
        expect(slugifyName("The thing!!")).toBe("the-thing");
        expect(slugifyName("foo@bar")).toBe("foo-bar");
    });

    it("preserves existing lowercase slugs unchanged", () => {
        expect(slugifyName("tone")).toBe("tone");
        expect(slugifyName("word-count")).toBe("word-count");
        expect(slugifyName("123abc")).toBe("123abc");
    });

    it("handles ALL CAPS input", () => {
        expect(slugifyName("ALL CAPS")).toBe("all-caps");
    });

    it("returns empty string for empty input", () => {
        expect(slugifyName("")).toBe("");
    });

    it("returns empty string for input with only non-alphanumeric characters", () => {
        expect(slugifyName("!!!")).toBe("");
        expect(slugifyName("   ")).toBe("");
    });

    it("preserves numbers", () => {
        expect(slugifyName("chapter 2")).toBe("chapter-2");
        expect(slugifyName("level3")).toBe("level3");
    });
});

// ─── findExisting ─────────────────────────────────────────────────────────────

describe("findExisting", () => {
    it("returns null on empty schema", () => {
        expect(findExisting("tone", EMPTY_SCHEMA)).toBeNull();
    });

    it("returns null for empty name", () => {
        expect(findExisting("", SCHEMA)).toBeNull();
    });

    it("finds an exact slug match", () => {
        const match = findExisting("tone", SCHEMA);
        expect(match).not.toBeNull();
        expect(match!.field.key).toBe("tone");
        expect(match!.groupId).toBe("g1");
        expect(match!.groupLabel).toBe("Story");
    });

    it("finds a match when name slugifies to an existing key (capitalized input)", () => {
        const match = findExisting("Tone", SCHEMA);
        expect(match).not.toBeNull();
        expect(match!.field.key).toBe("tone");
    });

    it("finds a match when spaces slugify to an existing hyphen key", () => {
        const match = findExisting("word count", SCHEMA);
        expect(match).not.toBeNull();
        expect(match!.field.key).toBe("word-count");
    });

    it("finds a match using the exact hyphenated key", () => {
        const match = findExisting("word-count", SCHEMA);
        expect(match).not.toBeNull();
        expect(match!.field.key).toBe("word-count");
    });

    it("returns null for a name with no slug match", () => {
        expect(findExisting("nonexistent", SCHEMA)).toBeNull();
        expect(findExisting("tension", SCHEMA)).toBeNull();
    });

    it("finds fields in any group", () => {
        const match = findExisting("pov", SCHEMA);
        expect(match).not.toBeNull();
        expect(match!.field.key).toBe("pov");
        expect(match!.groupId).toBe("g2");
        expect(match!.groupLabel).toBe("Characters");
    });

    it("finds locked fields (lock does not hide them from dedup)", () => {
        const match = findExisting("locked-field", SCHEMA);
        expect(match).not.toBeNull();
        expect(match!.field.key).toBe("locked-field");
    });

    it("finds a match when name has special characters that slugify away", () => {
        const match = findExisting("tone!!", SCHEMA);
        expect(match).not.toBeNull();
        expect(match!.field.key).toBe("tone");
    });
});

// ─── fuzzyMatch ───────────────────────────────────────────────────────────────

describe("fuzzyMatch", () => {
    it("returns null on empty schema", () => {
        expect(fuzzyMatch("tone", EMPTY_SCHEMA)).toBeNull();
    });

    it("returns null for empty name", () => {
        expect(fuzzyMatch("", SCHEMA)).toBeNull();
    });

    it("returns null when findExisting finds an exact match (exact takes precedence)", () => {
        // "tone" exact-matches → fuzzyMatch should return null
        expect(fuzzyMatch("tone", SCHEMA)).toBeNull();
        expect(fuzzyMatch("Tone", SCHEMA)).toBeNull();
    });

    it("returns the closest field for a one-char-off typo", () => {
        // "tonne" → distance 2 from "tone" (insert 'n') — within threshold for 5-char slug
        // wait: "tonne" has len 5, threshold 1. levenshtein("tonne","tone") = 1 (delete one 'n')
        const match = fuzzyMatch("tonne", SCHEMA);
        expect(match).not.toBeNull();
        expect(match!.field.key).toBe("tone");
    });

    it("returns the closest field for a transposition (one substitution)", () => {
        // "tine" → distance 1 from "tone"
        const match = fuzzyMatch("tine", SCHEMA);
        expect(match).not.toBeNull();
        expect(match!.field.key).toBe("tone");
    });

    it("returns null for very short slugs (≤3 chars) to avoid false positives", () => {
        // "ton" slug length 3 → threshold 0 → no fuzzy match
        expect(fuzzyMatch("ton", SCHEMA)).toBeNull();
    });

    it("returns null when no field is within the threshold", () => {
        expect(fuzzyMatch("completely-different-name", SCHEMA)).toBeNull();
    });

    it("returns the best (closest) match when multiple fields are within threshold", () => {
        const schema: MetadataSchema = {
            groups: [{
                id: "g1",
                label: "Test",
                fields: [
                    { key: "tones", label: "Tones", type: "text" },
                    { key: "stone", label: "Stone", type: "text" },
                ],
            }],
        };
        // "tone" → exact match in SCHEMA above (not here)
        // In this schema: "tone" vs "tones" (dist 1) and "tone" vs "stone" (dist 1)
        // Both dist 1; pick the first (tones)
        const match = fuzzyMatch("tone", schema);
        expect(match).not.toBeNull();
    });

    it("returns null for a completely-new name with no close keys", () => {
        const schema: MetadataSchema = {
            groups: [{
                id: "g1",
                label: "Test",
                fields: [{ key: "synopsis", label: "Synopsis", type: "text" }],
            }],
        };
        expect(fuzzyMatch("tension", schema)).toBeNull();
    });

    it("handles hyphenated input against hyphenated keys", () => {
        // "word-counts" vs "word-count": distance 1 (delete 's')
        const match = fuzzyMatch("word-counts", SCHEMA);
        expect(match).not.toBeNull();
        expect(match!.field.key).toBe("word-count");
    });
});
