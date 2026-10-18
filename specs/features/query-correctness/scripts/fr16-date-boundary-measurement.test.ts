/**
 * Feature 86 Task 3: throwaway measurement (not a fix, not part of the shipped
 * suite). Copy to frontend/tests/unit/ to run, then remove the copy.
 * Prints JSON lines starting with "MEASURE ". Zone America/New_York,
 * evaluation time 2026-03-10 15:00 local.
 */
process.env.TZ = "America/New_York";

import { describe, it } from "vitest";
import { groupsToAst } from "../../components/QueryBuilder/ast-chip-bridge";
import type {
  FilterChipField,
  FilterChipValue,
} from "../../components/QueryBuilder/FilterChip";
import { evaluate } from "../../src/lib/models/query-evaluator";
import type { QueryAST } from "../../src/lib/models/query-ast";
import type { ResourceBase } from "../../src/lib/models/types";

const local = (m: number, d: number, h: number, mi: number): string =>
  new Date(2026, m - 1, d, h, mi).toISOString();

const STAMPS: Record<string, string> = {
  a: local(3, 9, 23, 59), // D-1 23:59
  b: local(3, 10, 0, 1), // D 00:01
  c: local(3, 10, 23, 59), // D 23:59
  d: local(3, 11, 0, 1), // D+1 00:01
};
const DATES: Record<string, string> = {
  a: "2026-03-09",
  b: "2026-03-10",
  c: "2026-03-10",
  d: "2026-03-11",
};
const RESOURCES: ResourceBase[] = Object.keys(STAMPS).map((id, i) => ({
  id,
  slug: id,
  name: id,
  type: "text",
  folderId: null,
  orderIndex: i,
  createdAt: STAMPS[id],
  updatedAt: STAMPS[id],
}));
const SIDECARS = Object.fromEntries(
  Object.keys(DATES).map((id) => [id, { dt: DATES[id] }]),
);
const CONTEXT = {
  config: { editorConfig: {} },
  backlinks: {},
  mentions: {},
};

function ast(key: string, operator: string, value: FilterChipValue): QueryAST {
  const field: FilterChipField = { key, label: key, type: "date" };
  const out = groupsToAst(
    [
      {
        id: "g",
        combinator: "and",
        chips: [{ id: "c", field, operator, value }],
      },
    ],
    "and",
  );
  if (out === null) throw new Error("null ast");
  return out;
}

describe("measure", () => {
  it("prints", async () => {
    const log = (o: unknown): void => {
      console.log("MEASURE " + JSON.stringify(o));
    };
    log({ stored: STAMPS, customDates: DATES });
    const D = "2026-03-10";
    const X = "2026-03-09";
    const cases: [string, FilterChipValue, string][] = [
      ["is-before", D, "a"],
      ["is-after", D, "d"],
      ["is-between", { from: X, to: D }, "a,b,c"],
      ["is-on", D, "b,c"],
    ];
    for (const key of ["createdAt", "updatedAt", "dt"]) {
      for (const [op, value, label] of cases) {
        const q = ast(key, op, value);
        const ids = await evaluate(q, {
          resources: RESOURCES,
          sidecars: SIDECARS,
          context: CONTEXT,
          evaluationTime: new Date(2026, 2, 10, 15, 0),
        });
        log({ key, op, value, ast: q, returned: [...ids].sort().join(","), label });
      }
    }
    // FR-3: in-the-last, value never edited.
    log({
      untouchedInTheLast: ast("createdAt", "in-the-last", null),
      displayed: { amount: 7, unit: "days" },
    });
    // typed-name resource-ref
    log({
      typedRef: ast("ref", "is", "Tom"),
      pickedRef: ast("ref", "is", { id: "t1", name: "Tom" } as never),
    });
    // starts-with
    log({ startsWith: ast("txt", "starts-with", "alpha") });
  });
});
