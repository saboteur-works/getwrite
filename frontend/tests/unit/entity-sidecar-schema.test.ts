import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  AnyResourceSchema,
  EntitySidecarFieldsSchema,
  MetadataFieldSchema,
  ProjectConfigSchema,
  ResourceBaseSchema,
  SubtypeListSchema,
} from "../../src/lib/models/schemas";

const baseResourceFields = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  slug: "some-resource",
  name: "Some Resource",
  type: "text" as const,
  orderIndex: 0,
  createdAt: "2026-08-25T00:00:00.000Z",
};

describe("EntitySidecarFieldsSchema", () => {
  it("accepts an arbitrary, unlisted entityKind (e.g. 'faction') identically to well-known kinds", () => {
    const factionResult = EntitySidecarFieldsSchema.safeParse({
      entityKind: "faction",
      aliases: ["The Order"],
    });
    const characterResult = EntitySidecarFieldsSchema.safeParse({
      entityKind: "character",
      aliases: ["Ada"],
    });

    expect(factionResult.success).toBe(true);
    expect(characterResult.success).toBe(true);
  });

  it("accepts a sidecar with no entityKind at all (plain, non-entity resource)", () => {
    const result = EntitySidecarFieldsSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entityKind).toBeUndefined();
      expect(result.data.aliases).toBeUndefined();
    }
  });

  it("rejects an aliases list containing an empty string", () => {
    const result = EntitySidecarFieldsSchema.safeParse({
      entityKind: "place",
      aliases: ["Central City", ""],
    });

    expect(result.success).toBe(false);
  });

  it("preserves aliases order through parse", () => {
    const orderedAliases = ["Third", "First", "Second"];
    const result = EntitySidecarFieldsSchema.safeParse({
      entityKind: "object",
      aliases: orderedAliases,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aliases).toEqual(orderedAliases);
    }
  });

  it("does not constrain entityKind to a fixed enum of values", () => {
    const result = EntitySidecarFieldsSchema.safeParse({
      entityKind: "mechanic",
    });

    expect(result.success).toBe(true);
  });
});

describe("EntitySidecarFieldsSchema — dismissedNoiseTerms", () => {
  it("accepts an array of normalized, case-folded dismissed terms", () => {
    const result = EntitySidecarFieldsSchema.safeParse({
      entityKind: "character",
      aliases: ["Ada", "The Brass Queen"],
      dismissedNoiseTerms: ["ada", "the brass queen"],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dismissedNoiseTerms).toEqual([
        "ada",
        "the brass queen",
      ]);
    }
  });

  it("rejects an empty string in dismissedNoiseTerms", () => {
    const result = EntitySidecarFieldsSchema.safeParse({
      entityKind: "character",
      dismissedNoiseTerms: ["ada", ""],
    });

    expect(result.success).toBe(false);
  });

  it("defaults to undefined (not []) when absent on the schema itself", () => {
    const result = EntitySidecarFieldsSchema.safeParse({
      entityKind: "character",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dismissedNoiseTerms).toBeUndefined();
    }
  });

  it("validates a resource sidecar carrying dismissedNoiseTerms via ResourceBaseSchema", () => {
    const result = ResourceBaseSchema.safeParse({
      ...baseResourceFields,
      entityKind: "character",
      aliases: ["Ada"],
      dismissedNoiseTerms: ["ada"],
    });

    expect(result.success).toBe(true);
  });
});

describe("ResourceBaseSchema entity fields integration", () => {
  it("validates a resource sidecar carrying entityKind and aliases", () => {
    const result = ResourceBaseSchema.safeParse({
      ...baseResourceFields,
      entityKind: "faction",
      aliases: ["The Order", "The Brotherhood"],
    });

    expect(result.success).toBe(true);
  });

  it("still validates a plain resource sidecar with no entity fields", () => {
    const result = ResourceBaseSchema.safeParse({ ...baseResourceFields });

    expect(result.success).toBe(true);
  });
});

describe("SubtypeListSchema (Feature 72, FR-2)", () => {
  it("trims entries, preserves order and the writer's original case", () => {
    expect(SubtypeListSchema.parse(["  Scene ", "Chapter", "Beat"])).toEqual([
      "Scene",
      "Chapter",
      "Beat",
    ]);
  });

  it("accepts an empty list", () => {
    expect(SubtypeListSchema.parse([])).toEqual([]);
  });

  it.each([[[""]], [["   "]], [["Scene", "  "]]])(
    "throws a ZodError for a blank or whitespace-only entry %j",
    (list) => {
      expect(() => SubtypeListSchema.parse(list)).toThrow(ZodError);
    },
  );

  it("throws a ZodError for two entries equal under trim + lowercase", () => {
    expect(() => SubtypeListSchema.parse(["Scene", " scene "])).toThrow(
      ZodError,
    );
  });

  it("keeps entries that differ beyond case and whitespace", () => {
    expect(SubtypeListSchema.parse(["Scene", "Scenes"])).toEqual([
      "Scene",
      "Scenes",
    ]);
  });
});

describe("ProjectConfigSchema subtypes (Feature 72, FR-1)", () => {
  it("accepts a config with a subtypes list", () => {
    const result = ProjectConfigSchema.safeParse({ subtypes: ["Scene"] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.subtypes).toEqual(["Scene"]);
  });

  it("accepts a config without subtypes and does not add the key", () => {
    const result = ProjectConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect("subtypes" in result.data).toBe(false);
  });

  it("rejects a subtypes list with a duplicate entry", () => {
    expect(
      ProjectConfigSchema.safeParse({ subtypes: ["Scene", "scene"] }).success,
    ).toBe(false);
  });
});

describe("resourceSubtype on resource schemas (Feature 72, FR-5)", () => {
  it("EntitySidecarFieldsSchema does not declare resourceSubtype", () => {
    expect("resourceSubtype" in EntitySidecarFieldsSchema.shape).toBe(false);
  });

  it("ResourceBaseSchema keeps resourceSubtype", () => {
    const result = ResourceBaseSchema.safeParse({
      ...baseResourceFields,
      resourceSubtype: "Scene",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.resourceSubtype).toBe("Scene");
  });

  it.each([
    ["text", {}],
    ["image", {}],
    ["audio", {}],
  ])("AnyResourceSchema keeps resourceSubtype for a %s resource", (type) => {
    const result = AnyResourceSchema.safeParse({
      ...baseResourceFields,
      type,
      resourceSubtype: "Scene",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(
        (result.data as { resourceSubtype?: string }).resourceSubtype,
      ).toBe("Scene");
    }
  });

  it("does not add resourceSubtype when absent", () => {
    const result = ResourceBaseSchema.safeParse({ ...baseResourceFields });
    expect(result.success).toBe(true);
    if (result.success) expect("resourceSubtype" in result.data).toBe(false);
  });
});

describe("MetadataFieldSchema appliesTo (Feature 72, FR-13)", () => {
  it("keeps appliesTo as an optional string array", () => {
    const result = MetadataFieldSchema.safeParse({
      key: "mood",
      label: "Mood",
      type: "text",
      appliesTo: ["Scene", "Beat"],
    });
    expect(result.success).toBe(true);
    if (result.success)
      expect(result.data.appliesTo).toEqual(["Scene", "Beat"]);
  });

  it("parses without appliesTo and does not add the key", () => {
    const result = MetadataFieldSchema.safeParse({
      key: "mood",
      label: "Mood",
      type: "text",
    });
    expect(result.success).toBe(true);
    if (result.success) expect("appliesTo" in result.data).toBe(false);
  });
});
