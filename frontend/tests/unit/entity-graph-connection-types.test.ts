import { describe, it, expect } from "vitest";
import {
  DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES,
  KNOWN_ENTITY_GRAPH_CONNECTION_TYPES,
  filterToKnownConnectionTypes,
} from "../../src/lib/models/entity-graph-connection-types";
import { ProjectConfigSchema } from "../../src/lib/models/schemas";

describe("entity-graph-connection-types (Feature 68, FR-1/FR-2)", () => {
  it("defaults to authored + cooccurrence", () => {
    expect(DEFAULT_ENTITY_GRAPH_CONNECTION_TYPES).toEqual([
      "authored",
      "cooccurrence",
    ]);
  });

  it("lists exactly the five known connection-type keys", () => {
    expect(KNOWN_ENTITY_GRAPH_CONNECTION_TYPES).toEqual([
      "authored",
      "cooccurrence",
      "backlinks",
      "proximityMentions",
      "sharedMetadata",
    ]);
  });

  describe("filterToKnownConnectionTypes", () => {
    it("keeps every recognized key", () => {
      expect(filterToKnownConnectionTypes(["authored", "backlinks"])).toEqual([
        "authored",
        "backlinks",
      ]);
    });

    it("drops an unrecognized key without throwing", () => {
      expect(() =>
        filterToKnownConnectionTypes(["authored", "not-a-real-type"]),
      ).not.toThrow();
      expect(
        filterToKnownConnectionTypes(["authored", "not-a-real-type"]),
      ).toEqual(["authored"]);
    });

    it("returns an empty list when nothing is recognized", () => {
      expect(filterToKnownConnectionTypes(["bogus"])).toEqual([]);
    });
  });
});

describe("ProjectConfigSchema entity graph fields (Feature 68)", () => {
  it("accepts entityGraphConnectionTypes and entityGraphFocalHopRadius", () => {
    const result = ProjectConfigSchema.safeParse({
      entityGraphConnectionTypes: ["authored", "backlinks"],
      entityGraphFocalHopRadius: 2,
    });
    expect(result.success).toBe(true);
  });

  it("behaves exactly as Feature 39 shipped it when neither field is set", () => {
    const result = ProjectConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityGraphConnectionTypes).toBeUndefined();
      expect(result.data.entityGraphFocalHopRadius).toBeUndefined();
    }
  });
});
