/**
 * Feature 110, Task 7 (FR-5, FR-10, FR-19): selection and description of the
 * custom fields limited to the Variant subtype.
 */
import { describe, expect, it } from "vitest";
import {
  describeVariantFields,
  selectVariantFields,
} from "../../src/lib/models/folklore-variant-fields";
import {
  NOT_IN_LIST,
  VARIANT_SUBTYPE,
} from "../../src/lib/models/folklore-types";
import type { MetadataField, MetadataSchema } from "../../src/lib/models/types";

function schemaOf(...fields: MetadataField[]): MetadataSchema {
  return { groups: [{ id: "g1", label: "G", fields }] };
}

const teller: MetadataField = {
  key: "who-told-it",
  label: "Teller",
  type: "text",
  appliesTo: [VARIANT_SUBTYPE],
};
const motifs: MetadataField = {
  key: "m",
  label: "Motifs",
  type: "multiselect",
  options: ["M1 | a", "M2 | b"],
  appliesTo: ["variant"],
};

const tradition: MetadataField = {
  key: "tradition",
  label: "Tradition",
  type: "select",
  options: ["Oral", "Printed"],
  appliesTo: [VARIANT_SUBTYPE],
};

describe("selectVariantFields", () => {
  it("returns only custom fields limited to Variant, in schema order, under current labels", () => {
    const schema: MetadataSchema = {
      groups: [
        {
          id: "g1",
          label: "A",
          fields: [
            { key: "notes", label: "Notes", type: "text" },
            motifs,
            { key: "free", label: "Free", type: "text" },
            {
              key: "other",
              label: "Other",
              type: "text",
              appliesTo: ["Narrative"],
            },
          ],
        },
        { id: "g2", label: "B", fields: [{ ...teller, label: "Witness" }] },
      ],
    };
    expect(selectVariantFields(schema).map((f) => [f.key, f.label])).toEqual([
      ["m", "Motifs"],
      ["who-told-it", "Witness"],
    ]);
  });

  it("matches the subtype as isFieldVisibleForSubtype does (trim, case-fold)", () => {
    const f: MetadataField = { ...teller, appliesTo: ["  VARIANT "] };
    expect(selectVariantFields(schemaOf(f))).toHaveLength(1);
  });

  it("excludes a field also offered on folders", () => {
    const f: MetadataField = { ...teller, appliesToFolders: true };
    expect(selectVariantFields(schemaOf(f))).toEqual([]);
  });

  it("excludes types that are neither text nor multiselect", () => {
    const f: MetadataField = { ...teller, type: "number" };
    expect(selectVariantFields(schemaOf(f))).toEqual([]);
  });

  it("selects a Variant-limited select field in schema order beside text and multiselect fields", () => {
    const schema = schemaOf(teller, tradition, motifs, {
      ...tradition,
      key: "other-sel",
      appliesTo: ["Narrative"],
    });
    expect(selectVariantFields(schema).map((f) => f.key)).toEqual([
      "who-told-it",
      "tradition",
      "m",
    ]);
  });

  it("excludes a select field also offered on folders", () => {
    const f: MetadataField = { ...tradition, appliesToFolders: true };
    expect(selectVariantFields(schemaOf(f))).toEqual([]);
  });

  it("yields no fields and no error for an empty schema", () => {
    expect(selectVariantFields({ groups: [] })).toEqual([]);
  });
});

describe("describeVariantFields", () => {
  const schema = schemaOf(teller, motifs);

  it("describes a text field as a detail, set or not set", () => {
    const set = describeVariantFields(schema, { "who-told-it": "Anna" });
    expect(set[0]).toEqual({
      key: "who-told-it",
      label: "Teller",
      kind: "detail",
      state: "set",
      text: "Anna",
    });
    for (const meta of [
      {},
      undefined,
      { "who-told-it": "" },
      { "who-told-it": "  " },
    ]) {
      expect(describeVariantFields(schema, meta)[0]).toMatchObject({
        kind: "detail",
        state: "not-set",
      });
    }
  });

  it("describes a multiselect as tags and marks a tag not in the list, keeping it as stored", () => {
    const out = describeVariantFields(schema, {
      m: ["M1 | a", "M9 | gone", "M2"],
    });
    expect(out[1]).toEqual({
      key: "m",
      label: "Motifs",
      kind: "tags",
      state: "set",
      tags: [
        { text: "M1 | a", isInList: true, mark: null },
        { text: "M9 | gone", isInList: false, mark: NOT_IN_LIST },
        { text: "M2", isInList: false, mark: NOT_IN_LIST },
      ],
    });
  });

  it("reports an empty or absent tag value as not set", () => {
    expect(describeVariantFields(schema, { m: [] })[1]).toMatchObject({
      kind: "tags",
      state: "not-set",
    });
    expect(describeVariantFields(schema, {})[1]).toMatchObject({
      state: "not-set",
    });
  });

  it("never renders a wrongly shaped stored value as not set", () => {
    const out = describeVariantFields(schema, {
      "who-told-it": { a: 1 },
      m: "M1 | a",
    });
    expect(out[0]).toMatchObject({ state: "unexpected-value" });
    expect(out[1]).toMatchObject({ kind: "tags", state: "unexpected-value" });
    expect(
      describeVariantFields(schema, { m: ["M1 | a", 4] })[1],
    ).toMatchObject({ state: "unexpected-value" });
  });

  it("describes a select field as a detail with its chosen value", () => {
    const out = describeVariantFields(schemaOf(teller, tradition, motifs), {
      tradition: "Oral",
    });
    expect(out[1]).toEqual({
      key: "tradition",
      label: "Tradition",
      kind: "detail",
      state: "set",
      text: "Oral",
    });
    expect(out[0]).toMatchObject({ state: "not-set" });
    expect(out[2]).toMatchObject({ kind: "tags", state: "not-set" });
  });

  it("describes an unset select value as not set", () => {
    const sch = schemaOf(tradition);
    for (const meta of [
      {},
      undefined,
      { tradition: null },
      { tradition: "" },
      { tradition: "  " },
    ]) {
      expect(describeVariantFields(sch, meta)[0]).toEqual({
        key: "tradition",
        label: "Tradition",
        kind: "detail",
        state: "not-set",
      });
    }
  });

  it("describes a stored select value not in the option list as an unexpected value, keeping it as stored", () => {
    const meta = { tradition: "Broadside" };
    const out = describeVariantFields(schemaOf(tradition), meta);
    expect(out[0]).toEqual({
      key: "tradition",
      label: "Tradition",
      kind: "detail",
      state: "unexpected-value",
      text: "Broadside",
    });
    expect(meta).toEqual({ tradition: "Broadside" });
  });

  it("describes a wrongly shaped select value as an unexpected value, never not set", () => {
    const sch = schemaOf(tradition);
    for (const v of [["Oral"], 4, { a: 1 }]) {
      expect(describeVariantFields(sch, { tradition: v })[0]).toMatchObject({
        kind: "detail",
        state: "unexpected-value",
      });
    }
  });

  it("treats a select field with no option list as every value unexpected", () => {
    const f: MetadataField = { ...tradition, options: undefined };
    expect(
      describeVariantFields(schemaOf(f), { tradition: "Oral" })[0],
    ).toMatchObject({ state: "unexpected-value" });
  });

  it("yields no tag entry for a project with no tag fields", () => {
    const out = describeVariantFields(schemaOf(teller), {});
    expect(out.some((d) => d.kind === "tags")).toBe(false);
  });

  it("shows a renamed field and a writer-chosen key", () => {
    const out = describeVariantFields(
      schemaOf({ ...teller, key: "zz-9", label: "Informant" }),
      { "zz-9": "Bo" },
    );
    expect(out[0]).toMatchObject({
      key: "zz-9",
      label: "Informant",
      text: "Bo",
    });
  });

  it("does not mutate its inputs", () => {
    const meta = { m: ["x"] };
    describeVariantFields(schema, meta);
    expect(meta).toEqual({ m: ["x"] });
  });
});
