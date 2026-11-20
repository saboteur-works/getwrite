/**
 * Feature 121, Task 20: the pure metadata carry of a merge (FR-10). Every
 * clause of the task's "Done when" has its own test.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyMergeMetadataCarry,
  defaultMergeMetadataChoice,
  offerMergeMetadataFields,
  type MergeMetadataSource,
} from "../../src/lib/models/merge-metadata";
import type { MetadataValue } from "../../src/lib/models/types";

const A: MergeMetadataSource = {
  documentId: "doc-a",
  userMetadata: {
    status: "Draft",
    pov: "first",
    mood: "calm",
    tags: ["x", "y"],
    empty: "",
    nothing: null,
    none: [],
  },
};
const B: MergeMetadataSource = {
  documentId: "doc-b",
  userMetadata: { status: "Final", tags: ["y", "z"], place: "Oslo" },
};

function ok(
  r: ReturnType<typeof applyMergeMetadataCarry>,
): Record<string, MetadataValue> {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  return r.userMetadata;
}

describe("default choice", () => {
  it("starts with no field ticked and nothing united", () => {
    expect(defaultMergeMetadataChoice()).toEqual({
      fields: [],
      unitedMultiselectFields: [],
    });
  });
  it("returns a fresh object each call", () => {
    expect(defaultMergeMetadataChoice()).not.toBe(defaultMergeMetadataChoice());
  });
});

describe("offerMergeMetadataFields", () => {
  it("offers only fields that hold a value in some absorbed document", () => {
    const fields = offerMergeMetadataFields([A, B]).map((o) => o.field);
    expect(fields).toEqual(["status", "pov", "mood", "tags", "place"]);
  });
  it("lists each source document's value, skipping documents with none", () => {
    const offers = offerMergeMetadataFields([A, B]);
    expect(offers.find((o) => o.field === "status")?.values).toEqual([
      { documentId: "doc-a", value: "Draft" },
      { documentId: "doc-b", value: "Final" },
    ]);
    expect(offers.find((o) => o.field === "place")?.values).toEqual([
      { documentId: "doc-b", value: "Oslo" },
    ]);
  });
  it("offers nothing when no absorbed document holds a value", () => {
    expect(
      offerMergeMetadataFields([{ documentId: "d", userMetadata: {} }]),
    ).toEqual([]);
  });
});

describe("applyMergeMetadataCarry with no choice", () => {
  const target = { status: "Mine", pov: "third", custom: "keep", tags: ["t"] };
  it("leaves the target's metadata equal to what it was", () => {
    const result = ok(
      applyMergeMetadataCarry(target, [A, B], defaultMergeMetadataChoice()),
    );
    expect(result).toEqual(target);
  });
  it("returns only userMetadata: name, subtype, goal, folder, position and compile exclusion are not in the result", () => {
    const r = applyMergeMetadataCarry(
      target,
      [A, B],
      defaultMergeMetadataChoice(),
    );
    expect(Object.keys(r).sort()).toEqual(["ok", "userMetadata"]);
  });
  it("does not invent a status the target lacks", () => {
    const result = ok(
      applyMergeMetadataCarry({}, [A, B], defaultMergeMetadataChoice()),
    );
    expect("status" in result).toBe(false);
    expect(result).toEqual({});
  });
});

describe("applyMergeMetadataCarry with a choice", () => {
  it("takes a chosen field's value from exactly the named source", () => {
    const result = ok(
      applyMergeMetadataCarry({ status: "Mine" }, [A, B], {
        fields: [{ field: "status", sourceDocumentId: "doc-b" }],
        unitedMultiselectFields: [],
      }),
    );
    expect(result).toEqual({ status: "Final" });
  });
  it("takes nothing for a field whose source is none", () => {
    const result = ok(
      applyMergeMetadataCarry({ status: "Mine" }, [A, B], {
        fields: [{ field: "status", sourceDocumentId: null }],
        unitedMultiselectFields: [],
      }),
    );
    expect(result).toEqual({ status: "Mine" });
  });
  it("adds a carried field the target lacked and leaves the others", () => {
    const result = ok(
      applyMergeMetadataCarry({ status: "Mine" }, [A, B], {
        fields: [{ field: "place", sourceDocumentId: "doc-b" }],
        unitedMultiselectFields: [],
      }),
    );
    expect(result).toEqual({ status: "Mine", place: "Oslo" });
  });
  it("leaves a field untouched when the named source holds no value for it", () => {
    const result = ok(
      applyMergeMetadataCarry({ status: "Mine" }, [A, B], {
        fields: [{ field: "place", sourceDocumentId: "doc-a" }],
        unitedMultiselectFields: [],
      }),
    );
    expect(result).toEqual({ status: "Mine" });
    expect("place" in result).toBe(false);
  });
  it("refuses two sources for a field that is not united", () => {
    const r = applyMergeMetadataCarry({}, [A, B], {
      fields: [
        { field: "status", sourceDocumentId: "doc-a" },
        { field: "status", sourceDocumentId: "doc-b" },
      ],
      unitedMultiselectFields: [],
    });
    expect(r).toEqual({ ok: false, reason: "repeated-field", field: "status" });
  });
  it("refuses a source that is not an absorbed document", () => {
    const r = applyMergeMetadataCarry({}, [A, B], {
      fields: [{ field: "status", sourceDocumentId: "doc-zzz" }],
      unitedMultiselectFields: [],
    });
    expect(r).toEqual({ ok: false, reason: "unknown-source", field: "status" });
  });
  it("unites multiselect values from the chosen sources without duplicates, keeping the target's own", () => {
    const result = ok(
      applyMergeMetadataCarry({ tags: ["t", "z"] }, [A, B], {
        fields: [
          { field: "tags", sourceDocumentId: "doc-a" },
          { field: "tags", sourceDocumentId: "doc-b" },
        ],
        unitedMultiselectFields: ["tags"],
      }),
    );
    expect(result).toEqual({ tags: ["t", "z", "x", "y"] });
  });
  it("unites from only the chosen sources", () => {
    const result = ok(
      applyMergeMetadataCarry({ tags: ["t"] }, [A, B], {
        fields: [{ field: "tags", sourceDocumentId: "doc-b" }],
        unitedMultiselectFields: ["tags"],
      }),
    );
    expect(result).toEqual({ tags: ["t", "y", "z"] });
  });
  it("reports a united field whose value is not a list", () => {
    const r = applyMergeMetadataCarry({}, [A, B], {
      fields: [{ field: "status", sourceDocumentId: "doc-a" }],
      unitedMultiselectFields: ["status"],
    });
    expect(r).toEqual({ ok: false, reason: "not-a-list", field: "status" });
  });
});

describe("purity", () => {
  it("changes neither the target nor the absorbed documents", () => {
    const target = { status: "Mine", tags: ["t"] };
    const absorbed = [structuredClone(A), structuredClone(B)];
    const before = structuredClone({ target, absorbed });
    const r = ok(
      applyMergeMetadataCarry(target, absorbed, {
        fields: [
          { field: "status", sourceDocumentId: "doc-a" },
          { field: "tags", sourceDocumentId: "doc-b" },
        ],
        unitedMultiselectFields: ["tags"],
      }),
    );
    expect({ target, absorbed }).toEqual(before);
    (r.tags as string[]).push("mutated");
    expect(absorbed[1].userMetadata.tags).toEqual(["y", "z"]);
    expect(target.tags).toEqual(["t"]);
  });
  it("does no I/O: the module has no runtime imports", () => {
    const source = readFileSync(
      path.resolve(__dirname, "../../src/lib/models/merge-metadata.ts"),
      "utf8",
    );
    const runtime = [
      ...source.matchAll(/^import\s+(?!type\b)[^;]*from\s+["']([^"']+)["']/gm),
    ];
    expect(runtime.map((m) => m[1])).toEqual([]);
  });
});
