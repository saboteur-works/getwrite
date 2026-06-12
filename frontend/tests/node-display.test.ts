import { describe, expect, it } from "vitest";
import {
  BODY_LABEL,
  deriveNodeTypeLabels,
  labelForAncestry,
  nodeTypeLabel,
  type NodeAncestry,
} from "../src/lib/node-display";

/** Build an ancestry chain (outermost → innermost) from terse descriptors. */
function ancestry(
  ...nodes: Array<string | { name: string; level: number }>
): NodeAncestry {
  return nodes.map((n) =>
    typeof n === "string"
      ? { name: n }
      : { name: n.name, attrs: { level: n.level } },
  );
}

describe("nodeTypeLabel", () => {
  it("maps a paragraph to Body", () => {
    expect(nodeTypeLabel("paragraph")).toBe(BODY_LABEL);
  });

  it("includes the level for each heading 1 through 6", () => {
    for (let level = 1; level <= 6; level++) {
      expect(nodeTypeLabel("heading", { level })).toBe(`Heading ${level}`);
    }
  });

  it("falls back to a bare Heading label when no level is present", () => {
    expect(nodeTypeLabel("heading")).toBe("Heading");
    expect(nodeTypeLabel("heading", { level: null })).toBe("Heading");
  });

  it("maps each recognized container to its label", () => {
    expect(nodeTypeLabel("bulletList")).toBe("Bullet List");
    expect(nodeTypeLabel("orderedList")).toBe("Ordered List");
    expect(nodeTypeLabel("blockquote")).toBe("Blockquote");
    expect(nodeTypeLabel("codeBlock")).toBe("Code Block");
  });

  it("returns null for structural nodes the indicator does not name", () => {
    expect(nodeTypeLabel("doc")).toBeNull();
    expect(nodeTypeLabel("text")).toBeNull();
    expect(nodeTypeLabel("listItem")).toBeNull();
  });
});

describe("labelForAncestry", () => {
  it("labels a top-level paragraph as Body", () => {
    expect(labelForAncestry(ancestry("doc", "paragraph"))).toBe(BODY_LABEL);
  });

  it("labels a heading with its level", () => {
    expect(
      labelForAncestry(ancestry("doc", { name: "heading", level: 2 })),
    ).toBe("Heading 2");
  });

  it("prefers the enclosing list over the inner paragraph", () => {
    expect(
      labelForAncestry(ancestry("doc", "bulletList", "listItem", "paragraph")),
    ).toBe("Bullet List");
    expect(
      labelForAncestry(ancestry("doc", "orderedList", "listItem", "paragraph")),
    ).toBe("Ordered List");
  });

  it("prefers the enclosing blockquote over the inner paragraph", () => {
    expect(labelForAncestry(ancestry("doc", "blockquote", "paragraph"))).toBe(
      "Blockquote",
    );
  });

  it("labels a code block directly", () => {
    expect(labelForAncestry(ancestry("doc", "codeBlock"))).toBe("Code Block");
  });

  it("picks the nearest container when several are nested", () => {
    expect(
      labelForAncestry(
        ancestry("doc", "blockquote", "bulletList", "listItem", "paragraph"),
      ),
    ).toBe("Bullet List");
  });

  it("returns null when nothing in the ancestry is recognized", () => {
    expect(labelForAncestry(ancestry("doc", "listItem"))).toBeNull();
    expect(labelForAncestry([])).toBeNull();
  });
});

describe("deriveNodeTypeLabels", () => {
  it("returns a single label for a caret in a heading", () => {
    expect(
      deriveNodeTypeLabels([ancestry("doc", { name: "heading", level: 2 })]),
    ).toEqual(["Heading 2"]);
  });

  it("returns a single label for a caret in a paragraph", () => {
    expect(deriveNodeTypeLabels([ancestry("doc", "paragraph")])).toEqual([
      BODY_LABEL,
    ]);
  });

  it("lists each distinct type, in document order, for a spanning selection", () => {
    expect(
      deriveNodeTypeLabels([
        ancestry("doc", { name: "heading", level: 2 }),
        ancestry("doc", "paragraph"),
      ]),
    ).toEqual(["Heading 2", "Body"]);
  });

  it("collapses repeated types (two list items stay one label)", () => {
    expect(
      deriveNodeTypeLabels([
        ancestry("doc", "bulletList", "listItem", "paragraph"),
        ancestry("doc", "bulletList", "listItem", "paragraph"),
      ]),
    ).toEqual(["Bullet List"]);
  });

  it("skips blocks that resolve to no recognized label", () => {
    expect(
      deriveNodeTypeLabels([
        ancestry("doc", "listItem"),
        ancestry("doc", "paragraph"),
      ]),
    ).toEqual([BODY_LABEL]);
  });

  it("returns an empty list for an empty selection / no document", () => {
    expect(deriveNodeTypeLabels([])).toEqual([]);
  });
});
