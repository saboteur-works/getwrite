/**
 * Feature 116, Task 39 (FR-15): the incomplete-citation marker, run through
 * the render pass of Task 38 with the real engine and bundled style.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { initCitationEngine } from "../../src/lib/citations/citation-engine";
import type { CitationRun } from "../../src/lib/citations/citation-engine";
import { loadBundledStyle } from "../../src/lib/citations/style-loader";
import type { StyleLoadOutcome } from "../../src/lib/citations/style-loader";
import { deriveCitationTargetState } from "../../src/lib/models/citation-target-state";
import {
  incompleteMarker,
  renderIncompleteCitation,
  UNNAMED_SOURCE,
} from "../../src/lib/models/citations-incomplete";
import {
  renderCitationPass,
  type CitationRenderResource,
  type CitationSourceInput,
} from "../../src/lib/models/citations-render";
import type { CitationGap } from "../../src/lib/models/citations-types";
import type { Annotation, TipTapDocument } from "../../src/lib/models/types";

const WASM_PATH = path.resolve(
  process.cwd(),
  "src/lib/citations/engine/hayagriva_wasm_bg.wasm",
);

let style: StyleLoadOutcome;

beforeAll(async () => {
  await initCitationEngine(readFileSync(WASM_PATH));
  style = await loadBundledStyle("chicago-notes-bibliography");
});

const joined = (runs: readonly CitationRun[]): string =>
  runs.map((r) => r.text).join("");

function annotation(
  id: string,
  sourceId: string,
  sourceName?: string,
): Annotation {
  return {
    id,
    body: "",
    quote: "the cited passage",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    target: { sourceId, ...(sourceName === undefined ? {} : { sourceName }) },
  };
}

const DOC: TipTapDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "the cited passage",
          marks: [{ type: "annotation", attrs: { id: "a1" } }],
        },
      ],
    },
  ],
};

function pass(
  source: CitationSourceInput,
  savedName?: string,
): ReturnType<typeof renderCitationPass> {
  const resources: CitationRenderResource[] = [
    {
      resourceId: "r1",
      included: true,
      document: DOC,
      annotations: [annotation("a1", "s", savedName)],
    },
  ];
  return renderCitationPass({
    resources,
    sources: { s: source },
    excerptAnnotationsBySource: {},
    style,
    renderIncomplete: renderIncompleteCitation,
  });
}

function onlyCitation(result: ReturnType<typeof renderCitationPass>) {
  if (result.status !== "ok") throw new Error(result.message);
  expect(result.sections[0].citations).toHaveLength(1);
  return result.sections[0].citations[0];
}

describe("incompleteMarker", () => {
  it("names the Source", () => {
    expect(incompleteMarker("Diary")).toBe("[citation incomplete: Diary]");
  });
  it("uses the literal unnamed Source for undefined or empty", () => {
    expect(UNNAMED_SOURCE).toBe("unnamed Source");
    expect(incompleteMarker(undefined)).toBe(
      "[citation incomplete: unnamed Source]",
    );
    expect(incompleteMarker("")).toBe("[citation incomplete: unnamed Source]");
  });
});

describe("renderIncompleteCitation through the render pass", () => {
  it("removed Source: marker with the saved name", () => {
    const c = onlyCitation(pass({ status: "removed" }, "Old diary"));
    expect(c.incomplete?.kind).toBe("source-removed");
    expect(joined(c.runs)).toBe("[citation incomplete: Old diary]");
  });

  it("removed Source with no name: unnamed Source", () => {
    const c = onlyCitation(pass({ status: "removed" }));
    expect(joined(c.runs)).toBe("[citation incomplete: unnamed Source]");
  });

  it("name equals deriveCitationTargetState displayName", () => {
    const view = deriveCitationTargetState(
      { sourceId: "s", sourceName: "Old diary" },
      { source: "in-trash" },
    );
    const c = onlyCitation(pass({ status: "removed" }, "Old diary"));
    expect(joined(c.runs)).toBe(incompleteMarker(view.displayName));
  });

  it("Source with no fields: marker only", () => {
    const c = onlyCitation(
      pass({ status: "present", name: "Bare", citationFields: undefined }),
    );
    expect(joined(c.runs)).toBe("[citation incomplete: Bare]");
  });

  it("Source missing a required detail: what it has, then the marker", () => {
    const c = onlyCitation(
      pass({
        status: "present",
        name: "Partial",
        citationFields: {
          referenceType: "book",
          authors: [{ family: "Adams", given: "Ada" }],
          title: "The Alpha Book",
        },
      }),
    );
    expect(c.incomplete?.kind).toBe("missing-detail");
    const text = joined(c.runs);
    expect(text).toContain("Adams");
    expect(text).toContain("The Alpha Book");
    expect(text.endsWith(" [citation incomplete: Partial]")).toBe(true);
    expect(c.noteNumber).toBe(1);
  });

  it("a complete Source is left alone", () => {
    const c = onlyCitation(
      pass({
        status: "present",
        name: "Full",
        citationFields: {
          referenceType: "book",
          authors: [{ family: "Adams", given: "Ada" }],
          title: "The Alpha Book",
          publisher: "Alpha Press",
          date: "2001",
        },
      }),
    );
    expect(c.incomplete).toBeUndefined();
    expect(joined(c.runs)).not.toContain("citation incomplete");
  });

  it.each(["<b>x</b>", "[link](http://x)", "*em* & `code`"])(
    "keeps the name %s literal: plain text, no link or formatting",
    (name) => {
      const c = onlyCitation(pass({ status: "removed" }, name));
      expect(joined(c.runs)).toBe(`[citation incomplete: ${name}]`);
      for (const run of c.runs) {
        expect(run.link).toBeUndefined();
        expect(run.italic).toBeUndefined();
        expect(run.bold).toBeUndefined();
      }
    },
  );
});

describe("renderIncompleteCitation as a function", () => {
  const gap = (extra: Partial<CitationGap>): CitationGap => ({
    kind: "missing-detail",
    resourceId: "r",
    sourceId: "s",
    ...extra,
  });

  it("appends to engine runs with one plain separator", () => {
    const runs = renderIncompleteCitation(gap({ sourceName: "N" }), [
      { text: "Adams, ", italic: true },
    ]);
    expect(runs).toEqual([
      { text: "Adams, ", italic: true },
      { text: " [citation incomplete: N]" },
    ]);
  });

  it("gives the same text whatever the gap kind", () => {
    const kinds = [
      "source-removed",
      "missing-detail",
      "could-not-be-checked",
    ] as const;
    const texts = kinds.map((kind) =>
      joined(renderIncompleteCitation(gap({ kind, sourceName: "N" }), [])),
    );
    expect(new Set(texts)).toEqual(new Set(["[citation incomplete: N]"]));
  });

  it("does not mutate its input", () => {
    const input: CitationRun[] = [{ text: "x" }];
    renderIncompleteCitation(gap({}), input);
    expect(input).toEqual([{ text: "x" }]);
  });
});
