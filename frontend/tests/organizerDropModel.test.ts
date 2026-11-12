import { describe, it, expect } from "vitest";
import {
  planOrganizerDrop,
  type OrganizerDropInput,
  type OrganizerDropPlan,
} from "../components/WorkArea/Views/OrganizerView/organizerDropModel";
import type {
  OrganizerAxis,
  OrganizerAxisValue,
  OrganizerAxisValueList,
} from "../src/lib/models/organizer-grid-types";
import type {
  MetadataField,
  MetadataValue,
  ResourceRef,
} from "../src/lib/models/types";

const line = (
  key: string,
  value: MetadataValue,
  isDropTarget = true,
): OrganizerAxisValue => ({
  key,
  kind: "value",
  label: key,
  isDropTarget,
  value,
});
const OTHER: OrganizerAxisValue = {
  key: "other",
  kind: "other",
  label: "Other values",
  isDropTarget: false,
};
const NONE: OrganizerAxisValue = {
  key: "none",
  kind: "none",
  label: "None",
  isDropTarget: true,
};
const list = (
  axis: OrganizerAxis,
  values: OrganizerAxisValue[],
): OrganizerAxisValueList => ({ axis, values: [...values, OTHER, NONE] });

const stringLines = (...vs: string[]): OrganizerAxisValue[] =>
  vs.map((v) => line(v, v));

const fields: MetadataField[] = [
  { key: "status", label: "Status", type: "select", locked: true },
  { key: "mood", label: "Mood", type: "select", options: ["calm", "tense"] },
  {
    key: "tags",
    label: "Tags",
    type: "multiselect",
    options: ["a", "b", "c", "d"],
  },
  { key: "pov", label: "POV", type: "resource-ref", multiple: false },
  { key: "allies", label: "Allies", type: "multi-resource-ref" },
  { key: "pair", label: "Pair", type: "multi-resource-ref", maxSelections: 2 },
  {
    key: "scoped",
    label: "Scoped",
    type: "select",
    options: ["x", "y"],
    appliesTo: ["Villain"],
  },
  {
    key: "storyDate",
    label: "Story date",
    type: "select",
    locked: true,
    options: ["x"],
  },
  { key: "plain", label: "Plain", type: "text" },
];

const ref = (id: string | null, name: string): ResourceRef =>
  ({ id, name }) as ResourceRef;

const EMPTY: OrganizerAxisValueList = { axis: "none", values: [NONE] };

const base = (over: Partial<OrganizerDropInput>): OrganizerDropInput => ({
  card: { id: "r1", kind: "resource" },
  from: { rowKey: "none", columnKey: "none" },
  to: { rowKey: "none", columnKey: "none" },
  rows: EMPTY,
  columns: EMPTY,
  fields,
  statuses: ["Draft", "Final"],
  subtypes: ["Villain", "Hero"],
  ...over,
});

const expectWrite = (plan: OrganizerDropPlan) => {
  if (plan.kind !== "write")
    throw new Error(`expected write, got ${plan.kind}`);
  return plan.input;
};
const expectRefused = (plan: OrganizerDropPlan) => {
  if (plan.kind !== "refused")
    throw new Error(`expected refused, got ${plan.kind}`);
  return plan;
};

const statusAxis = (): OrganizerAxisValueList =>
  list({ kind: "status" }, stringLines("Draft", "Final"));
const moodAxis = (): OrganizerAxisValueList =>
  list({ kind: "field", key: "mood" }, stringLines("calm", "tense"));
const tagsAxis = (): OrganizerAxisValueList =>
  list({ kind: "field", key: "tags" }, stringLines("a", "b", "c", "d"));

describe("planOrganizerDrop: basics", () => {
  it("writes nothing when dropped on the same cell", () => {
    const plan = planOrganizerDrop(
      base({
        rows: statusAxis(),
        columns: moodAxis(),
        from: { rowKey: "Draft", columnKey: "calm" },
        to: { rowKey: "Draft", columnKey: "calm" },
      }),
    );
    expect(plan).toEqual({ kind: "noop" });
  });

  it("writes both fields in one payload for a drop across both axes", () => {
    const plan = planOrganizerDrop(
      base({
        card: { id: "r1", kind: "resource", userMetadata: { status: "Draft" } },
        rows: statusAxis(),
        columns: moodAxis(),
        from: { rowKey: "Draft", columnKey: "none" },
        to: { rowKey: "Final", columnKey: "tense" },
      }),
    );
    expect(expectWrite(plan)).toEqual({
      resourceId: "r1",
      changes: [
        { target: { kind: "status" }, op: "set", value: "Final" },
        { target: { kind: "field", key: "mood" }, op: "set", value: "tense" },
      ],
    });
  });

  it("writes only the axis that changed", () => {
    const plan = planOrganizerDrop(
      base({
        rows: statusAxis(),
        columns: moodAxis(),
        from: { rowKey: "Draft", columnKey: "calm" },
        to: { rowKey: "Final", columnKey: "calm" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "status" }, op: "set", value: "Final" },
    ]);
  });

  it("writes nothing for a drop that changes only a none or order axis", () => {
    const plan = planOrganizerDrop(
      base({
        rows: statusAxis(),
        columns: { axis: "order", values: [NONE] },
        from: { rowKey: "Draft", columnKey: "x" },
        to: { rowKey: "Draft", columnKey: "y" },
      }),
    );
    expect(plan).toEqual({ kind: "noop" });
  });
});

describe("planOrganizerDrop: None clears", () => {
  it("status onto None clears the status", () => {
    const plan = planOrganizerDrop(
      base({
        rows: statusAxis(),
        from: { rowKey: "Draft", columnKey: "none" },
        to: { rowKey: "none", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "status" }, op: "clear" },
    ]);
  });

  it("subtype onto None clears the subtype", () => {
    const plan = planOrganizerDrop(
      base({
        columns: list({ kind: "subtype" }, stringLines("Villain", "Hero")),
        from: { rowKey: "none", columnKey: "Villain" },
        to: { rowKey: "none", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "subtype" }, op: "clear" },
    ]);
  });

  it("a select field onto None clears it", () => {
    const plan = planOrganizerDrop(
      base({
        rows: moodAxis(),
        from: { rowKey: "calm", columnKey: "none" },
        to: { rowKey: "none", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "field", key: "mood" }, op: "clear" },
    ]);
  });
});

describe("planOrganizerDrop: multiselect", () => {
  it("moves only the dragged-from value and keeps list order", () => {
    // Card holds b and c; dragged from b to a: holds a and c, in list order.
    const plan = planOrganizerDrop(
      base({
        card: {
          id: "r1",
          kind: "resource",
          userMetadata: { tags: ["c", "b"] },
        },
        rows: tagsAxis(),
        from: { rowKey: "b", columnKey: "none" },
        to: { rowKey: "a", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "field", key: "tags" }, op: "set", value: ["a", "c"] },
    ]);
  });

  it("from a cell onto None removes only that value", () => {
    const plan = planOrganizerDrop(
      base({
        card: {
          id: "r1",
          kind: "resource",
          userMetadata: { tags: ["a", "b"] },
        },
        rows: tagsAxis(),
        from: { rowKey: "a", columnKey: "none" },
        to: { rowKey: "none", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "field", key: "tags" }, op: "set", value: ["b"] },
    ]);
  });

  it("from a cell onto None clears the key when none remain", () => {
    const plan = planOrganizerDrop(
      base({
        card: { id: "r1", kind: "resource", userMetadata: { tags: ["a"] } },
        rows: tagsAxis(),
        from: { rowKey: "a", columnKey: "none" },
        to: { rowKey: "none", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "field", key: "tags" }, op: "clear" },
    ]);
  });

  it("from None adds the value and keeps list order", () => {
    const plan = planOrganizerDrop(
      base({
        card: { id: "r1", kind: "resource", userMetadata: { tags: ["c"] } },
        rows: tagsAxis(),
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "b", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "field", key: "tags" }, op: "set", value: ["b", "c"] },
    ]);
  });

  it("onto a cell already held is a no-op", () => {
    const plan = planOrganizerDrop(
      base({
        card: {
          id: "r1",
          kind: "resource",
          userMetadata: { tags: ["a", "b"] },
        },
        rows: tagsAxis(),
        from: { rowKey: "a", columnKey: "none" },
        to: { rowKey: "b", columnKey: "none" },
      }),
    );
    expect(plan).toEqual({ kind: "noop" });
  });

  it("dragging out of Other values removes the values outside the list", () => {
    const plan = planOrganizerDrop(
      base({
        card: {
          id: "r1",
          kind: "resource",
          userMetadata: { tags: ["stale", "a"] },
        },
        rows: tagsAxis(),
        from: { rowKey: "other", columnKey: "none" },
        to: { rowKey: "c", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "field", key: "tags" }, op: "set", value: ["a", "c"] },
    ]);
  });
});

describe("planOrganizerDrop: references", () => {
  const ana = ref("id-a", "Ana");
  const ben = ref("id-b", "Ben");
  const cat = ref("id-c", "Cat");
  const refAxis = (key: string): OrganizerAxisValueList =>
    list({ kind: "field", key }, [
      line("id-a", ana),
      line("id-b", ben),
      line("id-c", cat),
      line("null:Gone", ref(null, "Gone"), false),
    ]);

  it("a single reference drop writes { id, name }", () => {
    const plan = planOrganizerDrop(
      base({
        rows: refAxis("pov"),
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "id-b", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "field", key: "pov" }, op: "set", value: ben },
    ]);
  });

  it("a multi-reference drop moves only the dragged-from reference", () => {
    const plan = planOrganizerDrop(
      base({
        card: {
          id: "r1",
          kind: "resource",
          userMetadata: { allies: [ana, ben] },
        },
        rows: refAxis("allies"),
        from: { rowKey: "id-a", columnKey: "none" },
        to: { rowKey: "id-c", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      {
        target: { kind: "field", key: "allies" },
        op: "set",
        value: [ben, cat],
      },
    ]);
  });

  it("refuses past maxSelections", () => {
    const plan = planOrganizerDrop(
      base({
        card: {
          id: "r1",
          kind: "resource",
          userMetadata: { pair: [ana, ben] },
        },
        rows: refAxis("pair"),
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "id-c", columnKey: "none" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("max-selections-exceeded");
  });

  it("allows a move that stays at maxSelections", () => {
    const plan = planOrganizerDrop(
      base({
        card: {
          id: "r1",
          kind: "resource",
          userMetadata: { pair: [ana, ben] },
        },
        rows: refAxis("pair"),
        from: { rowKey: "id-a", columnKey: "none" },
        to: { rowKey: "id-c", columnKey: "none" },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "field", key: "pair" }, op: "set", value: [ben, cat] },
    ]);
  });

  it("a reference with a null id is not a drop target", () => {
    const plan = planOrganizerDrop(
      base({
        rows: refAxis("allies"),
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "null:Gone", columnKey: "none" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("value-not-in-list");
  });
});

describe("planOrganizerDrop: refusals", () => {
  it("refuses Other values as a target, with text and no write", () => {
    const plan = expectRefused(
      planOrganizerDrop(
        base({
          rows: moodAxis(),
          from: { rowKey: "calm", columnKey: "none" },
          to: { rowKey: "other", columnKey: "none" },
        }),
      ),
    );
    expect(plan.reason).toBe("value-not-in-list");
    expect(plan.message.length).toBeGreaterThan(0);
  });

  it("refuses a target value missing from the axis", () => {
    const plan = planOrganizerDrop(
      base({
        rows: moodAxis(),
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "ghost", columnKey: "none" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("value-not-in-list");
  });

  it("refuses a select value not in the field's options", () => {
    const rows = list(
      { kind: "field", key: "mood" },
      stringLines("calm", "wild"),
    );
    const plan = planOrganizerDrop(
      base({
        rows,
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "wild", columnKey: "none" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("value-not-in-list");
  });

  it("refuses a status not in config.statuses", () => {
    const rows = list({ kind: "status" }, stringLines("Draft", "Archived"));
    const plan = planOrganizerDrop(
      base({
        rows,
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "Archived", columnKey: "none" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("value-not-in-list");
  });

  it("refuses a field out of the document's subtype scope", () => {
    const rows = list({ kind: "field", key: "scoped" }, stringLines("x", "y"));
    const drop = (subtype?: string) =>
      planOrganizerDrop(
        base({
          card: { id: "r1", kind: "resource", resourceSubtype: subtype },
          rows,
          from: { rowKey: "none", columnKey: "none" },
          to: { rowKey: "x", columnKey: "none" },
        }),
      );
    expect(expectRefused(drop("Hero")).reason).toBe(
      "field-out-of-subtype-scope",
    );
    expect(expectRefused(drop(undefined)).reason).toBe(
      "field-out-of-subtype-scope",
    );
    expect(expectWrite(drop("villain")).changes).toHaveLength(1);
  });

  it("refuses a locked field the sidebar has no control for", () => {
    const rows = list({ kind: "field", key: "storyDate" }, stringLines("x"));
    const plan = planOrganizerDrop(
      base({
        rows,
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "x", columnKey: "none" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("field-locked");
  });

  it("does not refuse the locked status", () => {
    const plan = planOrganizerDrop(
      base({
        rows: statusAxis(),
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "Draft", columnKey: "none" },
      }),
    );
    expect(plan.kind).toBe("write");
  });

  it("refuses a subtype not in config.subtypes", () => {
    const columns = list({ kind: "subtype" }, stringLines("Villain", "Ghost"));
    const plan = planOrganizerDrop(
      base({
        columns,
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "none", columnKey: "Ghost" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("subtype-not-in-list");
  });

  it("writes the project's own spelling of a subtype", () => {
    const columns = list({ kind: "subtype" }, stringLines("  villain "));
    const plan = planOrganizerDrop(
      base({
        columns,
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "none", columnKey: "  villain " },
      }),
    );
    expect(expectWrite(plan).changes).toEqual([
      { target: { kind: "subtype" }, op: "set", value: "Villain" },
    ]);
  });

  it("refuses an axis field missing from the schema", () => {
    const rows = list({ kind: "field", key: "ghost" }, stringLines("x"));
    const plan = planOrganizerDrop(
      base({
        rows,
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "x", columnKey: "none" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("unknown-field");
  });

  it("refuses an axis field of a type that is not an axis type", () => {
    const rows = list({ kind: "field", key: "plain" }, stringLines("x"));
    const plan = planOrganizerDrop(
      base({
        rows,
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "x", columnKey: "none" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("invalid-input");
  });

  it("refuses the same field on both axes", () => {
    const plan = planOrganizerDrop(
      base({
        rows: moodAxis(),
        columns: moodAxis(),
        from: { rowKey: "calm", columnKey: "calm" },
        to: { rowKey: "tense", columnKey: "tense" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("invalid-input");
  });

  it("refuses a status axis drop for a folder card", () => {
    const plan = planOrganizerDrop(
      base({
        card: { id: "f1", kind: "folder" },
        rows: statusAxis(),
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "Draft", columnKey: "none" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("invalid-input");
  });

  it("writes nothing and refuses the whole drop when one axis is refused", () => {
    const plan = planOrganizerDrop(
      base({
        rows: statusAxis(),
        columns: list({ kind: "field", key: "mood" }, stringLines("calm")),
        from: { rowKey: "none", columnKey: "none" },
        to: { rowKey: "Draft", columnKey: "other" },
      }),
    );
    expect(expectRefused(plan).reason).toBe("value-not-in-list");
  });

  it("refusal messages echo no value or label", () => {
    const rows = list({ kind: "field", key: "mood" }, [
      line("SECRET-KEY", "SECRET-VALUE"),
    ]);
    const plan = expectRefused(
      planOrganizerDrop(
        base({
          rows,
          from: { rowKey: "none", columnKey: "none" },
          to: { rowKey: "SECRET-KEY", columnKey: "none" },
        }),
      ),
    );
    expect(plan.message).not.toContain("SECRET");
  });
});

describe("planOrganizerDrop: purity", () => {
  it("does not mutate the card's stored values", () => {
    const tags = ["a", "b"];
    const card = {
      id: "r1",
      kind: "resource" as const,
      userMetadata: { tags },
    };
    planOrganizerDrop(
      base({
        card,
        rows: tagsAxis(),
        from: { rowKey: "a", columnKey: "none" },
        to: { rowKey: "c", columnKey: "none" },
      }),
    );
    expect(tags).toEqual(["a", "b"]);
  });
});
