/**
 * Feature 120, Task 12: the pure document cut (FR-3, text half). Each test
 * pins one clause of the task's "Done when". Validity is checked against the
 * real editor schema (`baseSchemaExtensions` plus `CustomHeading`), so "two
 * valid documents" means ProseMirror accepts both.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { getSchema } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import CustomHeading from "../../components/Editor/Extensions/CustomHeading";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import {
  cutDocument,
  ID_BEARING_NODE_TYPES,
  SPLIT_CUT_FAILURES,
  type SplitCutResult,
} from "../../src/lib/models/split-cut";
import type { TipTapDocument, TipTapNode } from "../../src/lib/models/types";

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const schema: Schema = getSchema([
  ...baseSchemaExtensions,
  CustomHeading.configure({}),
]);

type Cut = Extract<SplitCutResult, { outcome: "cut" }>;

// ---------- builders ----------
function text(value: string, marks?: TipTapNode["marks"]): TipTapNode {
  return marks
    ? { type: "text", text: value, marks }
    : { type: "text", text: value };
}
function para(value: string, id?: string): TipTapNode {
  return {
    type: "paragraph",
    ...(id ? { attrs: { id } } : {}),
    content: value === "" ? [] : [text(value)],
  };
}
function heading(value: string, id?: string, level = 2): TipTapNode {
  return {
    type: "heading",
    attrs: { level, ...(id ? { id } : {}) },
    content: [text(value)],
  };
}
function quote(children: TipTapNode[], id?: string): TipTapNode {
  return {
    type: "blockquote",
    ...(id ? { attrs: { id } } : {}),
    content: children,
  };
}
function bullets(items: TipTapNode[][]): TipTapNode {
  return {
    type: "bulletList",
    content: items.map((content) => ({ type: "listItem", content })),
  };
}
function code(value: string, id?: string): TipTapNode {
  return {
    type: "codeBlock",
    ...(id ? { attrs: { id } } : {}),
    content: [text(value)],
  };
}
function table(
  cells: string[][],
  id?: string,
  cellId?: (r: number, c: number) => string,
): TipTapNode {
  return {
    type: "table",
    ...(id ? { attrs: { id } } : {}),
    content: cells.map((row, r) => ({
      type: "tableRow",
      content: row.map((cell, c) => ({
        type: "tableCell",
        content: [para(cell, cellId?.(r, c))],
      })),
    })),
  };
}
const image: TipTapNode = { type: "image", attrs: { src: "a.png" } };
function doc(...content: TipTapNode[]): TipTapDocument {
  return { type: "doc", content };
}

// ---------- helpers ----------
/** Same text walk as `tiptapToPlainText`, kept local so the oracle is independent. */
function plain(d: TipTapDocument): string {
  const walk = (n: TipTapNode): string => {
    let out = n.text ?? "";
    for (const c of n.content ?? []) out += walk(c);
    if (n.type === "paragraph" || n.type === "heading") out += "\n";
    return out;
  };
  return d.content.map(walk).join("").replace(/\n+$/g, "");
}
function noNewlines(s: string): string {
  return s.replace(/\n/g, "");
}
function cutOk(
  d: TipTapDocument,
  offset: number,
  generateId?: () => string,
): Cut {
  const result = cutDocument(
    d,
    offset,
    generateId ? { generateId } : undefined,
  );
  if (result.outcome !== "cut")
    throw new Error(`expected a cut, got ${result.reason}`);
  return result;
}
function assertValid(d: TipTapDocument): void {
  expect(d.type).toBe("doc");
  expect(d.content.length).toBeGreaterThan(0);
  // `check()` throws RangeError on content the schema rejects.
  expect(() => schema.nodeFromJSON(d).check()).not.toThrow();
}
function collectIds(
  n: TipTapNode | TipTapDocument,
  out: string[] = [],
): string[] {
  const id = (n as TipTapNode).attrs?.id;
  if (typeof id === "string") out.push(id);
  for (const c of n.content ?? []) collectIds(c, out);
  return out;
}
function collectIdBearing(
  n: TipTapNode | TipTapDocument,
  out: TipTapNode[] = [],
): TipTapNode[] {
  if (
    (ID_BEARING_NODE_TYPES as readonly string[]).includes(
      (n as TipTapNode).type,
    )
  ) {
    out.push(n as TipTapNode);
  }
  for (const c of n.content ?? []) collectIdBearing(c, out);
  return out;
}
function counterSource(prefix = "n"): () => string {
  let i = 0;
  return () => `${prefix}${++i}`;
}
/** Both halves valid, text conserved (newlines aside), PM cut position agrees. */
function assertConserved(d: TipTapDocument, offset: number, result: Cut): void {
  assertValid(result.first);
  assertValid(result.second);
  expect(
    noNewlines(plain(result.first)) + noNewlines(plain(result.second)),
  ).toBe(noNewlines(plain(d)));
  const pm = schema.nodeFromJSON(d);
  expect(pm.cut(0, result.cutPosition).textContent).toBe(
    schema.nodeFromJSON(result.first).textContent,
  );
  expect(pm.cut(result.cutPosition).textContent).toBe(
    schema.nodeFromJSON(result.second).textContent,
  );
  expect(plain(result.first)).toBe(
    plain(d).slice(0, offset).replace(/\n+$/g, ""),
  );
}

describe("cut inside text", () => {
  it("a paragraph: halves hold the text with nothing lost or duplicated", () => {
    const d = doc(para("Hello world there", "p1"));
    const r = cutOk(d, 9);
    expect(plain(r.first)).toBe("Hello wor");
    expect(plain(r.second)).toBe("ld there");
    expect(r.cutPosition).toBe(10);
    assertConserved(d, 9, r);
  });

  it("a heading keeps its level in both halves", () => {
    const d = doc(heading("Heading", "h1", 3));
    const r = cutOk(d, 4);
    expect(plain(r.first)).toBe("Head");
    expect(plain(r.second)).toBe("ing");
    expect(r.first.content[0].attrs?.level).toBe(3);
    expect(r.second.content[0].attrs?.level).toBe(3);
    assertConserved(d, 4, r);
  });

  it("a blockquote keeps its wrapper in both halves", () => {
    const d = doc(
      quote([para("quote one", "a"), para("quote two", "b")], "q"),
      para("tail", "t"),
    );
    const r = cutOk(d, 3);
    expect(plain(r.first)).toBe("quo");
    expect(plain(r.second)).toBe("te one\nquote two\ntail");
    expect(r.first.content[0].type).toBe("blockquote");
    expect(r.second.content[0].type).toBe("blockquote");
    assertConserved(d, 3, r);
  });

  it("a list item keeps its list and item wrappers in both halves", () => {
    const d = doc(
      bullets([[para("one")], [para("two")], [para("three")]]),
      para("after"),
    );
    const r = cutOk(d, 6); // "one\ntw|o"
    expect(plain(r.first)).toBe("one\ntw");
    expect(plain(r.second)).toBe("o\nthree\nafter");
    expect(r.first.content[0].type).toBe("bulletList");
    expect(r.second.content[0].type).toBe("bulletList");
    assertConserved(d, 6, r);
  });

  it("a nested list moves wholly to the second half when the parent item is cut", () => {
    const d = doc(bullets([[para("parent"), bullets([[para("child")]])]]));
    const r = cutOk(d, 3);
    expect(plain(r.first)).toBe("par");
    expect(plain(r.second)).toBe("ent\nchild");
    assertConserved(d, 3, r);
  });

  it("splits a text run inside inline marks, copying them to both parts", () => {
    const d = doc({
      type: "paragraph",
      content: [text("ab"), text("cdef", [{ type: "bold" }]), text("gh")],
    });
    const r = cutOk(d, 4);
    expect(r.first.content[0].content).toEqual([
      text("ab"),
      text("cd", [{ type: "bold" }]),
    ]);
    expect(r.second.content[0].content).toEqual([
      text("ef", [{ type: "bold" }]),
      text("gh"),
    ]);
    assertConserved(d, 4, r);
  });
});

describe("cut at block boundaries and next to an image", () => {
  const d = doc(para("first", "p1"), para("second", "p2"));

  it("at the end of a block and after its line break both give the same two documents", () => {
    const atEnd = cutOk(d, 5);
    const afterBreak = cutOk(d, 6);
    expect(plain(atEnd.first)).toBe("first");
    expect(plain(atEnd.second)).toBe("second");
    expect(atEnd.second.content).toHaveLength(1); // no empty leading paragraph
    expect(atEnd.first.content).toHaveLength(1);
    expect(afterBreak.first).toEqual(atEnd.first);
    expect(afterBreak.cutPosition).toBe(atEnd.cutPosition);
    expect(atEnd.cutPosition).toBe(7);
    assertConserved(d, 5, atEnd);
    assertConserved(d, 6, afterBreak);
  });

  it("with an image after the cut block, the image goes to the second half", () => {
    const withImage = doc(para("before"), image, para("after"));
    for (const offset of [6, 7]) {
      const r = cutOk(withImage, offset);
      assertValid(r.first);
      assertValid(r.second);
      expect(plain(r.first)).toBe("before");
      expect(r.first.content.map((n) => n.type)).toEqual(["paragraph"]);
      expect(r.second.content.map((n) => n.type)).toEqual([
        "image",
        "paragraph",
      ]);
      assertConserved(withImage, offset, r);
    }
  });

  it("a half holding an image and no text is not empty", () => {
    const r = cutOk(doc(para("before"), image), 6);
    expect(r.second.content.map((n) => n.type)).toEqual(["image"]);
    assertValid(r.second);
  });

  it("cuts a list at an item boundary without leaving an empty list in either half", () => {
    const l = doc(bullets([[para("one")], [para("two")]]));
    const r = cutOk(l, 3);
    expect(plain(r.first)).toBe("one");
    expect(plain(r.second)).toBe("two");
    assertConserved(l, 3, r);
  });
});

describe("fresh ids in the second half (Gate 5)", () => {
  const original = doc(
    para("alpha", "idA"),
    heading("Head here", "idB"),
    quote([para("quoted text", "idD")], "idC"),
    code("let x", "idE"),
    table([["a", "b"]], "idF", (r, c) => `idG${r}${c}`),
    para("omega", "idH"),
  );

  it("cutting inside the heading: first keeps its ids, every id-bearing node of the second has a fresh unshared id", () => {
    const r = cutOk(original, 5 + 1 + 4); // "alpha\nHead| here"
    const firstIds = collectIds(r.first);
    const secondIds = collectIds(r.second);
    expect(firstIds).toEqual(["idA", "idB"]);
    expect(new Set(firstIds).size).toBe(firstIds.length);
    const originalIds = collectIds(original);
    for (const id of secondIds) {
      expect(firstIds).not.toContain(id);
      expect(originalIds).not.toContain(id);
    }
    expect(new Set(secondIds).size).toBe(secondIds.length);
    for (const node of collectIdBearing(r.second)) {
      expect(typeof node.attrs?.id).toBe("string");
      expect((node.attrs?.id as string).length).toBeGreaterThan(0);
    }
    assertConserved(original, 10, r);
  });

  it("the id source is an argument: ids are assigned in document order from it", () => {
    const r = cutOk(original, 10, counterSource());
    // second half: heading part, blockquote, its paragraph, codeBlock, table, cell paragraphs x2, paragraph
    expect(collectIds(r.second)).toEqual([
      "n1",
      "n2",
      "n3",
      "n4",
      "n5",
      "n6",
      "n7",
      "n8",
    ]);
    expect(collectIds(r.first)).toEqual(["idA", "idB"]);
    const again = cutOk(original, 10, counterSource());
    expect(again.second).toEqual(r.second);
  });

  it("covers a node that carried no id, and the second part of a split blockquote and its paragraph", () => {
    const d = doc(quote([para("abcdef", "pa"), para("ghi", "pb")], "q"));
    const r = cutOk(d, 3, counterSource());
    expect(collectIds(r.first)).toEqual(["q", "pa"]);
    expect(collectIds(r.second)).toEqual(["n1", "n2", "n3"]);
    const noIds = doc(para("abc"), para("def"));
    const r2 = cutOk(noIds, 1, counterSource());
    expect(collectIds(r2.first)).toEqual([]);
    expect(collectIds(r2.second)).toEqual(["n1", "n2"]);
  });

  it("an image and list wrappers get no id", () => {
    const d = doc(para("a"), image, bullets([[para("b")]]));
    const r = cutOk(d, 1, counterSource());
    const second = r.second;
    expect(second.content[0].type).toBe("image");
    expect(second.content[0].attrs).toEqual({ src: "a.png" });
    expect(second.content[1].attrs).toBeUndefined();
  });

  it("an id source that repeats an id of either half is skipped, never written", () => {
    const seq = ["idA", "idB", "fresh1", "fresh1", "fresh2"];
    let i = 0;
    const r = cutOk(
      doc(para("abcd", "idA"), para("efgh", "idB")),
      2,
      () => seq[i++],
    );
    expect(collectIds(r.first)).toEqual(["idA"]);
    expect(collectIds(r.second)).toEqual(["fresh1", "fresh2"]);
  });

  it("an id source that cannot produce an unused id is a distinct failure with no halves", () => {
    const r = cutDocument(doc(para("abcd", "x"), para("efgh", "y")), 2, {
      generateId: () => "x",
    });
    expect(r).toEqual({
      outcome: "failed",
      reason: SPLIT_CUT_FAILURES.idSourceExhausted,
    });
    expect("first" in r).toBe(false);
  });

  it("the default id source yields distinct v4-style ids", () => {
    const r = cutOk(
      doc(para("abcd", "a"), para("efgh", "b"), para("ijkl", "c")),
      2,
    );
    const ids = collectIds(r.second);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    }
  });

  it("ID_BEARING_NODE_TYPES matches the UniqueID types the editor configures", () => {
    const source = readFileSync(
      path.join(FRONTEND_ROOT, "components/Editor/editorExtensions.ts"),
      "utf8",
    );
    const match = /UniqueID\.configure\(\{\s*types:\s*\[([^\]]*)\]/.exec(
      source,
    );
    expect(match).not.toBeNull();
    const configured = (match?.[1] ?? "")
      .split(",")
      .map((s) => s.trim().replace(/^"|"$/g, ""))
      .filter((s) => s.length > 0);
    expect([...ID_BEARING_NODE_TYPES].sort()).toEqual([...configured].sort());
  });
});

describe("failed outcomes", () => {
  const d = doc(para("hello world"));

  it("an offset it cannot cut is a distinct failure with no halves", () => {
    for (const offset of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 12]) {
      const r = cutDocument(d, offset);
      expect(r).toEqual({
        outcome: "failed",
        reason: SPLIT_CUT_FAILURES.offsetOutOfRange,
      });
      expect("first" in r).toBe(false);
      expect("second" in r).toBe(false);
    }
  });

  it("an empty first half and an empty second half are different failures, never an empty half", () => {
    expect(cutDocument(d, 0)).toEqual({
      outcome: "failed",
      reason: SPLIT_CUT_FAILURES.emptyFirstHalf,
    });
    expect(cutDocument(d, 11)).toEqual({
      outcome: "failed",
      reason: SPLIT_CUT_FAILURES.emptySecondHalf,
    });
    expect(cutDocument(doc(para("  "), para("text")), 2).outcome).toBe(
      "failed",
    );
    expect(cutDocument(doc(para("text"), para("   "), para("")), 4)).toEqual({
      outcome: "failed",
      reason: SPLIT_CUT_FAILURES.emptySecondHalf,
    });
  });

  it("a cut inside a table cell or a code block is refused with its own reason", () => {
    const t = doc(para("x"), table([["cell a", "cell b"]]), para("y"));
    expect(cutDocument(t, 4)).toEqual({
      outcome: "failed",
      reason: SPLIT_CUT_FAILURES.cursorInTableCell,
    });
    const c = doc(para("x"), code("line1\nline2"), para("y"));
    expect(cutDocument(c, 5)).toEqual({
      outcome: "failed",
      reason: SPLIT_CUT_FAILURES.cursorInCodeBlock,
    });
  });

  it("a cut next to a table or a code block, outside it, succeeds", () => {
    const t = doc(para("x"), table([["cell"]]), para("y"));
    const beforeTable = cutOk(t, 1);
    expect(beforeTable.first.content.map((n) => n.type)).toEqual(["paragraph"]);
    expect(beforeTable.second.content.map((n) => n.type)).toEqual([
      "table",
      "paragraph",
    ]);
    assertValid(beforeTable.first);
    assertValid(beforeTable.second);
    const afterCode = doc(code("abc"), para("y"));
    const r = cutOk(afterCode, 3);
    assertValid(r.first);
    assertValid(r.second);
  });
});

describe("purity and marks", () => {
  it("does not modify its input", () => {
    const d = doc(
      quote([para("abcdef", "pa"), para("ghi", "pb")], "q"),
      para("z", "pz"),
    );
    const before = JSON.stringify(d);
    cutOk(d, 3);
    expect(JSON.stringify(d)).toBe(before);
  });

  it("keeps annotation marks as they are in each half, a spanning one in both with one id", () => {
    const a = (id: string) => [{ type: "annotation", attrs: { id } }];
    const d = doc({
      type: "paragraph",
      content: [text("aa "), text("bbcc", a("a1")), text(" dd")],
    });
    const r = cutOk(d, 5);
    expect(r.first.content[0].content).toEqual([
      text("aa "),
      text("bb", a("a1")),
    ]);
    expect(r.second.content[0].content).toEqual([
      text("cc", a("a1")),
      text(" dd"),
    ]);
    assertConserved(d, 5, r);
  });

  it("the first half's stored text is exactly the text before the offset at every offset", () => {
    const d = doc(
      para("one two"),
      heading("three", "h"),
      bullets([[para("four")], [para("five")]]),
      para("six"),
    );
    const full = plain(d);
    for (let offset = 1; offset < full.length; offset++) {
      const r = cutDocument(d, offset);
      if (r.outcome !== "cut") continue;
      assertConserved(d, offset, r);
    }
  });
});
