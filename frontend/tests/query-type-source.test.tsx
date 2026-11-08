import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { evaluate } from "../src/lib/models/query-evaluator";
import type { EvaluationInput } from "../src/lib/models/query-evaluator";
import { INTRINSIC_FIELDS } from "../src/lib/models/query-intrinsics";
import type { QueryContext } from "../src/lib/models/query-intrinsics";
import type { QueryAST } from "../src/lib/models/query-ast";
import type { ResourceBase, ResourceType } from "../src/lib/models/types";
import { buildFieldPickerFields } from "../components/QueryBuilder/FieldPicker";
import ValuePicker from "../components/QueryBuilder/ValuePicker";

// Feature 103, FR-29: "source" joins the `type` intrinsic's options.

const resource = (
  id: string,
  type: ResourceType,
  orderIndex: number,
): ResourceBase => ({
  id,
  slug: id,
  name: id,
  type,
  folderId: null,
  orderIndex,
  statuses: [],
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-06-01T00:00:00.000Z",
});

const ctx: QueryContext = {
  config: { editorConfig: {}, tags: [], tagAssignments: {}, statuses: [] },
  backlinks: {},
  mentions: {},
};

function input(resources: ResourceBase[]): EvaluationInput {
  return { resources, sidecars: {}, context: ctx };
}

// The corpus the existing saved-query tests use: one resource of each of the
// types the query tests exercise (text, image, audio, folder), no Source.
const CORPUS: ResourceBase[] = [
  resource("t1", "text", 0),
  resource("t2", "text", 1),
  resource("i1", "image", 2),
  resource("a1", "audio", 3),
  resource("f1", "folder", 4),
];

const CORPUS_QUERIES: Array<[string, QueryAST, string[]]> = [
  ["type = text", { op: "eq", field: "type", value: "text" }, ["t1", "t2"]],
  ["type = image", { op: "eq", field: "type", value: "image" }, ["i1"]],
  ["type = audio", { op: "eq", field: "type", value: "audio" }, ["a1"]],
  ["type = folder", { op: "eq", field: "type", value: "folder" }, ["f1"]],
  [
    "type != text",
    { op: "ne", field: "type", value: "text" },
    ["i1", "a1", "f1"],
  ],
  [
    "type in [text, audio]",
    { op: "in", field: "type", value: ["text", "audio"] },
    ["t1", "t2", "a1"],
  ],
  [
    "not(type = image)",
    { op: "not", child: { op: "eq", field: "type", value: "image" } },
    ["t1", "t2", "a1", "f1"],
  ],
  [
    "type = text or type = image",
    {
      op: "or",
      children: [
        { op: "eq", field: "type", value: "text" },
        { op: "eq", field: "type", value: "image" },
      ],
    },
    ["t1", "t2", "i1"],
  ],
  [
    "type = source (no Source present)",
    { op: "eq", field: "type", value: "source" },
    [],
  ],
];

describe("Type filter offers Source (FR-29)", () => {
  const typeField = INTRINSIC_FIELDS.find((f) => f.key === "type")!;

  it("keeps text, image, audio, folder in order and adds source", () => {
    expect(typeField.options?.slice(0, 4)).toEqual([
      "text",
      "image",
      "audio",
      "folder",
    ]);
    expect(typeField.options).toContain("source");
    expect(typeField.options).toHaveLength(5);
  });

  it("surfaces Source in the field list the query builder builds", () => {
    const field = buildFieldPickerFields().find((f) => f.key === "type");
    expect(field?.options).toContain("source");
  });

  it("lists Source in the value picker for the Type field", () => {
    render(
      <ValuePicker
        fieldType="select"
        operator="is"
        value={null}
        onChange={vi.fn()}
        options={typeField.options}
      />,
    );
    const optionEls: HTMLElement[] = screen.getAllByRole("option");
    const names: string[] = optionEls.map(
      (o: HTMLElement) => (o as HTMLOptionElement).value,
    );
    expect(names).toEqual(["", ...(typeField.options ?? [])]);
    expect(names).toContain("source");
  });

  it("type = source returns the Source only, not the text document", async () => {
    const resources = [
      resource("doc", "text", 0),
      resource("src", "source", 1),
    ];
    const result = await evaluate(
      { op: "eq", field: "type", value: "source" },
      input(resources),
    );
    expect(result).toEqual(["src"]);
    const text = await evaluate(
      { op: "eq", field: "type", value: "text" },
      input(resources),
    );
    expect(text).toEqual(["doc"]);
  });
});

describe("existing saved-query corpus returns the same results (FR-29)", () => {
  it.each(CORPUS_QUERIES)("%s", async (_name, ast, expected) => {
    expect(await evaluate(ast, input(CORPUS))).toEqual(expected);
  });
});
