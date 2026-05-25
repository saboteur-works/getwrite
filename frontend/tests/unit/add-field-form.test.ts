import { describe, it, expect } from "vitest";
import { defaultGroupId } from "../../components/Sidebar/AddFieldForm";
import type { MetadataSchema } from "../../src/lib/models/types";

// ─── Sample schemas ────────────────────────────────────────────────────────────

const SCHEMA: MetadataSchema = {
  groups: [
    { id: "builtin-document", label: "Document", fields: [] },
    { id: "custom-general", label: "General", fields: [] },
    {
      id: "custom-scenes",
      label: "Scenes",
      folderId: "folder-scenes",
      fields: [],
    },
  ],
};

const BUILTIN_ONLY: MetadataSchema = {
  groups: [
    { id: "builtin-a", label: "A", fields: [] },
    { id: "builtin-b", label: "B", fields: [] },
  ],
};

// ─── defaultGroupId ─────────────────────────────────────────────────────────

describe("defaultGroupId", () => {
  it("returns the folder-scoped group when currentFolderId matches", () => {
    expect(defaultGroupId(SCHEMA, "folder-scenes")).toBe("custom-scenes");
  });

  it("returns the first non-builtin group when currentFolderId doesn't match any group", () => {
    expect(defaultGroupId(SCHEMA, "unknown-folder")).toBe("custom-general");
  });

  it("returns the first non-builtin group when currentFolderId is null", () => {
    expect(defaultGroupId(SCHEMA, null)).toBe("custom-general");
  });

  it("returns the first non-builtin group when currentFolderId is undefined", () => {
    expect(defaultGroupId(SCHEMA, undefined)).toBe("custom-general");
  });

  it("falls back to first group when all groups are builtin", () => {
    expect(defaultGroupId(BUILTIN_ONLY, null)).toBe("builtin-a");
  });

  it("falls back to first group when all groups are builtin and a folderId is given", () => {
    expect(defaultGroupId(BUILTIN_ONLY, "folder-x")).toBe("builtin-a");
  });

  it("returns empty string when schema has no groups", () => {
    expect(defaultGroupId({ groups: [] }, null)).toBe("");
  });

  it("uses folder match even when non-builtin groups exist", () => {
    const schema: MetadataSchema = {
      groups: [
        { id: "custom-general", label: "General", fields: [] },
        {
          id: "custom-acts",
          label: "Acts",
          folderId: "folder-acts",
          fields: [],
        },
      ],
    };
    expect(defaultGroupId(schema, "folder-acts")).toBe("custom-acts");
  });

  it("skips builtin groups in the non-builtin fallback even if they come first", () => {
    const schema: MetadataSchema = {
      groups: [
        { id: "builtin-doc", label: "Doc", fields: [] },
        { id: "builtin-timeline", label: "Timeline", fields: [] },
        { id: "custom-extra", label: "Extra", fields: [] },
      ],
    };
    expect(defaultGroupId(schema, null)).toBe("custom-extra");
  });
});
