/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { evaluate } from "../../src/lib/models/query-evaluator";
import type { EvaluationInput } from "../../src/lib/models/query-evaluator";
import type { QueryContext } from "../../src/lib/models/query-intrinsics";
import type { QueryAST } from "../../src/lib/models/query-ast";
import type { MetadataValue, ResourceBase } from "../../src/lib/models/types";
import ValuePicker from "../../components/QueryBuilder/ValuePicker";

// Feature 110, FR-1 (c): an exact `in` query finds a Source by the whole
// option string, including the " | " separator, a comma and a double quote;
// a code prefix finds nothing; the query builder's single-value picker passes
// the whole option string. No evaluator change is made by this test. It runs
// in jsdom (docblock above) because the picker is a component, and uses
// createElement because the declared file is a .ts file.

const SEP = "ATU 510A | Cinderella";
const COMMA = "Cinderella, or the Little Glass Slipper";
const QUOTE = 'The "Glass" Slipper';

const source = (id: string, orderIndex: number): ResourceBase => ({
  id,
  slug: id,
  name: id,
  type: "source",
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

const resources: ResourceBase[] = [
  source("sep", 0),
  source("comma", 1),
  source("quote", 2),
  source("other", 3),
];
const sidecars: Record<string, Record<string, MetadataValue>> = {
  sep: { "tale-type": [SEP, "ATU 510B | Peau d'Ane"] },
  comma: { "tale-type": [COMMA] },
  quote: { "tale-type": [QUOTE] },
  other: { "tale-type": ["ATU 333 | Little Red Riding Hood"] },
};

function run(value: MetadataValue): Promise<string[]> {
  const input: EvaluationInput = { resources, sidecars, context: ctx };
  const ast: QueryAST = { op: "in", field: "tale-type", value };
  return evaluate(ast, input);
}

describe("exact `in` query on a multiselect tag", () => {
  it("finds a Source by the full option string with the ' | ' separator", async () => {
    expect(await run([SEP])).toEqual(["sep"]);
    expect(await run(SEP)).toEqual(["sep"]);
  });

  it("finds a Source by an option string containing a comma", async () => {
    expect(await run([COMMA])).toEqual(["comma"]);
  });

  it("finds a Source by an option string containing a double quote", async () => {
    expect(await run([QUOTE])).toEqual(["quote"]);
  });

  it("finds nothing for a code prefix or a name-only part", async () => {
    expect(await run(["ATU 510A"])).toEqual([]);
    expect(await run(["ATU 510A |"])).toEqual([]);
    expect(await run(["Cinderella"])).toEqual([]);
  });

  it("an `in` list of several whole strings matches either", async () => {
    expect((await run([SEP, QUOTE])).sort()).toEqual(["quote", "sep"]);
  });
});

describe("query builder value picker with whole option strings", () => {
  const OPTIONS: string[] = [SEP, COMMA, QUOTE];

  it.each(OPTIONS)("passes %s unchanged", (option: string) => {
    const onChange = vi.fn();
    render(
      React.createElement(ValuePicker, {
        fieldType: "multiselect",
        operator: "includes",
        value: null,
        onChange,
        options: OPTIONS,
      }),
    );
    fireEvent.change(screen.getByLabelText("Value"), {
      target: { value: option },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(option);
  });
});
