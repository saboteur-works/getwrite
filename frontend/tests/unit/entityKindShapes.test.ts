/**
 * Unit tests for the fixed six-shape geometry set and FR-5/OQ-3's
 * deterministic unmapped-kind shape hash (Feature 69, Task 1).
 */
import { describe, expect, it } from "vitest";
import {
  ENTITY_KIND_SHAPE_NAMES,
  ENTITY_KIND_SHAPES,
  getEntityKindShapeGeometry,
  hashEntityKindToShapeName,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/entityKindShapes";

describe("ENTITY_KIND_SHAPES", () => {
  it("has exactly one entry per fixed shape name, in the fixed order", () => {
    expect(Object.keys(ENTITY_KIND_SHAPES)).toEqual([
      ...ENTITY_KIND_SHAPE_NAMES,
    ]);
  });

  it("renders circle as a circle geometry, every other shape as a distinct path", () => {
    expect(ENTITY_KIND_SHAPES.circle.kind).toBe("circle");

    const pathShapes = ENTITY_KIND_SHAPE_NAMES.filter(
      (shape) => shape !== "circle",
    );
    const pathStrings = pathShapes.map((shape) => {
      const geometry = ENTITY_KIND_SHAPES[shape];
      expect(geometry.kind).toBe("path");
      return geometry.kind === "path" ? geometry.d : "";
    });

    // Every non-circle shape must produce a visually distinct outline — no
    // two shapes in the fixed set may share an identical `d` string.
    expect(new Set(pathStrings).size).toBe(pathStrings.length);
  });

  it("gives the star more vertices than the triangle, square, diamond, or hexagon", () => {
    const starGeometry = ENTITY_KIND_SHAPES.star;
    expect(starGeometry.kind).toBe("path");
    const starVertexCount =
      starGeometry.kind === "path"
        ? (starGeometry.d.match(/[ML]/g) ?? []).length
        : 0;
    expect(starVertexCount).toBe(10); // 5 outer + 5 inner points
  });
});

describe("getEntityKindShapeGeometry", () => {
  it("scales a path shape's coordinates up for a larger bounding radius", () => {
    const small = getEntityKindShapeGeometry("hexagon", 10);
    const large = getEntityKindShapeGeometry("hexagon", 20);
    expect(small.kind).toBe("path");
    expect(large.kind).toBe("path");
    if (small.kind === "path" && large.kind === "path") {
      expect(small.d).not.toBe(large.d);
    }
  });

  it("returns a circle geometry sized to the given bounding radius", () => {
    const geometry = getEntityKindShapeGeometry("circle", 17);
    expect(geometry).toEqual({ kind: "circle", radius: 17 });
  });
});

describe("hashEntityKindToShapeName", () => {
  it("is deterministic for the same input string", () => {
    expect(hashEntityKindToShapeName("character")).toBe(
      hashEntityKindToShapeName("character"),
    );
  });

  it("always returns a name from the fixed shape set", () => {
    for (const kind of ["character", "place", "faction", "", "a", "Zx9!@#"]) {
      expect(ENTITY_KIND_SHAPE_NAMES).toContain(
        hashEntityKindToShapeName(kind),
      );
    }
  });

  it("is sensitive to the input string (not a constant function)", () => {
    const kinds = ["character", "place", "faction", "organization", "item"];
    const shapes = new Set(
      kinds.map((kind) => hashEntityKindToShapeName(kind)),
    );
    // Not every kind need land on a unique shape (6 slots, 5 inputs could
    // collide), but a hash that always returned the same shape regardless of
    // input would defeat FR-5's purpose entirely.
    expect(shapes.size).toBeGreaterThan(1);
  });
});
