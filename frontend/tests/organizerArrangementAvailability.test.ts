import { describe, it, expect } from "vitest";
import {
  getArrangementAvailability,
  type ArrangementAvailabilityInputs,
} from "../components/WorkArea/Views/OrganizerView/organizerArrangementAvailability";
import type { OrganizerArrangement } from "../src/lib/models/organizer-grid-types";

const arrangement = (
  over: Partial<OrganizerArrangement> = {},
): OrganizerArrangement => ({
  id: "a1",
  name: "Board",
  source: { kind: "folder", folderId: "f1", scope: "children" },
  rows: { kind: "status" },
  columns: { kind: "field", key: "mood" },
  ...over,
});

const inputs = (
  over: Partial<ArrangementAvailabilityInputs> = {},
): ArrangementAvailabilityInputs => ({
  folders: { state: "loaded", ids: ["f1"] },
  queries: { state: "loaded", ids: ["q1"] },
  schema: {
    state: "loaded",
    fields: [
      { key: "mood", type: "select" },
      { key: "notes", type: "text" },
      { key: "old", type: "select", deprecated: true },
    ],
  },
  ...over,
});

describe("getArrangementAvailability", () => {
  it("returns available when source and fields exist", () => {
    expect(getArrangementAvailability(arrangement(), inputs())).toEqual({
      status: "available",
    });
  });

  it("is available with none, order, status, subtype axes and a smart folder", () => {
    const a = arrangement({
      source: { kind: "smart-folder", queryId: "q1" },
      rows: "none",
      columns: "order",
    });
    expect(getArrangementAvailability(a, inputs()).status).toBe("available");
    const b = arrangement({ rows: { kind: "subtype" } });
    expect(getArrangementAvailability(b, inputs()).status).toBe("available");
  });

  it("reports a missing folder", () => {
    const r = getArrangementAvailability(
      arrangement(),
      inputs({ folders: { state: "loaded", ids: [] } }),
    );
    expect(r).toMatchObject({
      status: "unavailable",
      reason: "folder-missing",
    });
  });

  it("reports a missing query", () => {
    const r = getArrangementAvailability(
      arrangement({ source: { kind: "smart-folder", queryId: "gone" } }),
      inputs(),
    );
    expect(r).toMatchObject({ status: "unavailable", reason: "query-missing" });
  });

  it("reports a missing field, on rows and on columns", () => {
    const cols = getArrangementAvailability(
      arrangement({ columns: { kind: "field", key: "nope" } }),
      inputs(),
    );
    const rows = getArrangementAvailability(
      arrangement({ rows: { kind: "field", key: "nope" } }),
      inputs(),
    );
    expect(cols).toMatchObject({ reason: "field-missing" });
    expect(rows).toMatchObject({ reason: "field-missing" });
  });

  it("reports a field whose type is no longer an axis type, and a deprecated one", () => {
    const text = getArrangementAvailability(
      arrangement({ rows: { kind: "field", key: "notes" } }),
      inputs(),
    );
    const dep = getArrangementAvailability(
      arrangement({ rows: { kind: "field", key: "old" } }),
      inputs(),
    );
    expect(text).toMatchObject({ reason: "field-not-axis-type" });
    expect(dep).toMatchObject({ reason: "field-not-axis-type" });
  });

  it("gives each reason a distinct non-empty message", () => {
    const msgs = [
      getArrangementAvailability(
        arrangement(),
        inputs({ folders: { state: "loaded", ids: [] } }),
      ),
      getArrangementAvailability(
        arrangement({ source: { kind: "smart-folder", queryId: "x" } }),
        inputs(),
      ),
      getArrangementAvailability(
        arrangement({ rows: { kind: "field", key: "nope" } }),
        inputs(),
      ),
      getArrangementAvailability(
        arrangement({ rows: { kind: "field", key: "notes" } }),
        inputs(),
      ),
    ].map((r) => (r.status === "unavailable" ? r.message : ""));
    expect(msgs.every((m) => m.length > 0)).toBe(true);
    expect(new Set(msgs).size).toBe(4);
  });

  it("echoes no stored key in the message", () => {
    const r = getArrangementAvailability(
      arrangement({ rows: { kind: "field", key: "SECRET-KEY" } }),
      inputs(),
    );
    expect(r.status === "unavailable" && r.message).not.toContain("SECRET-KEY");
  });

  const loading: Array<[string, Partial<ArrangementAvailabilityInputs>]> = [
    ["folders", { folders: { state: "loading" } }],
    ["queries", { queries: { state: "loading" } }],
    ["schema", { schema: { state: "loading" } }],
  ];
  it.each(loading)(
    "is pending, never unavailable, while %s load",
    (_n, over) => {
      const broken = arrangement({
        source: { kind: "folder", folderId: "gone", scope: "children" },
        rows: { kind: "field", key: "nope" },
      });
      expect(getArrangementAvailability(broken, inputs(over))).toEqual({
        status: "pending",
      });
      expect(getArrangementAvailability(arrangement(), inputs(over))).toEqual({
        status: "pending",
      });
    },
  );

  it("does not mutate its inputs", () => {
    const a = arrangement();
    const i = inputs();
    const aCopy = JSON.stringify(a);
    const iCopy = JSON.stringify(i);
    getArrangementAvailability(a, i);
    expect(JSON.stringify(a)).toBe(aCopy);
    expect(JSON.stringify(i)).toBe(iCopy);
  });
});
