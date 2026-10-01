/**
 * Unit tests for `edgeDescriptions.ts` (entity-relationship-graph-connections
 * Task 5) — covers the pre-existing `describeCooccurrenceEdge`/
 * `describeAuthoredEdge` pair plus the three new description functions for
 * the connection-type additions: `describeBacklinkEdge`,
 * `describeProximityMentionEdge`, and `describeSharedMetadataEdge` (FR-6).
 */
import { describe, expect, it } from "vitest";
import {
  UNKNOWN_ENTITY_LABEL,
  describeAuthoredEdge,
  describeBacklinkEdge,
  describeCooccurrenceEdge,
  describeProximityMentionEdge,
  describeSharedMetadataEdge,
  resolveEntityName,
} from "../../components/WorkArea/Views/EntityRelationshipGraphView/edgeDescriptions";

const nameById = new Map<string, string>([
  ["e-anna", "Anna"],
  ["e-bob", "Bob"],
]);

describe("resolveEntityName", () => {
  it("resolves a known entity id to its name", () => {
    expect(resolveEntityName(nameById, "e-anna")).toBe("Anna");
  });

  it("falls back to the unknown-entity label for a dangling id", () => {
    expect(resolveEntityName(nameById, "e-missing")).toBe(UNKNOWN_ENTITY_LABEL);
  });
});

describe("describeCooccurrenceEdge (existing)", () => {
  it("still composes the shared-resource-count text", () => {
    expect(describeCooccurrenceEdge(nameById, "e-anna", "e-bob", 3)).toBe(
      "Anna and Bob share 3 resources",
    );
  });
});

describe("describeAuthoredEdge (existing)", () => {
  it("still composes the directed relationship text", () => {
    expect(describeAuthoredEdge(nameById, "e-anna", "e-bob", "ally")).toBe(
      "Anna → Bob (ally)",
    );
  });
});

describe("describeBacklinkEdge", () => {
  it("composes an undirected backlink description with both entity names", () => {
    const text = describeBacklinkEdge(nameById, "e-anna", "e-bob");
    expect(text).toContain("Anna");
    expect(text).toContain("Bob");
    expect(text).toBe("Anna and Bob are linked by a backlink");
  });

  it("falls back to the unknown-entity label for a dangling id", () => {
    const text = describeBacklinkEdge(nameById, "e-anna", "e-missing");
    expect(text).toBe(
      `Anna and ${UNKNOWN_ENTITY_LABEL} are linked by a backlink`,
    );
  });

  it("produces text distinct from the co-occurrence and shared-metadata descriptions", () => {
    const backlinkText = describeBacklinkEdge(nameById, "e-anna", "e-bob");
    const cooccurrenceText = describeCooccurrenceEdge(
      nameById,
      "e-anna",
      "e-bob",
      3,
    );
    expect(backlinkText).not.toBe(cooccurrenceText);
  });
});

describe("describeProximityMentionEdge", () => {
  it("composes a description naming both entities and framing the weight as a character distance", () => {
    const text = describeProximityMentionEdge(nameById, "e-anna", "e-bob", 42);
    expect(text).toContain("Anna");
    expect(text).toContain("Bob");
    expect(text).toContain("42");
    expect(text).toContain("characters");
    expect(text).not.toMatch(/^\d+$/);
  });

  it("rounds a fractional weight to a whole number", () => {
    const text = describeProximityMentionEdge(
      nameById,
      "e-anna",
      "e-bob",
      17.6,
    );
    expect(text).toContain("18");
  });

  it("uses the singular 'character' for a weight that rounds to 1", () => {
    const text = describeProximityMentionEdge(nameById, "e-anna", "e-bob", 1);
    expect(text).toContain("1 character ");
    expect(text).not.toContain("1 characters");
  });

  it("falls back to the unknown-entity label for a dangling id", () => {
    const text = describeProximityMentionEdge(
      nameById,
      "e-anna",
      "e-missing",
      5,
    );
    expect(text).toContain(UNKNOWN_ENTITY_LABEL);
  });
});

describe("describeSharedMetadataEdge", () => {
  it("lists shared tag labels", () => {
    const text = describeSharedMetadataEdge(
      nameById,
      "e-anna",
      "e-bob",
      ["Protagonist"],
      [],
    );
    expect(text).toBe("Anna and Bob share tag Protagonist");
  });

  it("lists shared field labels", () => {
    const text = describeSharedMetadataEdge(
      nameById,
      "e-anna",
      "e-bob",
      [],
      ["Location"],
    );
    expect(text).toBe("Anna and Bob share field Location");
  });

  it("lists multiple shared tags and fields together, pluralized", () => {
    const text = describeSharedMetadataEdge(
      nameById,
      "e-anna",
      "e-bob",
      ["Protagonist", "Villain"],
      ["Location", "Era"],
    );
    expect(text).toBe(
      "Anna and Bob share tags Protagonist, Villain and fields Location, Era",
    );
  });

  it("falls back to the unknown-entity label for a dangling id", () => {
    const text = describeSharedMetadataEdge(
      nameById,
      "e-anna",
      "e-missing",
      ["Protagonist"],
      [],
    );
    expect(text).toContain(UNKNOWN_ENTITY_LABEL);
  });

  it("produces text distinct from backlink and proximity-mention descriptions", () => {
    const sharedMetadataText = describeSharedMetadataEdge(
      nameById,
      "e-anna",
      "e-bob",
      ["Protagonist"],
      [],
    );
    const backlinkText = describeBacklinkEdge(nameById, "e-anna", "e-bob");
    const proximityText = describeProximityMentionEdge(
      nameById,
      "e-anna",
      "e-bob",
      10,
    );
    expect(sharedMetadataText).not.toBe(backlinkText);
    expect(sharedMetadataText).not.toBe(proximityText);
  });
});
