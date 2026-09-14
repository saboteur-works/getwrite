import { describe, it, expect } from "vitest";
import {
  TrashFolderManifestEntrySchema,
  TrashFolderManifestSchema,
} from "../../src/lib/models/schemas";

const folderId = "550e8400-e29b-41d4-a716-446655440000";
const parentId = "660e8400-e29b-41d4-a716-446655440001";
const childFolderId = "770e8400-e29b-41d4-a716-446655440002";
const childResourceId = "880e8400-e29b-41d4-a716-446655440003";

const validFolderDescriptor = {
  id: folderId,
  slug: "chapter-one",
  name: "Chapter One",
  type: "folder" as const,
  parentId: null,
  orderIndex: 0,
  createdAt: "2026-09-14T00:00:00.000Z",
};

describe("TrashFolderManifestEntrySchema", () => {
  it("accepts a resource descendant entry", () => {
    const result = TrashFolderManifestEntrySchema.safeParse({
      id: childResourceId,
      kind: "resource",
      parentId: folderId,
      orderIndex: 0,
    });

    expect(result.success).toBe(true);
  });

  it("accepts a folder descendant entry with a null parentId", () => {
    const result = TrashFolderManifestEntrySchema.safeParse({
      id: childFolderId,
      kind: "folder",
      parentId: null,
      orderIndex: 1,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an entry missing kind", () => {
    const result = TrashFolderManifestEntrySchema.safeParse({
      id: childResourceId,
      parentId: folderId,
      orderIndex: 0,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an entry missing parentId", () => {
    const result = TrashFolderManifestEntrySchema.safeParse({
      id: childResourceId,
      kind: "resource",
      orderIndex: 0,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an entry missing orderIndex", () => {
    const result = TrashFolderManifestEntrySchema.safeParse({
      id: childResourceId,
      kind: "resource",
      parentId: folderId,
    });

    expect(result.success).toBe(false);
  });

  it("rejects an entry with an invalid kind", () => {
    const result = TrashFolderManifestEntrySchema.safeParse({
      id: childResourceId,
      kind: "project",
      parentId: folderId,
      orderIndex: 0,
    });

    expect(result.success).toBe(false);
  });
});

describe("TrashFolderManifestSchema", () => {
  it("accepts a manifest with the folder's own descriptor plus descendants", () => {
    const result = TrashFolderManifestSchema.safeParse({
      folder: { ...validFolderDescriptor, parentId },
      descendants: [
        {
          id: childFolderId,
          kind: "folder",
          parentId: folderId,
          orderIndex: 0,
        },
        {
          id: childResourceId,
          kind: "resource",
          parentId: childFolderId,
          orderIndex: 0,
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts a manifest with no descendants", () => {
    const result = TrashFolderManifestSchema.safeParse({
      folder: validFolderDescriptor,
      descendants: [],
    });

    expect(result.success).toBe(true);
  });

  it("rejects a manifest missing the folder descriptor", () => {
    const result = TrashFolderManifestSchema.safeParse({ descendants: [] });

    expect(result.success).toBe(false);
  });

  it("rejects a manifest whose folder descriptor is malformed", () => {
    const result = TrashFolderManifestSchema.safeParse({
      folder: { id: folderId, name: "Chapter One" },
      descendants: [],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a manifest with a descendant entry missing kind", () => {
    const result = TrashFolderManifestSchema.safeParse({
      folder: validFolderDescriptor,
      descendants: [{ id: childResourceId, parentId: folderId, orderIndex: 0 }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a manifest with a descendant entry missing parentId", () => {
    const result = TrashFolderManifestSchema.safeParse({
      folder: validFolderDescriptor,
      descendants: [{ id: childResourceId, kind: "resource", orderIndex: 0 }],
    });

    expect(result.success).toBe(false);
  });

  it("rejects a manifest with a descendant entry missing orderIndex", () => {
    const result = TrashFolderManifestSchema.safeParse({
      folder: validFolderDescriptor,
      descendants: [
        { id: childResourceId, kind: "resource", parentId: folderId },
      ],
    });

    expect(result.success).toBe(false);
  });
});
