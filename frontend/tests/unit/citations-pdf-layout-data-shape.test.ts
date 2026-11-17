/**
 * Feature 116, Task 43 (FR-12): pins the shape of react-pdf's layout data as
 * `compilePdfCore` reads it.
 *
 * `_INTERNAL__LAYOUT__DATA_` is handed to `Document`'s `onRender` after layout.
 * Its name marks it internal; it is not documented API. The PDF citations pass
 * reads each reference mark's page, and each page's footer and body boxes, from
 * it, so a `@react-pdf/renderer` upgrade that changes the shape must fail here,
 * loudly, rather than silently place a note on the wrong page.
 *
 * What is pinned is what the pass reads: `DOCUMENT > PAGE[] > ... > TEXT`,
 * `box` (`top`, `height`) on every node, `lines[].string` and `lines[].runs[]`
 * (`start`, `end`, `attributes.fontSize`) on `TEXT` nodes, a `fixed` footer
 * with `props.fixed` among the children of a `PAGE`, and the `PAGE` style's
 * padding. Versions: the version under test is the one in `node_modules`; this
 * test says nothing about any other version.
 */
// @vitest-environment node
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import type { DocumentProps } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";

import {
  CompilePDFDocument,
  registerIBMPlexFonts,
} from "../../src/lib/export/CompilePDFDocument";

interface Box {
  top: number;
  height: number;
}

interface Run {
  start: number;
  end: number;
  attributes: { fontSize: number };
}

interface Line {
  string: string;
  runs: Run[];
}

interface LayoutNode {
  type: string;
  box: Box;
  style?: { paddingBottom?: number };
  props?: { fixed?: boolean };
  lines?: Line[];
  children?: LayoutNode[];
}

const FILLER = "The quick brown fox jumps over the lazy dog. ";

async function capture(): Promise<{
  onRenderArgKeys: string[];
  layout: unknown;
}> {
  registerIBMPlexFonts();
  let onRenderArgKeys: string[] = [];
  let layout: unknown;
  const element = React.createElement(CompilePDFDocument, {
    sections: [
      { name: "One", content: FILLER.repeat(120) },
      { name: "Two", content: FILLER.repeat(40) },
    ],
    includeHeaders: true,
    citations: {
      notes: [
        {
          sectionIndex: 0,
          offset: FILLER.length,
          noteNumber: 1,
          runs: [{ text: "Note one." }],
        },
      ],
    },
    notePlacement: new Map([[1, [1]]]),
    onRender: (arg: Record<string, unknown>) => {
      onRenderArgKeys = Object.keys(arg);
      layout = arg._INTERNAL__LAYOUT__DATA_;
    },
  } as never) as React.ReactElement<DocumentProps>;
  await renderToBuffer(element);
  return { onRenderArgKeys, layout };
}

function* walk(node: LayoutNode): Generator<LayoutNode> {
  yield node;
  for (const child of node.children ?? []) yield* walk(child);
}

function isBox(value: unknown): value is Box {
  const box = value as Box | undefined;
  return (
    typeof box?.top === "number" &&
    typeof box.height === "number" &&
    Number.isFinite(box.top) &&
    Number.isFinite(box.height)
  );
}

describe("react-pdf layout data as the citations pass reads it", () => {
  it("onRender is called with _INTERNAL__LAYOUT__DATA_", async () => {
    const { onRenderArgKeys, layout } = await capture();
    expect(onRenderArgKeys).toContain("_INTERNAL__LAYOUT__DATA_");
    expect(typeof layout).toBe("object");
    expect(layout).not.toBeNull();
  });

  it("is a DOCUMENT whose children are PAGE nodes with boxes and padding", async () => {
    const root = (await capture()).layout as LayoutNode;
    expect(root.type).toBe("DOCUMENT");
    expect(Array.isArray(root.children)).toBe(true);
    // Two long sections: more than one page, or the page-finding is not exercised.
    expect(root.children?.length).toBeGreaterThan(1);
    for (const page of root.children ?? []) {
      expect(page.type).toBe("PAGE");
      expect(isBox(page.box)).toBe(true);
      expect(typeof page.style?.paddingBottom).toBe("number");
      expect(Array.isArray(page.children)).toBe(true);
    }
  });

  it("every VIEW and TEXT node below a PAGE has a box; other node types are not read", async () => {
    const root = (await capture()).layout as LayoutNode;
    const typesSeen = new Set<string>();
    for (const page of root.children ?? []) {
      for (const node of walk(page)) {
        expect(typeof node.type).toBe("string");
        typesSeen.add(node.type);
        if (node.type === "VIEW" || node.type === "TEXT") {
          expect(isBox(node.box)).toBe(true);
        }
      }
    }
    // The pass reads only these two node types below a page.
    expect(typesSeen.has("VIEW")).toBe(true);
    expect(typesSeen.has("TEXT")).toBe(true);
  });

  it("TEXT nodes carry lines[].string and lines[].runs[] with start, end and fontSize", async () => {
    const root = (await capture()).layout as LayoutNode;
    const texts = (root.children ?? []).flatMap((page) =>
      [...walk(page)].filter((n) => n.type === "TEXT" && n.lines !== undefined),
    );
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      for (const line of text.lines ?? []) {
        expect(typeof line.string).toBe("string");
        expect(Array.isArray(line.runs)).toBe(true);
        for (const run of line.runs) {
          expect(Number.isInteger(run.start)).toBe(true);
          expect(Number.isInteger(run.end)).toBe(true);
          expect(typeof run.attributes.fontSize).toBe("number");
        }
      }
    }
  });

  it("a reference mark appears as a run of font size 7 holding its number", async () => {
    const root = (await capture()).layout as LayoutNode;
    const marks: string[] = [];
    for (const page of root.children ?? []) {
      for (const node of walk(page)) {
        for (const line of node.lines ?? []) {
          for (const run of line.runs) {
            if (run.attributes.fontSize === 7) {
              marks.push(line.string.slice(run.start, run.end));
            }
          }
        }
      }
    }
    // The mark and the footer's own number mark are both font size 7.
    expect(marks.filter((m) => m === "1").length).toBeGreaterThanOrEqual(1);
  });

  it("the fixed footer is a direct child of its PAGE with props.fixed and a box", async () => {
    const root = (await capture()).layout as LayoutNode;
    for (const page of root.children ?? []) {
      const fixed = (page.children ?? []).filter(
        (child) => child.props?.fixed === true,
      );
      expect(fixed).toHaveLength(1);
      expect(isBox(fixed[0].box)).toBe(true);
    }
  });
});
