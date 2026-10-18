/**
 * Feature 86 (FR-1..FR-3, FR-9, FR-13): the builder-to-evaluator check.
 *
 * For every field type in OPERATORS_BY_TYPE and every operator it offers, a
 * chip is built the way the UI leaves it, run through `groupsToAst`, parsed
 * with the QueryAST schema, evaluated with `evaluate` against fixtures, and the
 * returned ids are compared with an expected set written by hand from the
 * operator's LABEL (never from what the code returns).
 *
 * Chip states (FR-3):
 *  - "edited":    the value as the UI stores it after the writer edits the value.
 *  - "untouched": the chip right after the operator is chosen. A fresh chip has
 *                 value `null` (useQueryBuilderState), `handleOperatorChange`
 *                 (FilterChip.tsx) resets the value only for a no-value
 *                 operator, and the "in the last" input DISPLAYS 7 days while
 *                 the chip value is not a relative-date object
 *                 (FilterChip.tsx ValueInput, ValuePicker.tsx InTheLastInput).
 *                 The expectation is written from what the input displays.
 *  - "carried":   the value left over from the previous operator's edit (the
 *                 UI keeps it). Asserts only that the result parses against the
 *                 schema and evaluates without throwing.
 *
 * Fixed clock and zone: the zone is pinned to America/New_York (DST began
 * 2026-03-08) and the evaluation time is 2026-03-10 15:00 local. Timestamps are
 * built in that zone, so the day-boundary cases do not depend on the machine.
 *
 * Failing cases are marked as expected failures (`it.fails`) in KNOWN_FAILURES
 * below, each naming its defect ID, so the suite runs green on the unfixed
 * tree. `it.fails` FAILS the run when the case starts to pass, which forces the
 * marker off in the task that fixes it. Nothing here is skipped or deleted.
 */
process.env.TZ = "America/New_York";

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { groupsToAst } from "../../components/QueryBuilder/ast-chip-bridge";
import {
  buildOperatorStub,
  getOperatorOption,
  OPERATORS_BY_TYPE,
  valueForOperatorChange,
} from "../../components/QueryBuilder/operator-utils";
import type {
  FilterChipField,
  FilterChipValue,
} from "../../components/QueryBuilder/FilterChip";
import type { QueryGroup } from "../../components/QueryBuilder/QueryBuilder";
import { QueryASTSchema } from "../../src/lib/models/query-ast";
import type { QueryAST } from "../../src/lib/models/query-ast";
import { evaluate } from "../../src/lib/models/query-evaluator";
import type { EvaluationInput } from "../../src/lib/models/query-evaluator";
import type { QueryContext } from "../../src/lib/models/query-intrinsics";
import type {
  MetadataFieldType,
  MetadataValue,
  ResourceBase,
  ResourceRef,
} from "../../src/lib/models/types";

// ─── Fixed clock ─────────────────────────────────────────────────────────────

/** Local (America/New_York) wall-clock time as an ISO instant. */
function local(
  month: number,
  day: number,
  hour: number,
  minute: number,
): string {
  return new Date(2026, month - 1, day, hour, minute).toISOString();
}

const NOW = new Date(2026, 2, 10, 15, 0);

// ─── Fixtures ────────────────────────────────────────────────────────────────

const IDS = ["r1", "r2", "r3", "r4", "r5", "r6", "r7"] as const;

/** Builds a list of fixture ids from numbers: `r(1, 3)` is ["r1", "r3"]. */
function r(...numbers: number[]): string[] {
  return numbers.map((n) => `r${n}`);
}

const ref = (id: string | null, name: string): ResourceRef => ({ id, name });
const TOM = ref("t1", "Tom");
const ANN = ref("t2", "Ann");
const BO = ref("t3", "Bo");
const ALICE = ref("a", "Alice");
const BOB = ref("b", "Bob");
const CARA = ref("c", "Cara");

/** createdAt of each fixture resource, local America/New_York. */
const CREATED_AT: Record<string, string> = {
  r1: local(3, 9, 23, 59), // one minute before local midnight starting 2026-03-10
  r2: local(3, 10, 0, 1), // one minute after local midnight
  r3: local(3, 10, 14, 57), // three minutes before the evaluation time
  r4: local(3, 3, 12, 0), // just outside 7 days, inside 1 month
  r5: local(3, 9, 15, 30), // 23.5 hours before the evaluation time
  r6: local(3, 11, 10, 0), // after the evaluation time
  r7: local(1, 15, 9, 0), // old
};

/** updatedAt equals createdAt, except r7 which has none. */
const UPDATED_AT: Record<string, string | undefined> = {
  ...CREATED_AT,
  r7: undefined,
};

const SIDECARS: Record<string, Record<string, MetadataValue>> = {
  r1: {
    txt: "alpha beta",
    num: 1,
    dt: "2026-03-09",
    flag: true,
    sel: "red",
    multi: ["Alpha", "Beta"],
    ref: TOM,
    mref: [ALICE, BOB],
  },
  r2: {
    txt: "beta",
    num: 5,
    dt: "2026-03-10",
    flag: false,
    sel: "green",
    multi: ["Alpha"],
    ref: ANN,
    mref: [ALICE],
  },
  r3: {
    txt: "alphabet",
    num: 10,
    dt: "2026-03-11",
    flag: true,
    sel: "blue",
    multi: ["Beta"],
    ref: TOM,
    mref: [BOB],
  },
  r4: {
    txt: "",
    num: 0,
    dt: "2026-01-01",
    sel: "red",
    multi: [],
    ref: null,
    mref: [],
  },
  r5: { txt: "the alpha", flag: false },
  r6: {
    num: 5,
    dt: "2026-03-10",
    flag: true,
    sel: "",
    multi: ["Alpha", "Beta", "Gamma"],
    ref: BO,
    mref: [ALICE, BOB, CARA],
  },
  r7: {
    txt: "alpha",
    num: 20,
    dt: "2026-03-12",
    sel: "green",
    multi: ["Gamma"],
    ref: ANN,
    mref: [CARA],
  },
};

const RESOURCES: ResourceBase[] = IDS.map(
  (id, index): ResourceBase => ({
    id,
    slug: id,
    name: id,
    type: "text",
    folderId: null,
    orderIndex: index,
    createdAt: CREATED_AT[id],
    updatedAt: UPDATED_AT[id],
  }),
);

const CONTEXT: QueryContext = {
  config: { editorConfig: {} },
  backlinks: {},
  mentions: {},
};

function evaluationInput(
  overrides?: Partial<EvaluationInput>,
): EvaluationInput {
  return {
    resources: RESOURCES,
    sidecars: SIDECARS,
    context: CONTEXT,
    evaluationTime: NOW,
    ...overrides,
  };
}

// ─── Case tables (expected sets are written from the operator labels) ────────

interface Scenario {
  /** Short name shown in the test title. */
  name: string;
  /** The chip value as the UI stores it once the writer has edited it. */
  value: FilterChipValue;
  /** Ids the operator's label promises, against the fixtures above. */
  expected: string[];
}

interface OperatorCase {
  scenarios: Scenario[];
  /**
   * Expected ids for a chip whose operator was just chosen and whose value was
   * never edited, written from what the input displays. Absent when the input
   * displays nothing that carries a meaning.
   */
  untouchedExpected?: string[];
}

interface Subject {
  name: string;
  type: MetadataFieldType;
  field: FilterChipField;
  cases: Record<string, OperatorCase>;
}

const one = (
  name: string,
  value: FilterChipValue,
  expected: string[],
): OperatorCase => ({ scenarios: [{ name, value, expected }] });

const EMPTY_OPS = (
  empty: string[],
  any: string[],
): Record<string, OperatorCase> => ({
  "is-empty": one("none", null, empty),
  "has-any-value": one("none", null, any),
});

const TEXT_CASES: Record<string, OperatorCase> = {
  is: one("alpha", "alpha", r(7)),
  "is-not": one("alpha", "alpha", r(1, 2, 3, 4, 5, 6)),
  contains: one("beta", "beta", r(1, 2)),
  "does-not-contain": one("beta", "beta", r(3, 4, 5, 6, 7)),
  "starts-with": one("alpha", "alpha", r(1, 3, 7)),
  "matches-regex": one("^b.ta$", "^b.ta$", r(2)),
  ...EMPTY_OPS(r(4, 6), r(1, 2, 3, 5, 7)),
};

const NUMBER_CASES: Record<string, OperatorCase> = {
  equals: one("5", 5, r(2, 6)),
  "does-not-equal": one("5", 5, r(1, 3, 4, 5, 7)),
  "is-less-than": one("5", 5, r(1, 4)),
  "is-at-most": one("5", 5, r(1, 2, 4, 6)),
  "is-greater-than": one("5", 5, r(3, 7)),
  "is-at-least": one("5", 5, r(2, 3, 6, 7)),
  "is-between": one("5 to 10", { from: 5, to: 10 }, r(2, 3, 6)),
  ...EMPTY_OPS(r(5), r(1, 2, 3, 4, 6, 7)),
};

const CUSTOM_DATE_CASES: Record<string, OperatorCase> = {
  "is-on": one("2026-03-10", "2026-03-10", r(2, 6)),
  "is-before": one("2026-03-10", "2026-03-10", r(1, 4)),
  "is-after": one("2026-03-10", "2026-03-10", r(3, 7)),
  "is-between": one(
    "2026-03-10 to 2026-03-11",
    { from: "2026-03-10", to: "2026-03-11" },
    r(2, 3, 6),
  ),
  "in-the-last": {
    scenarios: [
      {
        name: "7 days",
        value: { amount: 7, unit: "days" },
        expected: r(1, 2, 6),
      },
    ],
    untouchedExpected: r(1, 2, 6),
  },
  ...EMPTY_OPS(r(5), r(1, 2, 3, 4, 6, 7)),
};

/**
 * The intrinsic timestamp fields. `old` is r7, whose createdAt is old but whose
 * updatedAt is absent, so it appears in createdAt expectations only.
 */
function timestampCases(old: string[]): Record<string, OperatorCase> {
  const last = (
    name: string,
    amount: number,
    unit: "days" | "weeks" | "months",
    expected: string[],
  ): Scenario => ({ name, value: { amount, unit }, expected });
  const within7Days = r(1, 2, 3, 5);
  return {
    "is-on": {
      scenarios: [
        { name: "2026-03-10", value: "2026-03-10", expected: r(2, 3) },
        { name: "2026-03-09", value: "2026-03-09", expected: r(1, 5) },
      ],
    },
    "is-before": {
      scenarios: [
        {
          name: "2026-03-10",
          value: "2026-03-10",
          expected: [...r(1, 4, 5), ...old],
        },
      ],
    },
    "is-after": {
      scenarios: [
        { name: "2026-03-10", value: "2026-03-10", expected: r(6) },
        { name: "2026-03-09", value: "2026-03-09", expected: r(2, 3, 6) },
      ],
    },
    "is-between": {
      scenarios: [
        {
          name: "2026-03-10 to 2026-03-10",
          value: { from: "2026-03-10", to: "2026-03-10" },
          expected: r(2, 3),
        },
        {
          name: "2026-03-09 to 2026-03-10",
          value: { from: "2026-03-09", to: "2026-03-10" },
          expected: r(1, 2, 3, 5),
        },
      ],
    },
    "in-the-last": {
      scenarios: [
        last("1 days", 1, "days", within7Days),
        last("7 days", 7, "days", within7Days),
        last("1 weeks", 1, "weeks", within7Days),
        last("1 months", 1, "months", r(1, 2, 3, 4, 5)),
      ],
      untouchedExpected: within7Days,
    },
    ...EMPTY_OPS(old.length === 0 ? r(7) : [], [
      ...r(1, 2, 3, 4, 5, 6),
      ...old,
    ]),
  };
}

const BOOLEAN_CASES: Record<string, OperatorCase> = {
  "is-true": one("none", null, r(1, 3, 6)),
  "is-false": one("none", null, r(2, 5)),
  ...EMPTY_OPS(r(4, 7), r(1, 2, 3, 5, 6)),
};

const SELECT_CASES: Record<string, OperatorCase> = {
  is: one("red", "red", r(1, 4)),
  "is-not": one("red", "red", r(2, 3, 5, 6, 7)),
  "is-any-of": one("red, green", ["red", "green"], r(1, 2, 4, 7)),
  "is-none-of": one("red, green", ["red", "green"], r(3, 5, 6)),
  ...EMPTY_OPS(r(5, 6), r(1, 2, 3, 4, 7)),
};

const MULTISELECT_CASES: Record<string, OperatorCase> = {
  includes: one("Alpha", "Alpha", r(1, 2, 6)),
  "does-not-include": one("Alpha", "Alpha", r(3, 4, 5, 7)),
  "includes-all-of": one("Alpha, Beta", ["Alpha", "Beta"], r(1, 6)),
  "includes-any-of": one("Alpha, Beta", ["Alpha", "Beta"], r(1, 2, 3, 6)),
  "includes-none-of": one("Alpha, Beta", ["Alpha", "Beta"], r(4, 5, 7)),
  ...EMPTY_OPS(r(4, 5), r(1, 2, 3, 6, 7)),
};

const RESOURCE_REF_CASES: Record<string, OperatorCase> = {
  is: {
    scenarios: [
      { name: "picked Tom", value: TOM, expected: r(1, 3) },
      { name: "typed name Tom", value: "Tom", expected: r(1, 3) },
    ],
  },
  "is-not": {
    scenarios: [
      { name: "picked Tom", value: TOM, expected: r(2, 4, 5, 6, 7) },
      { name: "typed name Tom", value: "Tom", expected: r(2, 4, 5, 6, 7) },
    ],
  },
  "is-any-of": one("t1, t2", ["t1", "t2"], r(1, 2, 3, 7)),
  "is-none-of": one("t1, t2", ["t1", "t2"], r(4, 5, 6)),
  ...EMPTY_OPS(r(4, 5), r(1, 2, 3, 6, 7)),
};

const MULTI_REF_CASES: Record<string, OperatorCase> = {
  includes: one("picked Alice", ALICE, r(1, 2, 6)),
  "does-not-include": one("picked Alice", ALICE, r(3, 4, 5, 7)),
  "includes-all-of": one("a, b", ["a", "b"], r(1, 6)),
  "includes-any-of": one("a, b", ["a", "b"], r(1, 2, 3, 6)),
  "includes-none-of": one("a, b", ["a", "b"], r(4, 5, 7)),
  ...EMPTY_OPS(r(4, 5), r(1, 2, 3, 6, 7)),
};

const chipField = (
  key: string,
  type: MetadataFieldType,
  options?: string[],
): FilterChipField => ({ key, label: key, type, options });

const SUBJECTS: Subject[] = [
  {
    name: "text",
    type: "text",
    field: chipField("txt", "text"),
    cases: TEXT_CASES,
  },
  {
    name: "number",
    type: "number",
    field: chipField("num", "number"),
    cases: NUMBER_CASES,
  },
  {
    name: "date (custom field)",
    type: "date",
    field: chipField("dt", "date"),
    cases: CUSTOM_DATE_CASES,
  },
  {
    name: "date (createdAt)",
    type: "date",
    field: chipField("createdAt", "date"),
    cases: timestampCases(r(7)),
  },
  {
    name: "date (updatedAt)",
    type: "date",
    field: chipField("updatedAt", "date"),
    cases: timestampCases([]),
  },
  {
    name: "boolean",
    type: "boolean",
    field: chipField("flag", "boolean"),
    cases: BOOLEAN_CASES,
  },
  {
    name: "select",
    type: "select",
    field: chipField("sel", "select", ["red", "green", "blue"]),
    cases: SELECT_CASES,
  },
  {
    name: "multiselect",
    type: "multiselect",
    field: chipField("multi", "multiselect", ["Alpha", "Beta", "Gamma"]),
    cases: MULTISELECT_CASES,
  },
  {
    name: "resource-ref",
    type: "resource-ref",
    field: chipField("ref", "resource-ref"),
    cases: RESOURCE_REF_CASES,
  },
  {
    name: "multi-resource-ref",
    type: "multi-resource-ref",
    field: chipField("mref", "multi-resource-ref"),
    cases: MULTI_REF_CASES,
  },
];

const ALL_TYPES = Object.keys(OPERATORS_BY_TYPE) as MetadataFieldType[];

/** Operator values a field type offers, dividers dropped. */
function operatorValues(type: MetadataFieldType): string[] {
  return OPERATORS_BY_TYPE[type].flatMap((entry) =>
    entry === "divider" ? [] : [entry.value],
  );
}

// ─── Running a chip ──────────────────────────────────────────────────────────

/** Builds the chip as the UI holds it and returns the AST `groupsToAst` saves. */
function savedAst(
  field: FilterChipField,
  operator: string,
  value: FilterChipValue,
): QueryAST {
  const group: QueryGroup = {
    id: "g1",
    combinator: "and",
    chips: [{ id: "c1", field, operator, value }],
  };
  const ast = groupsToAst([group], "and");
  if (ast === null) {
    throw new Error(`groupsToAst returned null for ${field.key}/${operator}`);
  }
  return ast;
}

function assertSchemaValid(ast: QueryAST): void {
  const parsed = QueryASTSchema.safeParse(ast);
  expect(
    parsed.success,
    `QueryAST schema rejected ${JSON.stringify(ast)}`,
  ).toBe(true);
}

async function idsFor(
  field: FilterChipField,
  operator: string,
  value: FilterChipValue,
): Promise<string[]> {
  const ast = savedAst(field, operator, value);
  assertSchemaValid(ast);
  return [...(await evaluate(ast, evaluationInput()))].sort();
}

// ─── Expected failures (Feature 86 Task 3) ───────────────────────────────────

/**
 * Cases that fail on the unfixed tree, keyed by the case title, valued with the
 * defect ID. Measured by the unfixed-tree run (FR-4); each fix task removes its
 * entries. Task 22 removed the D-17 / F-4 "in the last" untouched entries.
 * "known failure (owner
 * decision, FR-4 stop 2026-10-16) F-2/F-3": resource-ref typed name, recorded
 * and not fixed in this feature (FR-34).
 */
const KNOWN_FAILURES: ReadonlyMap<string, string> = new Map<string, string>([
  [
    "resource-ref › is › typed name Tom › edited",
    "known failure (owner decision, FR-4 stop 2026-10-16) F-2",
  ],
  [
    "resource-ref › is-not › typed name Tom › edited",
    "known failure (owner decision, FR-4 stop 2026-10-16) F-3",
  ],
]);

const GENERATED_TITLES = new Set<string>();

/** `it`, or `it.fails` when the case is a known failure naming its defect. */
function checkCase(title: string, body: () => Promise<void>): void {
  GENERATED_TITLES.add(title);
  const defect = KNOWN_FAILURES.get(title);
  if (defect === undefined) {
    it(title, body);
  } else {
    it.fails(`${title} [expected failure: ${defect}]`, body);
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("fixed clock and zone", () => {
  it("runs in America/New_York with DST in force on the fixture days", () => {
    expect(new Date("2026-03-10T04:00:00.000Z").getHours()).toBe(0);
    expect(NOW.toISOString()).toBe("2026-03-10T19:00:00.000Z");
  });
});

describe("completeness guard (FR-2)", () => {
  it("covers every field type in OPERATORS_BY_TYPE with at least one subject", () => {
    const covered = new Set(SUBJECTS.map((s) => s.type));
    expect([...ALL_TYPES].filter((t) => !covered.has(t))).toEqual([]);
  });

  for (const subject of SUBJECTS) {
    it(`${subject.name}: every operator has a fixture case`, () => {
      const missing = operatorValues(subject.type).filter(
        (op) => (subject.cases[op]?.scenarios.length ?? 0) === 0,
      );
      expect(missing, `operators with no fixture case`).toEqual([]);
    });
  }
});

describe("builder output evaluates as its label says (FR-1, FR-3: edited)", () => {
  for (const subject of SUBJECTS) {
    for (const operator of operatorValues(subject.type)) {
      for (const scenario of subject.cases[operator]?.scenarios ?? []) {
        checkCase(
          `${subject.name} › ${operator} › ${scenario.name} › edited`,
          async () => {
            const returned = await idsFor(
              subject.field,
              operator,
              scenario.value,
            );
            expect(returned).toEqual([...scenario.expected].sort());
          },
        );
      }
    }
  }
});

describe("chip right after the operator is chosen, value never edited (FR-3)", () => {
  for (const subject of SUBJECTS) {
    for (const operator of operatorValues(subject.type)) {
      const operatorCase = subject.cases[operator];
      if (!operatorCase) continue;
      const isNoValue = getOperatorOption(subject.type, operator)?.noValue;
      const expected =
        operatorCase.untouchedExpected ??
        (isNoValue ? operatorCase.scenarios[0].expected : undefined);

      it(`${subject.name} › ${operator} › untouched › saves a schema-valid query that evaluates`, async () => {
        const untouched = valueForOperatorChange(subject.type, operator, null);
        const ast = savedAst(subject.field, operator, untouched);
        assertSchemaValid(ast);
        await expect(evaluate(ast, evaluationInput())).resolves.toBeInstanceOf(
          Array,
        );
      });

      if (expected !== undefined) {
        checkCase(
          `${subject.name} › ${operator} › untouched › returns what the input displays`,
          async () => {
            const untouched = valueForOperatorChange(
              subject.type,
              operator,
              null,
            );
            const returned = await idsFor(subject.field, operator, untouched);
            expect(returned).toEqual([...expected].sort());
          },
        );
      }
    }
  }
});

describe("chip whose value was carried over from the previous operator (FR-3)", () => {
  for (const subject of SUBJECTS) {
    const operators = operatorValues(subject.type);
    let carried: FilterChipValue | undefined;
    for (const operator of operators) {
      const isNoValue = getOperatorOption(subject.type, operator)?.noValue;
      const previous = carried;
      if (!isNoValue) {
        carried = subject.cases[operator]?.scenarios[0]?.value ?? carried;
      }
      if (isNoValue || previous === undefined) continue;
      it(`${subject.name} › ${operator} › carried value › saves a schema-valid query that evaluates`, async () => {
        const ast = savedAst(subject.field, operator, previous);
        assertSchemaValid(ast);
        await expect(evaluate(ast, evaluationInput())).resolves.toBeInstanceOf(
          Array,
        );
      });
    }
  }
});

describe("expected-failure list", () => {
  it("names only cases this file generates", () => {
    const stale = [...KNOWN_FAILURES.keys()].filter(
      (title) => !GENERATED_TITLES.has(title),
    );
    expect(stale).toEqual([]);
  });

  it("lists only the 2 resource-ref known failures (F-2, F-3)", () => {
    expect([...KNOWN_FAILURES.keys()].sort()).toEqual(
      [
        "resource-ref › is › typed name Tom › edited",
        "resource-ref › is-not › typed name Tom › edited",
      ].sort(),
    );
  });
});

describe("evaluation time is optional and read only by the relative-date gte (FR-13)", () => {
  const PROBES: QueryAST[] = [
    { op: "eq", field: "num", value: 5 },
    { op: "gte", field: "num", value: 5 },
    { op: "in", field: "multi", value: ["Alpha"] },
    {
      op: "and",
      children: [{ op: "in", field: "multi", value: ["Alpha", "Beta"] }],
    },
    { op: "lt", field: "createdAt", value: "2026-03-10" },
    { op: "contains", field: "txt", value: "beta" },
  ];

  it("omitting it leaves every non-relative-date probe result unchanged", async () => {
    for (const probe of PROBES) {
      const omitted = await evaluate(probe, {
        resources: RESOURCES,
        sidecars: SIDECARS,
        context: CONTEXT,
      });
      const withNow = await evaluate(probe, evaluationInput());
      const withOtherTime = await evaluate(
        probe,
        evaluationInput({ evaluationTime: new Date(1999, 0, 1) }),
      );
      expect(withNow, JSON.stringify(probe)).toEqual(omitted);
      expect(withOtherTime, JSON.stringify(probe)).toEqual(omitted);
    }
  });

  function codeLines(file: string): string[] {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return readFileSync(path.resolve(here, file), "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line));
  }

  it("query-evaluator.ts mentions it twice in code: the declaration and the one read defaulting to now", () => {
    const hits = codeLines("../../src/lib/models/query-evaluator.ts").filter(
      (line) => line.includes("evaluationTime"),
    );
    expect(hits).toEqual([
      "  evaluationTime?: Date;",
      "  const now = input.evaluationTime ?? new Date();",
    ]);
  });

  it("the evaluate request carries no evaluation time or time zone", () => {
    const files = [
      "../../app/api/project/query/evaluate/route.ts",
      "../../src/store/query-transport-service.ts",
      "../../src/store/transport/native-query-backend.ts",
    ];
    for (const file of files) {
      const text = codeLines(file).join("\n");
      expect(text, file).not.toMatch(/evaluationTime|timeZone|timezone/i);
    }
  });
});

describe("stub and chipToAst agree on node structure with an empty value (FR-9)", () => {
  /** The shape of a node: operators, nesting and field keys, values dropped. */
  function structure(node: QueryAST): unknown {
    switch (node.op) {
      case "and":
      case "or":
        return { op: node.op, children: node.children.map(structure) };
      case "not":
        return { op: "not", child: structure(node.child) };
      case "linksTo":
      case "linkedFrom":
      case "ref":
        return { op: node.op };
      case "param":
        return { op: node.op };
      default:
        return { op: node.op, field: node.field };
    }
  }

  for (const type of ALL_TYPES) {
    for (const operator of operatorValues(type)) {
      it(`${type} › ${operator}`, () => {
        const stub = buildOperatorStub(type, operator, "f");
        expect(stub, "no stub for operator").not.toBeNull();
        const saved = savedAst(chipField("f", type), operator, null);
        expect(structure(saved)).toEqual(structure(stub as QueryAST));
      });
    }
  }
});
