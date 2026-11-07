import { describe, it, expect } from "vitest";
import { ZodError } from "zod";
import {
  AnyResourceSchema,
  AttachmentEntrySchema,
  AttachmentListSchema,
  EntitySidecarFieldsSchema,
  FolderSidecarSchema,
  MetadataFieldSchema,
  ProjectConfigSchema,
  ResourceBaseSchema,
  SubtypeListSchema,
  TrashAttachmentRecordSchema,
  TrashItemKindSchema,
} from "../../src/lib/models/schemas";
import { ProjectApiEntrySchema } from "../../src/lib/api/schemas";

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

describe("MetadataFieldSchema appliesToFolders (Feature 102, FR-9)", () => {
  const field = { key: "case", label: "Case", type: "text" as const };

  it("keeps appliesToFolders when set", () => {
    const result = MetadataFieldSchema.safeParse({
      ...field,
      appliesToFolders: true,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.appliesToFolders).toBe(true);
  });

  it("parses without it and does not add the key", () => {
    const result = MetadataFieldSchema.safeParse(field);
    expect(result.success).toBe(true);
    if (result.success) expect("appliesToFolders" in result.data).toBe(false);
  });

  it("keeps appliesToFolders next to appliesTo, not as an appliesTo value", () => {
    const result = MetadataFieldSchema.safeParse({
      ...field,
      appliesTo: ["Episode"],
      appliesToFolders: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appliesTo).toEqual(["Episode"]);
      expect(result.data.appliesToFolders).toBe(true);
    }
  });

  it("survives the client parse of a project's field definitions", () => {
    const parsed = ProjectApiEntrySchema.parse({
      project: {
        id: "aaaaaaaa-1111-4111-8111-111111111111",
        name: "P",
        createdAt: "2026-11-07T00:00:00.000Z",
        config: {
          editorConfig: {},
          metadataSchema: {
            groups: [
              {
                id: "g",
                label: "G",
                fields: [
                  { ...field, appliesToFolders: true },
                  { key: "plain", label: "Plain", type: "text" },
                ],
              },
            ],
          },
        },
      },
      folders: [],
      resources: [],
    });
    const fields =
      parsed.project.config?.metadataSchema?.groups[0].fields ?? [];
    expect(fields[0].appliesToFolders).toBe(true);
    expect("appliesToFolders" in fields[1]).toBe(false);
  });
});

describe("FolderSidecarSchema (Feature 102, FR-3, FR-4)", () => {
  it("holds userMetadata.notes, field values and resourceSubtype", () => {
    const result = FolderSidecarSchema.safeParse({
      userMetadata: { notes: "About this case", caseNo: 12, closed: false },
      resourceSubtype: "Case",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.userMetadata?.notes).toBe("About this case");
      expect(result.data.resourceSubtype).toBe("Case");
    }
  });

  it("parses an empty sidecar", () => {
    expect(FolderSidecarSchema.safeParse({}).success).toBe(true);
  });

  it("has no body: plainText, tiptap and top-level notes are rejected", () => {
    expect(FolderSidecarSchema.safeParse({ plainText: "x" }).success).toBe(
      false,
    );
    expect(
      FolderSidecarSchema.safeParse({ tiptap: { type: "doc", content: [] } })
        .success,
    ).toBe(false);
    expect(FolderSidecarSchema.safeParse({ notes: "x" }).success).toBe(false);
  });

  it("rejects non-string notes", () => {
    expect(
      FolderSidecarSchema.safeParse({ userMetadata: { notes: 3 } }).success,
    ).toBe(false);
  });
});

describe("AttachmentEntrySchema (Feature 102, FR-22)", () => {
  const entry = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    fileName: "a1b2c3.png",
    originalName: "scan one.png",
    mime: "image/png",
    size: 1024,
    addedAt: "2026-11-07T00:00:00.000Z",
  };

  it("accepts the recorded entry shape and a list of them", () => {
    expect(AttachmentEntrySchema.safeParse(entry).success).toBe(true);
    expect(AttachmentListSchema.safeParse([entry, entry]).success).toBe(true);
    expect(AttachmentListSchema.safeParse([]).success).toBe(true);
  });

  it("rejects an extra key", () => {
    expect(
      AttachmentEntrySchema.safeParse({ ...entry, path: "/etc/passwd" })
        .success,
    ).toBe(false);
  });

  it("rejects a missing field and a bad size", () => {
    const rest: Partial<typeof entry> = { ...entry };
    delete rest.fileName;
    expect(AttachmentEntrySchema.safeParse(rest).success).toBe(false);
    expect(
      AttachmentEntrySchema.safeParse({ ...entry, size: -1 }).success,
    ).toBe(false);
  });
});

describe("attachment Trash item kind (Feature 102, FR-26)", () => {
  it("adds attachment next to resource and folder", () => {
    expect(TrashItemKindSchema.options).toEqual([
      "resource",
      "folder",
      "attachment",
    ]);
  });

  it("accepts an attachment record carrying Source id, entry and stored name", () => {
    const result = TrashAttachmentRecordSchema.safeParse({
      kind: "attachment",
      sourceId: "660e8400-e29b-41d4-a716-446655440001",
      entry: {
        id: "550e8400-e29b-41d4-a716-446655440000",
        fileName: "a1b2c3.png",
        originalName: "scan.png",
        mime: "image/png",
        size: 10,
        addedAt: "2026-11-07T00:00:00.000Z",
      },
      storedName: "a1b2c3.png",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a record with no stored name or another kind", () => {
    expect(
      TrashAttachmentRecordSchema.safeParse({
        kind: "attachment",
        sourceId: "660e8400-e29b-41d4-a716-446655440001",
      }).success,
    ).toBe(false);
    expect(TrashItemKindSchema.safeParse("video").success).toBe(false);
  });
});

describe("a project with none of the Feature 102 declarations", () => {
  it("parses exactly as before", () => {
    const parsed = MetadataFieldSchema.parse({
      key: "mood",
      label: "Mood",
      type: "text",
    });
    expect(parsed).toEqual({ key: "mood", label: "Mood", type: "text" });
    expect(AnyResourceSchema.safeParse({ ...baseResourceFields }).success).toBe(
      true,
    );
  });
});
