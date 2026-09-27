/** @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import DataView from "../../components/WorkArea/DataView";
import { computeStatusRollup } from "../../src/lib/status-rollup";
import type { AnyResource } from "../../src/lib/models/types";

let seq = 0;
function res(type: string, extra: Record<string, unknown> = {}): AnyResource {
  seq += 1;
  return {
    id: `r${seq}`,
    name: `R${seq}`,
    type,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  } as unknown as AnyResource;
}
const text = (
  status: unknown,
  words?: number,
  extra: Record<string, unknown> = {},
): AnyResource =>
  res("text", {
    userMetadata: {
      ...(status === undefined ? {} : { status }),
      ...(words === undefined ? {} : { wordCount: words }),
    },
    ...extra,
  });

describe("computeStatusRollup", () => {
  it("orders configured, then unknown, then No status last", () => {
    const rows = computeStatusRollup(
      [text("Done", 5), text("Draft", 10), text("Old", 1), text(undefined, 2)],
      ["Draft", "Done"],
    );
    expect(rows.map((r) => r.kind)).toEqual([
      "configured",
      "configured",
      "unknown",
      "unset",
    ]);
    expect(rows[0].label).toBe("Draft");
    expect(rows[1].label).toBe("Done");
    expect(rows[3].label).toBe("No status");
    expect(rows.map((r) => [r.resourceCount, r.words])).toEqual([
      [1, 10],
      [1, 5],
      [1, 1],
      [1, 2],
    ]);
  });

  it("labels unknown values as not in the current list, as text", () => {
    const rows = computeStatusRollup([text("Old", 1)], ["Draft"]);
    const unknown = rows.find((r) => r.kind === "unknown");
    expect(unknown?.label).toContain("Old");
    expect(unknown?.label.toLowerCase()).toContain("not in the current list");
  });

  it("always has an unset row last, at 0 when nothing is unset", () => {
    const rows = computeStatusRollup([text("Draft", 3)], ["Draft"]);
    expect(rows[rows.length - 1]).toEqual({
      label: "No status",
      kind: "unset",
      resourceCount: 0,
      words: 0,
    });
  });

  it("treats absent or non-string status as unset", () => {
    const rows = computeStatusRollup(
      [text(undefined, 1), text(42, 2), text(null, 4), res("text")],
      ["Draft"],
    );
    const unset = rows[rows.length - 1];
    expect(unset.kind).toBe("unset");
    expect(unset.resourceCount).toBe(4);
    expect(unset.words).toBe(7);
  });

  it("ignores resource.statuses", () => {
    const rows = computeStatusRollup(
      [res("text", { statuses: ["Draft"], wordCount: 9 })],
      ["Draft"],
    );
    expect(rows[0]).toMatchObject({ label: "Draft", resourceCount: 0 });
    expect(rows[1]).toMatchObject({
      kind: "unset",
      resourceCount: 1,
      words: 9,
    });
  });

  it("uses userMetadata.wordCount ?? wordCount ?? 0", () => {
    const rows = computeStatusRollup(
      [
        text("Draft", 10, { wordCount: 99 }),
        text("Draft", undefined, { wordCount: 7 }),
        text("Draft"),
      ],
      ["Draft"],
    );
    expect(rows[0]).toMatchObject({ resourceCount: 3, words: 17 });
  });

  it("excludes non-text resources from count and words", () => {
    const rows = computeStatusRollup(
      [
        text("Draft", 5),
        res("image", { userMetadata: { status: "Draft", wordCount: 100 } }),
        res("audio", { wordCount: 100 }),
        res("folder", { userMetadata: { status: "Draft" } }),
      ],
      ["Draft"],
    );
    expect(rows[0]).toMatchObject({ resourceCount: 1, words: 5 });
    expect(rows[1]).toMatchObject({ kind: "unset", resourceCount: 0 });
  });

  it("with empty statuses returns only unset plus unknown rows", () => {
    const rows = computeStatusRollup([text("X", 1), text(undefined, 2)], []);
    expect(rows.map((r) => r.kind)).toEqual(["unknown", "unset"]);
  });

  it("with no resources returns configured rows and unset at 0/0", () => {
    const rows = computeStatusRollup([], ["A", "B"]);
    expect(rows.map((r) => [r.label, r.resourceCount, r.words])).toEqual([
      ["A", 0, 0],
      ["B", 0, 0],
      ["No status", 0, 0],
    ]);
  });

  it("row counts sum to the number of text resources", () => {
    const rs = [
      text("A", 1),
      text("Z", 1),
      text(undefined, 1),
      res("image"),
      res("folder"),
    ];
    const rows = computeStatusRollup(rs, ["A", "B"]);
    expect(rows.reduce((n, r) => n + r.resourceCount, 0)).toBe(3);
  });

  it("word source matches DataView's Overview total on the same fixtures", () => {
    const rs = [
      text("A", 10, { wordCount: 99 }),
      text("A", undefined, { wordCount: 7 }),
      text("A"),
    ];
    const rollupWords = computeStatusRollup(rs, ["A"]).reduce(
      (n, r) => n + r.words,
      0,
    );
    const { container } = render(
      React.createElement(DataView, { resources: rs }),
    );
    expect(rollupWords).toBe(17);
    expect(container.textContent).toContain(String(rollupWords));
  });
});
