import { describe, it, expect } from "vitest";
import {
  buildAxisValueList,
  getAxisChoices,
  OTHER_VALUES_LABEL,
  NONE_LABEL,
} from "../components/WorkArea/Views/OrganizerView/organizerAxisFields";
import { DEFAULT_METADATA_SCHEMA } from "../src/lib/models/default-metadata-schema";
import type { MetadataField, MetadataSchema } from "../src/lib/models/types";
import type { OrganizerAxis } from "../src/lib/models/organizer-grid-types";

const schemaOf = (fields: MetadataField[]): MetadataSchema => ({
  groups: [
    ...DEFAULT_METADATA_SCHEMA.groups,
    { id: "custom", label: "Custom", fields },
  ],
});

const allTypes: MetadataField[] = [
  { key: "mood", label: "Mood", type: "select", options: ["calm", "tense"] },
  { key: "tags", label: "Tags", type: "multiselect", options: ["a", "b"] },
  { key: "txt", label: "Txt", type: "text" },
  { key: "num", label: "Num", type: "number" },
  { key: "dt", label: "Dt", type: "date" },
  { key: "flag", label: "Flag", type: "boolean" },
  { key: "who", label: "Who", type: "resource-ref" },
  { key: "cast", label: "Cast", type: "multi-resource-ref" },
  {
    key: "old",
    label: "Old",
    type: "select",
    options: ["x"],
    deprecated: true,
  },
];

/** Short name of an axis for assertions: a word, or the field key. */
const nameOf = (axis: OrganizerAxis): string =>
  typeof axis === "string"
    ? axis
    : axis.kind === "field"
      ? axis.key
      : axis.kind;

describe("getAxisChoices: offered fields", () => {
  const base = {
    schema: schemaOf(allTypes),
    source: "children" as const,
    documentSubtypes: [] as (string | undefined)[],
    folderSubtypes: [] as (string | undefined)[],
    other: "none" as OrganizerAxis,
  };

  it("offers select, multiselect, status, subtype and both reference types", () => {
    const names = getAxisChoices({ ...base, position: "columns" }).map((c) =>
      nameOf(c.axis),
    );
    expect(names).toEqual([
      "none",
      "order",
      "status",
      "subtype",
      "pov",
      "mood",
      "tags",
      "who",
      "cast",
    ]);
  });

  it("does not offer text, number, date, boolean or deprecated fields", () => {
    const names = getAxisChoices({ ...base, position: "rows" }).map((c) =>
      nameOf(c.axis),
    );
    for (const k of ["txt", "num", "dt", "flag", "old", "synopsis", "notes"]) {
      expect(names).not.toContain(k);
    }
  });

  it("offers order on Columns only, and None first", () => {
    const rows = getAxisChoices({ ...base, position: "rows" });
    const cols = getAxisChoices({ ...base, position: "columns" });
    expect(rows.some((c) => c.axis === "order")).toBe(false);
    expect(cols.some((c) => c.axis === "order")).toBe(true);
    expect(rows[0].label).toBe("None");
  });

  it("offers the status once, as the status axis and not as a field", () => {
    const names = getAxisChoices({ ...base, position: "rows" }).map((c) =>
      nameOf(c.axis),
    );
    expect(names.filter((n) => n === "status")).toHaveLength(1);
    const status = getAxisChoices({ ...base, position: "rows" }).find(
      (c) => nameOf(c.axis) === "status",
    );
    expect(status?.axis).toEqual({ kind: "status" });
  });

  it("cannot pick the same field for both axes", () => {
    const pick = (other: OrganizerAxis, position: "rows" | "columns") =>
      getAxisChoices({ ...base, position, other }).map((c) => nameOf(c.axis));
    expect(pick({ kind: "field", key: "mood" }, "columns")).not.toContain(
      "mood",
    );
    expect(pick({ kind: "status" }, "columns")).not.toContain("status");
    expect(pick({ kind: "subtype" }, "rows")).not.toContain("subtype");
    expect(pick({ kind: "subtype" }, "rows")).toContain("status");
  });

  it("lets both axes be none", () => {
    const names = getAxisChoices({
      ...base,
      position: "columns",
      other: "none",
    }).map((c) => nameOf(c.axis));
    expect(names).toContain("none");
  });
});

describe("getAxisChoices: folder fields", () => {
  const fields: MetadataField[] = [
    {
      key: "folder-mood",
      label: "FM",
      type: "select",
      options: ["a"],
      appliesTo: ["Act"],
      appliesToFolders: true,
    },
    {
      key: "doc-only",
      label: "DO",
      type: "select",
      options: ["a"],
      appliesTo: ["Scene"],
    },
  ];
  const schema = schemaOf(fields);
  const choose = (
    source: "children" | "descendants" | "smart-folder",
    folderSubtypes: (string | undefined)[],
  ): string[] =>
    getAxisChoices({
      schema,
      source,
      documentSubtypes: ["Scene"],
      folderSubtypes,
      position: "rows",
      other: "none",
    }).map((c) => nameOf(c.axis));

  it("offers a folder-scoped field for a matching folder subtype in the children source", () => {
    expect(choose("children", ["act"])).toContain("folder-mood");
  });

  it("does not offer it when no folder subtype matches", () => {
    expect(choose("children", [undefined])).not.toContain("folder-mood");
    expect(choose("children", [])).not.toContain("folder-mood");
  });

  it("does not offer it in the descendants or smart-folder source", () => {
    expect(choose("descendants", ["act"])).not.toContain("folder-mood");
    expect(choose("smart-folder", ["act"])).not.toContain("folder-mood");
  });

  it("offers a document field once even when folders also offer it", () => {
    const free = schemaOf([
      { key: "free", label: "Free", type: "select", options: ["a"] },
    ]);
    const names = getAxisChoices({
      schema: free,
      source: "children",
      documentSubtypes: [undefined],
      folderSubtypes: ["act", undefined],
      position: "rows",
      other: "none",
    }).map((c) => nameOf(c.axis));
    expect(names.filter((n) => n === "free")).toHaveLength(1);
  });
});

describe("buildAxisValueList", () => {
  const schema = schemaOf(allTypes);
  const base = {
    schema,
    statuses: [] as string[],
    subtypes: [] as string[],
    presentValues: [] as unknown[],
  };

  it("lists select options in the field's order, then Other values, then None", () => {
    const list = buildAxisValueList({
      ...base,
      axis: { kind: "field", key: "mood" },
    });
    expect(list.axis).toEqual({ kind: "field", key: "mood" });
    expect(list.values.map((v) => [v.kind, v.label])).toEqual([
      ["value", "calm"],
      ["value", "tense"],
      ["other", OTHER_VALUES_LABEL],
      ["none", NONE_LABEL],
    ]);
    expect(list.values[0]).toMatchObject({ isDropTarget: true, value: "calm" });
    expect(list.values[2].isDropTarget).toBe(false);
    expect(list.values[2].value).toBeUndefined();
    expect(list.values[3].value).toBeUndefined();
    expect(list.values[3].isDropTarget).toBe(true);
  });

  it("lists multiselect options in order", () => {
    const list = buildAxisValueList({
      ...base,
      axis: { kind: "field", key: "tags" },
    });
    expect(list.values.slice(0, 2).map((v) => v.value)).toEqual(["a", "b"]);
  });

  it("follows config.statuses for the status axis", () => {
    const list = buildAxisValueList({
      ...base,
      statuses: ["Draft", "Done", "Cut"],
      axis: { kind: "status" },
    });
    expect(list.values.map((v) => v.label)).toEqual([
      "Draft",
      "Done",
      "Cut",
      OTHER_VALUES_LABEL,
      NONE_LABEL,
    ]);
  });

  it("follows config.subtypes for the subtype axis", () => {
    const list = buildAxisValueList({
      ...base,
      subtypes: ["Scene", "Act"],
      axis: { kind: "subtype" },
    });
    expect(list.values.slice(0, 2).map((v) => v.value)).toEqual([
      "Scene",
      "Act",
    ]);
  });

  it("returns only Other and None for a field with no values", () => {
    const kinds = (axis: OrganizerAxis, s: MetadataSchema) =>
      buildAxisValueList({ ...base, schema: s, axis }).values.map(
        (v) => v.kind,
      );
    const s = schemaOf([
      { key: "empty", label: "E", type: "select", options: [] },
      { key: "noopts", label: "N", type: "multiselect" },
    ]);
    expect(kinds({ kind: "field", key: "empty" }, s)).toEqual([
      "other",
      "none",
    ]);
    expect(kinds({ kind: "field", key: "noopts" }, s)).toEqual([
      "other",
      "none",
    ]);
    expect(kinds({ kind: "status" }, s)).toEqual(["other", "none"]);
    expect(kinds({ kind: "subtype" }, s)).toEqual(["other", "none"]);
  });

  it("returns only Other and None for a field absent from the schema", () => {
    const list = buildAxisValueList({
      ...base,
      axis: { kind: "field", key: "missing" },
    });
    expect(list.values.map((v) => v.kind)).toEqual(["other", "none"]);
  });

  it("keeps keys unique when an option is named other or none or repeats", () => {
    const list = buildAxisValueList({
      ...base,
      schema: schemaOf([
        {
          key: "k",
          label: "K",
          type: "select",
          options: ["other", "none", "x", "x"],
        },
      ]),
      axis: { kind: "field", key: "k" },
    });
    const keys = list.values.map((v) => v.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(list.values.filter((v) => v.kind === "value")).toHaveLength(3);
  });

  it("returns no lines for none and order axes", () => {
    expect(buildAxisValueList({ ...base, axis: "none" }).values).toEqual([]);
    expect(buildAxisValueList({ ...base, axis: "order" }).values).toEqual([]);
  });

  describe("reference axis", () => {
    const axis: OrganizerAxis = { kind: "field", key: "who" };
    const valueLines = (list: ReturnType<typeof buildAxisValueList>) =>
      list.values.filter((v) => v.kind === "value");

    it("groups present values by id in first-appearance order with the saved name", () => {
      const list = buildAxisValueList({
        ...base,
        axis,
        presentValues: [
          { id: "r2", name: "Bea" },
          undefined,
          { id: "r1", name: "Al" },
          { id: "r2", name: "Bea renamed" },
        ],
      });
      expect(list.values.map((v) => [v.key, v.label, v.isDropTarget])).toEqual([
        ["r2", "Bea", true],
        ["r1", "Al", true],
        ["other", OTHER_VALUES_LABEL, false],
        ["none", NONE_LABEL, true],
      ]);
      expect(list.values[0].value).toEqual({ id: "r2", name: "Bea" });
    });

    it("reads each ref of a multi-reference array", () => {
      const list = buildAxisValueList({
        ...base,
        axis: { kind: "field", key: "cast" },
        presentValues: [
          [
            { id: "a", name: "A" },
            { id: "b", name: "B" },
          ],
          [{ id: "b", name: "B" }],
        ],
      });
      expect(valueLines(list).map((v) => v.key)).toEqual(["a", "b"]);
    });

    it("routes a null id to Other values: no line of its own, not a drop target", () => {
      const list = buildAxisValueList({
        ...base,
        axis,
        presentValues: [{ id: null, name: "Gone" }],
      });
      expect(list.values.map((v) => v.kind)).toEqual(["other", "none"]);
      expect(list.values[0].isDropTarget).toBe(false);
    });

    it("keeps two references with the same name and different ids apart", () => {
      const list = buildAxisValueList({
        ...base,
        axis,
        presentValues: [
          { id: "p", name: "Sam" },
          { id: "q", name: "Sam" },
        ],
      });
      expect(valueLines(list)).toHaveLength(2);
    });

    it("ignores values of the wrong shape", () => {
      const list = buildAxisValueList({
        ...base,
        axis,
        presentValues: [
          "text",
          3,
          true,
          [],
          { id: 5 },
          { id: "z", name: "Zed" },
        ],
      });
      expect(valueLines(list).map((v) => v.key)).toEqual(["z"]);
    });

    it("keeps keys unique when a reference id is other or none", () => {
      const list = buildAxisValueList({
        ...base,
        axis,
        presentValues: [
          { id: "other", name: "O" },
          { id: "none", name: "N" },
        ],
      });
      const keys = list.values.map((v) => v.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(valueLines(list)).toHaveLength(2);
    });
  });
});
