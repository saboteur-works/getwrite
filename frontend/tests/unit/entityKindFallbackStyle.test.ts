/**
 * Unit tests for FR-5/OQ-3's combined fallback color+shape utility (Feature
 * 69, Task 5): a deterministic hash-assigned shape (reused from Task 1's
 * `hashEntityKindToShapeName`) paired with the fixed neutral
 * `--entity-kind-default` color-token-slot reference.
 */
import { describe, expect, it } from "vitest";
import {
  ENTITY_KIND_SHAPE_NAMES,
  hashEntityKindToShapeName,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/entityKindShapes";
import {
  ENTITY_KIND_DEFAULT_COLOR_SLOT,
  getEntityKindFallbackStyle,
} from "../../src/lib/models/entity-kind-fallback-style";

describe("getEntityKindFallbackStyle", () => {
  it("returns a shape drawn from the fixed six-shape set for a representative sample of kinds", () => {
    const kinds = [
      "character",
      "place",
      "faction",
      "organization",
      "item",
      "creature",
      "",
      "a",
      "Zx9!@#",
    ];
    for (const kind of kinds) {
      const style = getEntityKindFallbackStyle(kind);
      expect(ENTITY_KIND_SHAPE_NAMES).toContain(style.shape);
    }
  });

  it("is identical across repeated calls for the same entityKind string", () => {
    const first = getEntityKindFallbackStyle("character");
    const second = getEntityKindFallbackStyle("character");
    expect(second).toEqual(first);
  });

  it("is identical across many independent calls, simulating a different device/session", () => {
    // The function is pure and takes no shared mutable state as input — no
    // cache, no counter, no Date/Math.random — so calling it many times in
    // any order, interleaved with other kinds, is an equivalent stand-in for
    // "a different device, a different session, a different discovery
    // order" re-deriving the identical fallback for the same kind string.
    const kind = "faction";
    const results = Array.from({ length: 25 }, (_, index) =>
      getEntityKindFallbackStyle(index % 2 === 0 ? kind : "unrelated-kind"),
    ).filter((_, index) => index % 2 === 0);
    const [first, ...rest] = results;
    for (const result of rest) {
      expect(result).toEqual(first);
    }
  });

  it("always pairs the fallback with the neutral default color slot, never an assignable entity-kind-N slot", () => {
    const kinds = ["character", "place", "faction", "organization", "item"];
    for (const kind of kinds) {
      const style = getEntityKindFallbackStyle(kind);
      expect(style.color).toBe(ENTITY_KIND_DEFAULT_COLOR_SLOT);
      expect(style.color).toBe("entity-kind-default");
      expect(style.color).not.toMatch(/^entity-kind-\d+$/);
    }
  });

  it("documents an accepted hash collision: two distinct kinds landing on the same fallback shape is not a bug", () => {
    // Computed directly from the djb2 hash: both "place" and "creature" hash
    // (mod 6) to the same shape index. FR-5's own "zero writer action"
    // framing accepts this — the fixed six-shape set is smaller than an
    // open-ended entityKind vocabulary, so some collision is expected and
    // tolerated, not a defect to fix.
    const place = getEntityKindFallbackStyle("place");
    const creature = getEntityKindFallbackStyle("creature");
    expect(place.shape).toBe(creature.shape);
    expect(place.shape).toBe(hashEntityKindToShapeName("place"));
    expect(creature.shape).toBe(hashEntityKindToShapeName("creature"));

    // A collision on shape must not be masked by also differing on color —
    // the fallback color is always the same neutral slot for every unmapped
    // kind, collision or not.
    expect(place.color).toBe(creature.color);
  });

  it("is sensitive to the input string (not a constant function)", () => {
    const kinds = ["character", "place", "faction", "organization", "item"];
    const shapes = new Set(
      kinds.map((kind) => getEntityKindFallbackStyle(kind).shape),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });
});
