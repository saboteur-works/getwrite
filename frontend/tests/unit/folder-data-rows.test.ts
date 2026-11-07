/**
 * Feature 102, Task 16 (FR-14): pure helpers behind the Data view's folder
 * rows. Covers the split of smart-folder result ids into resources and
 * folders (identical to the old filter when no folder is named), the field
 * columns, and the row cells.
 */
import { describe, it, expect } from "vitest";
import {
  splitSmartFolderResults,
  buildFolderColumns,
  buildFolderRows,
  formatFolderFieldValue,
} from "../../src/lib/folder-data-rows";
import type {
  AnyResource,
  Folder,
  MetadataSchema,
} from "../../src/lib/models/types";

const now = "2026-01-01T00:00:00.000Z";

function folder(id: string, name: string): Folder {
  return {
    id,
    slug: id,
    name,
    type: "folder",
    parentId: null,
    orderIndex: 0,
    createdAt: now,
  } as unknown as Folder;
}

function text(id: string, name: string): AnyResource {
  return {
    id,
    slug: id,
    name,
    type: "text",
    folderId: null,
    orderIndex: 0,
    createdAt: now,
  } as AnyResource;
}

const schema: MetadataSchema = {
  groups: [
    {
      id: "g",
      name: "G",
      fields: [
        { key: "notes", label: "Notes", type: "text" },
        { key: "status", label: "Status", type: "select" },
        { key: "mood", label: "Mood", type: "text" },
        {
          key: "arc",
          label: "Arc",
          type: "text",
          appliesTo: ["Act"],
          appliesToFolders: true,
        },
        { key: "secret", label: "Secret", type: "text", deprecated: true },
        { key: "docsOnly", label: "Docs only", type: "text", appliesTo: ["X"] },
      ],
    },
  ],
} as unknown as MetadataSchema;

describe("splitSmartFolderResults", () => {
  const resources = [text("r1", "One"), text("r2", "Two"), text("r3", "Three")];
  const folders = [folder("f1", "Part 1"), folder("f2", "Part 2")];

  it("with no folder id in the result equals the previous resource filter", () => {
    const ids = ["r3", "r1"];
    const split = splitSmartFolderResults(ids, resources, folders);
    expect(split.resources).toEqual(
      resources.filter((r) => ids.includes(r.id)),
    );
    expect(split.folders).toEqual([]);
  });

  it("separates folders from resources and keeps folder order", () => {
    const split = splitSmartFolderResults(
      ["f2", "r2", "f1"],
      resources,
      folders,
    );
    expect(split.resources.map((r) => r.id)).toEqual(["r2"]);
    expect(split.folders.map((f) => f.id)).toEqual(["f1", "f2"]);
  });
});

describe("formatFolderFieldValue", () => {
  it("formats strings, numbers, booleans and lists; blank otherwise", () => {
    expect(formatFolderFieldValue("a")).toBe("a");
    expect(formatFolderFieldValue(3)).toBe("3");
    expect(formatFolderFieldValue(true)).toBe("true");
    expect(formatFolderFieldValue(["a", "b"])).toBe("a, b");
    expect(formatFolderFieldValue(undefined)).toBe("");
    expect(formatFolderFieldValue(null)).toBe("");
  });
});

describe("buildFolderColumns", () => {
  it("offers custom fields the listed folders are offered, never notes or deprecated", () => {
    const cols = buildFolderColumns(schema, [
      { id: "f1", resourceSubtype: undefined },
      { id: "f2", resourceSubtype: "act" },
    ]);
    expect(cols.map((c) => c.key)).toEqual(["mood", "arc"]);
  });

  it("leaves out a subtype-scoped field no listed folder is offered", () => {
    const cols = buildFolderColumns(schema, [
      { id: "f1", resourceSubtype: undefined },
    ]);
    expect(cols.map((c) => c.key)).toEqual(["mood"]);
  });
});

describe("buildFolderRows", () => {
  it("shows name, subtype and the column values and no notes or child count", () => {
    const columns = [
      { key: "mood", label: "Mood" },
      { key: "arc", label: "Arc" },
    ];
    const rows = buildFolderRows(
      [folder("f1", "Part 1")],
      {
        f1: {
          notes: "SECRET NOTES",
          fieldValues: { mood: "tense", arc: "rising" },
          resourceSubtype: "Act",
        },
      },
      columns,
    );
    expect(rows).toEqual([
      {
        id: "f1",
        name: "Part 1",
        subtype: "Act",
        cells: [
          { key: "mood", label: "Mood", value: "tense" },
          { key: "arc", label: "Arc", value: "rising" },
        ],
      },
    ]);
    expect(JSON.stringify(rows)).not.toContain("SECRET NOTES");
  });

  it("gives a folder with no stored metadata blank cells and no subtype", () => {
    const rows = buildFolderRows(
      [folder("f1", "Part 1")],
      { f1: { notes: "", fieldValues: {}, resourceSubtype: undefined } },
      [{ key: "mood", label: "Mood" }],
    );
    expect(rows[0].subtype).toBeUndefined();
    expect(rows[0].cells).toEqual([{ key: "mood", label: "Mood", value: "" }]);
  });
});
