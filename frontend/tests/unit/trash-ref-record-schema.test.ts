import { describe, it, expect } from "vitest";
import {
  TrashRefRecordEntrySchema,
  TrashRefRecordSchema,
} from "../../src/lib/models/schemas";

const referencingResourceId = "550e8400-e29b-41d4-a716-446655440000";
const deletedResourceId = "660e8400-e29b-41d4-a716-446655440001";

describe("TrashRefRecordEntrySchema", () => {
  it("accepts a scalar-field entry with no arrayIndex key at all", () => {
    const entry = {
      referencingResourceId,
      fieldKey: "primaryContact",
      priorValue: { id: deletedResourceId, name: "Ada Lovelace" },
    };
    const result = TrashRefRecordEntrySchema.safeParse(entry);

    expect(result.success).toBe(true);
    if (result.success) {
      expect("arrayIndex" in result.data).toBe(false);
    }
  });

  it("accepts a multi-valued-field entry with a numeric arrayIndex", () => {
    const result = TrashRefRecordEntrySchema.safeParse({
      referencingResourceId,
      fieldKey: "relatedCharacters",
      arrayIndex: 2,
      priorValue: { id: deletedResourceId, name: "Ada Lovelace" },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.arrayIndex).toBe(2);
    }
  });

  it("rejects an entry missing referencingResourceId", () => {
    const result = TrashRefRecordEntrySchema.safeParse({
      fieldKey: "primaryContact",
      priorValue: { id: deletedResourceId, name: "Ada Lovelace" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an entry missing fieldKey", () => {
    const result = TrashRefRecordEntrySchema.safeParse({
      referencingResourceId,
      priorValue: { id: deletedResourceId, name: "Ada Lovelace" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects an entry missing the prior { id, name } value", () => {
    const result = TrashRefRecordEntrySchema.safeParse({
      referencingResourceId,
      fieldKey: "primaryContact",
    });

    expect(result.success).toBe(false);
  });
});

describe("TrashRefRecordSchema", () => {
  it("accepts a record with a mix of scalar and multi-valued entries", () => {
    const result = TrashRefRecordSchema.safeParse({
      resourceId: deletedResourceId,
      entries: [
        {
          referencingResourceId,
          fieldKey: "primaryContact",
          priorValue: { id: deletedResourceId, name: "Ada Lovelace" },
        },
        {
          referencingResourceId,
          fieldKey: "relatedCharacters",
          arrayIndex: 0,
          priorValue: { id: deletedResourceId, name: "Ada Lovelace" },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts a record with an empty entries array", () => {
    const result = TrashRefRecordSchema.safeParse({
      resourceId: deletedResourceId,
      entries: [],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a record missing resourceId", () => {
    const result = TrashRefRecordSchema.safeParse({ entries: [] });

    expect(result.success).toBe(false);
  });

  it("rejects a record whose entries fail validation", () => {
    const result = TrashRefRecordSchema.safeParse({
      resourceId: deletedResourceId,
      entries: [{ fieldKey: "primaryContact" }],
    });

    expect(result.success).toBe(false);
  });
});
