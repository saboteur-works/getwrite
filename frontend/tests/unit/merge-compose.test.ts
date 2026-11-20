/**
 * Feature 121, Task 18 (FR-3): tree order of the absorbed documents and the
 * pure composition of the merged text. Ids are issued from a counter so every
 * test is deterministic.
 */
import { describe, expect, it } from "vitest";
import {
  composeMergedDocument,
  orderAbsorbedDocuments,
  type MergeComposeInput,
} from "../../src/lib/models/merge-compose";
import { MERGE_REFUSAL_REASONS } from "../../src/lib/models/merge-types";
import type {
  AnyResource,
  Folder,
  TextResource,
  TipTapDocument,
  TipTapNode,
} from "../../src/lib/models/types";

function counter(prefix = "new"): () => string {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

function text(
  id: string,
  folderId: string | null,
  orderIndex: number,
): TextResource {
  return {
    id,
    slug: id,
    name: id,
    type: "text",
    folderId,
    orderIndex,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function folder(
  id: string,
  parentId: string | null,
  orderIndex: number,
): Folder {
  return {
    id,
    slug: id,
    name: id,
    type: "folder",
    parentId,
    orderIndex,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

function para(content: string, id?: string): TipTapNode {
  return {
    type: "paragraph",
    ...(id ? { attrs: { id } } : {}),
    ...(content ? { content: [{ type: "text", text: content }] } : {}),
  };
}

function doc(...content: TipTapNode[]): TipTapDocument {
  return { type: "doc", content };
}

function composeOk(
  input: MergeComposeInput,
  next: () => string = counter(),
): TipTapDocument {
  const result = composeMergedDocument(input, { generateId: next });
  if (result.outcome !== "composed") throw new Error("expected composed");
  return result.document;
}

function idsOf(nodes: readonly TipTapNode[]): string[] {
  const out: string[] = [];
  const walk = (n: TipTapNode): void => {
    if (typeof n.attrs?.id === "string") out.push(n.attrs.id);
    (n.content ?? []).forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

function firstTexts(d: TipTapDocument): string[] {
  return d.content.map((n) => n.content?.[0]?.text ?? "");
}

describe("orderAbsorbedDocuments", () => {
  const all: AnyResource[] = [
    folder("F1", null, 0),
    text("A1", "F1", 0),
    folder("F1a", "F1", 1),
    text("A2", "F1a", 0),
    text("A3", "F1", 2),
    folder("F2", null, 1),
    text("B1", "F2", 0),
    text("T0", null, 2),
  ];

  it("orders depth-first by folder then orderIndex, whatever the selection order", () => {
    const result = orderAbsorbedDocuments(["T0", "B1", "A3", "A2", "A1"], all);
    expect(result).toEqual({
      outcome: "ordered",
      ids: ["A1", "A2", "A3", "B1", "T0"],
    });
    const again = orderAbsorbedDocuments(["A1", "A3", "T0", "A2", "B1"], all);
    expect(again).toEqual(result);
  });

  it("orders without regard to where the target sits (the target is not an input)", () => {
    // The target (say B1) sits in the middle; A1 absorbed comes before it in the tree.
    const result = orderAbsorbedDocuments(["T0", "A1"], all);
    expect(result).toEqual({ outcome: "ordered", ids: ["A1", "T0"] });
  });

  it("orders siblings by orderIndex and not by array order", () => {
    const shuffled: AnyResource[] = [
      text("x2", null, 5),
      text("x1", null, 1),
      text("x3", null, 9),
    ];
    expect(orderAbsorbedDocuments(["x3", "x1", "x2"], shuffled)).toEqual({
      outcome: "ordered",
      ids: ["x1", "x2", "x3"],
    });
  });

  it("fails, with its own outcome, for an id not in the tree", () => {
    expect(orderAbsorbedDocuments(["A1", "ghost"], all)).toEqual({
      outcome: "failed",
      reason: MERGE_REFUSAL_REASONS.missingDocument,
      documentId: "ghost",
    });
  });

  it("fails for a repeated id and for an id inside a folder cycle", () => {
    expect(orderAbsorbedDocuments(["A1", "A1"], all)).toEqual({
      outcome: "failed",
      reason: MERGE_REFUSAL_REASONS.repeatedId,
      documentId: "A1",
    });
    const cyclic: AnyResource[] = [
      folder("c1", "c2", 0),
      folder("c2", "c1", 0),
      text("inside", "c1", 0),
    ];
    expect(orderAbsorbedDocuments(["inside"], cyclic)).toEqual({
      outcome: "failed",
      reason: MERGE_REFUSAL_REASONS.missingDocument,
      documentId: "inside",
    });
  });
});

describe("composeMergedDocument", () => {
  it("keeps the target's text first and unchanged, with its ids", () => {
    const target = doc(para("one", "t1"), para("two", "t2"));
    const before = JSON.stringify(target);
    const out = composeOk({
      target,
      absorbed: [{ documentId: "a", document: doc(para("three", "a1")) }],
    });
    expect(out.content.slice(0, 2)).toEqual(target.content);
    expect(JSON.stringify(target)).toBe(before);
    expect(out.content[0]).not.toBe(target.content[0]);
  });

  it("puts exactly one empty paragraph at each joint and inserts nothing else", () => {
    const out = composeOk({
      target: doc(para("T", "t1")),
      absorbed: [
        { documentId: "a", document: doc(para("A", "a1")) },
        { documentId: "b", document: doc(para("B", "b1")) },
      ],
    });
    expect(out.content.every((n) => n.type === "paragraph")).toBe(true);
    expect(firstTexts(out)).toEqual(["T", "", "A", "", "B"]);
    expect(out.content[1].content).toBeUndefined();
  });

  it("keeps each text as stored: a double blank where a text already ends or starts with empty paragraphs", () => {
    const out = composeOk({
      target: doc(para("T", "t1"), para("", "t2")),
      absorbed: [
        { documentId: "a", document: doc(para("", "a1"), para("A", "a2")) },
      ],
    });
    expect(firstTexts(out)).toEqual(["T", "", "", "", "A"]);
  });

  it("gives a fully empty absorbed document no joint and no content", () => {
    const cases: TipTapDocument[] = [
      doc(),
      doc(para("   ")),
      doc(para(""), para("")),
      doc(para(" \t"), para("")),
    ];
    for (const empty of cases) {
      const out = composeOk({
        target: doc(para("T", "t1")),
        absorbed: [
          { documentId: "e", document: empty },
          { documentId: "b", document: doc(para("B", "b1")) },
        ],
      });
      expect(firstTexts(out)).toEqual(["T", "", "B"]);
    }
    const onlyEmpty = composeOk({
      target: doc(para("T", "t1")),
      absorbed: [{ documentId: "e", document: doc(para("")) }],
    });
    expect(onlyEmpty.content).toHaveLength(1);
  });

  it("does not treat an image as empty", () => {
    const image: TipTapNode = { type: "image", attrs: { src: "x.png" } };
    const out = composeOk({
      target: doc(para("T", "t1")),
      absorbed: [{ documentId: "a", document: doc(image) }],
    });
    expect(out.content.map((n) => n.type)).toEqual([
      "paragraph",
      "paragraph",
      "image",
    ]);
  });

  it("joins correctly after and before a table, list or code block", () => {
    const table: TipTapNode = {
      type: "table",
      attrs: { id: "tbl" },
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableCell", content: [para("cell", "cellp")] }],
        },
      ],
    };
    const list: TipTapNode = {
      type: "bulletList",
      content: [{ type: "listItem", content: [para("item", "li-p")] }],
    };
    const code: TipTapNode = {
      type: "codeBlock",
      attrs: { id: "cb" },
      content: [{ type: "text", text: "x = 1" }],
    };
    const out = composeOk({
      target: doc(para("T", "t1"), table),
      absorbed: [
        { documentId: "a", document: doc(list, para("mid", "a2"), code) },
        { documentId: "b", document: doc(code) },
      ],
    });
    expect(out.content.map((n) => n.type)).toEqual([
      "paragraph",
      "table",
      "paragraph",
      "bulletList",
      "paragraph",
      "codeBlock",
      "paragraph",
      "codeBlock",
    ]);
    expect(out.content[2].content).toBeUndefined();
    expect(out.content[6].content).toBeUndefined();
  });

  it("assigns a fresh id to every id-bearing appended node, nested ones included, and leaves the target's ids", () => {
    const heading: TipTapNode = {
      type: "heading",
      attrs: { id: "h", level: 2 },
      content: [{ type: "text", text: "H" }],
    };
    const quote: TipTapNode = {
      type: "blockquote",
      attrs: { id: "q" },
      content: [para("quoted", "qp")],
    };
    const table: TipTapNode = {
      type: "table",
      attrs: { id: "tb" },
      content: [
        {
          type: "tableRow",
          content: [{ type: "tableCell", content: [para("c", "cp")] }],
        },
      ],
    };
    const code: TipTapNode = {
      type: "codeBlock",
      attrs: { id: "cb" },
      content: [],
    };
    const absorbedDoc = doc(heading, quote, table, code, para("no id yet"));
    const out = composeOk({
      target: doc(para("T", "t1"), para("U", "t2")),
      absorbed: [{ documentId: "a", document: absorbedDoc }],
    });
    expect(idsOf(out.content.slice(0, 2))).toEqual(["t1", "t2"]);
    const appended = idsOf(out.content.slice(2));
    // joint, heading, blockquote, its paragraph, table, cell paragraph, code block, last paragraph
    expect(appended).toHaveLength(8);
    expect(new Set(appended).size).toBe(8);
    for (const old of ["h", "q", "qp", "tb", "cp", "cb"]) {
      expect(appended).not.toContain(old);
    }
    expect(appended.every((id) => id.startsWith("new-"))).toBe(true);
    expect(idsOf(absorbedDoc.content)).toEqual([
      "h",
      "q",
      "qp",
      "tb",
      "cp",
      "cb",
    ]);
  });

  it("makes appended ids disjoint when the documents share ids with each other and the target", () => {
    const shared = (): TipTapDocument => doc(para("x", "same"));
    const out = composeOk({
      target: shared(),
      absorbed: [
        { documentId: "a", document: shared() },
        { documentId: "b", document: shared() },
      ],
    });
    const ids = idsOf(out.content);
    expect(ids[0]).toBe("same");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is deterministic through the id source", () => {
    const input: MergeComposeInput = {
      target: doc(para("T", "t1")),
      absorbed: [{ documentId: "a", document: doc(para("A", "a1")) }],
    };
    expect(composeOk(input, counter("k"))).toEqual(
      composeOk(input, counter("k")),
    );
  });

  it("asks the id source again for an id already in use", () => {
    const ids = ["t1", "fresh-a", "fresh-b"];
    let i = 0;
    const out = composeOk(
      {
        target: doc(para("T", "t1")),
        absorbed: [{ documentId: "a", document: doc(para("A", "a1")) }],
      },
      () => ids[i++],
    );
    expect(idsOf(out.content)).toEqual(["t1", "fresh-a", "fresh-b"]);
  });

  it("returns a distinct failed outcome when the id source cannot give an unused id", () => {
    const result = composeMergedDocument(
      {
        target: doc(para("T", "t1")),
        absorbed: [{ documentId: "a", document: doc(para("A", "a1")) }],
      },
      { generateId: () => "t1" },
    );
    expect(result).toEqual({
      outcome: "failed",
      reason: "id-source-exhausted",
      documentId: "a",
    });
  });

  it("returns a failed outcome, never an empty document, for a text it cannot compose", () => {
    const bad = { type: "doc", content: "nope" } as unknown as TipTapDocument;
    const badNode = {
      type: "doc",
      content: [{ content: [] }],
    } as unknown as TipTapDocument;
    const badText = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text" }] }],
    } as unknown as TipTapDocument;
    for (const broken of [bad, badNode, badText]) {
      const result = composeMergedDocument(
        {
          target: doc(para("T", "t1")),
          absorbed: [{ documentId: "a", document: broken }],
        },
        { generateId: counter() },
      );
      expect(result).toEqual({
        outcome: "failed",
        reason: "malformed-text",
        documentId: "a",
      });
    }
    expect(
      composeMergedDocument(
        { target: bad, absorbed: [] },
        { generateId: counter() },
      ),
    ).toEqual({
      outcome: "failed",
      reason: "malformed-text",
      documentId: null,
    });
  });

  it("with no absorbed documents returns a copy of the target", () => {
    const target = doc(para("T", "t1"));
    expect(composeOk({ target, absorbed: [] })).toEqual(target);
  });
});
