/**
 * Feature 116, Task 38 (FR-11, FR-17): the citation render pass. Runs the
 * real adapter, the vendored engine and the bundled Chicago style.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { initCitationEngine } from "../../src/lib/citations/citation-engine";
import { loadBundledStyle } from "../../src/lib/citations/style-loader";
import type { StyleLoadOutcome } from "../../src/lib/citations/style-loader";
import { placeCitationAnchors } from "../../src/lib/models/citations-anchor";
import { collectCitations } from "../../src/lib/models/citations-collect";
import {
  renderCitationPass,
  type CitationRenderInput,
  type CitationRenderResource,
  type CitationSourceInput,
} from "../../src/lib/models/citations-render";
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

const BOOK_A: CitationSourceInput = {
  status: "present",
  name: "Alpha",
  citationFields: {
    referenceType: "book",
    authors: [{ family: "Adams", given: "Ada" }],
    title: "The Alpha Book",
    publisher: "Alpha Press",
    date: "2001",
  },
};
const BOOK_B: CitationSourceInput = {
  status: "present",
  name: "Beta",
  citationFields: {
    referenceType: "book",
    authors: [{ family: "Brown", given: "Bo" }],
    title: "The Beta Book",
    publisher: "Beta Press",
    date: "2002",
  },
};

const FAILED_STYLE: StyleLoadOutcome = {
  ok: false,
  reason: "load-failed",
  failed: "style",
  message: "The citation style could not be loaded.",
};

function annotation(
  id: string,
  sourceId?: string,
  extra: Record<string, unknown> = {},
): Annotation {
  return {
    id,
    body: "",
    quote: "the cited passage",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...(sourceId === undefined ? {} : { target: { sourceId, ...extra } }),
  };
}

function doc(...parts: Array<[string, string | null]>): TipTapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: parts.map(([value, id]) => ({
          type: "text",
          text: value,
          ...(id === null
            ? {}
            : { marks: [{ type: "annotation", attrs: { id } }] }),
        })),
      },
    ],
  };
}

function resource(
  resourceId: string,
  document: TipTapDocument,
  annotations: Annotation[],
  included = true,
): CitationRenderResource {
  return { resourceId, included, document, annotations };
}

const DEFAULT_SOURCES: Record<string, CitationSourceInput> = {
  "src-a": BOOK_A,
  "src-b": BOOK_B,
};

function input(
  resources: CitationRenderResource[],
  sources: Record<string, CitationSourceInput> = DEFAULT_SOURCES,
  extra: Partial<CitationRenderInput> = {},
): CitationRenderInput {
  return {
    resources,
    sources,
    excerptAnnotationsBySource: {},
    style,
    ...extra,
  };
}

function expectOk(result: ReturnType<typeof renderCitationPass>) {
  if (result.status !== "ok") throw new Error(`expected ok: ${result.message}`);
  return result;
}

const joined = (runs: readonly { text: string }[]): string =>
  runs.map((r) => r.text).join("");

describe("renderCitationPass", () => {
  it("renders each citation through the adapter at the anchor of Task 23", () => {
    const document = doc(
      ["Intro ", null],
      ["the cited passage", "a1"],
      [". More.", null],
    );
    const annotations = [annotation("a1", "src-a")];
    const result = expectOk(
      renderCitationPass(input([resource("r1", document, annotations)])),
    );
    const [section] = result.sections;
    expect(section.citations).toHaveLength(1);
    const [c] = section.citations;
    expect(c.annotationId).toBe("a1");
    expect(c.noteNumber).toBe(1);
    expect(joined(c.runs)).toContain("Adams");
    expect(joined(c.runs)).toContain("The Alpha Book");
    const expected = placeCitationAnchors(
      document,
      collectCitations({
        resourceId: "r1",
        included: true,
        annotations,
        excerptAnnotationsBySource: {},
      }),
      { noteStyle: true },
    ).placed[0];
    expect(c.anchor).toEqual(expected);
    // the note goes after the full stop that follows the mark
    expect(c.anchor).toEqual({ annotationId: "a1", path: [0, 2], offset: 1 });
  });

  it("does not render a citation in a resource left out of the compile", () => {
    const resources = [
      resource("r1", doc(["one", "a1"]), [annotation("a1", "src-a")]),
      resource("r2", doc(["two", "a2"]), [annotation("a2", "src-b")], false),
      resource("r3", doc(["three", "a3"]), [annotation("a3", "src-b")]),
    ];
    const result = expectOk(renderCitationPass(input(resources)));
    expect(result.sections.map((s) => s.resourceId)).toEqual(["r1", "r3"]);
    const all = result.sections.flatMap((s) => s.citations);
    expect(all.map((c) => c.annotationId)).toEqual(["a1", "a3"]);
    expect(all.map((c) => c.noteNumber)).toEqual([1, 2]);
  });

  it("leaves an annotation that is not a citation as it is today", () => {
    const resources = [
      resource(
        "r1",
        doc(["a note", "n1"], [" excerpt", "e1"], [" self", "s1"]),
        [
          annotation("n1"),
          annotation("e1", "r1", { excerptId: "x" }),
          annotation("s1", "r1"),
        ],
      ),
    ];
    const result = expectOk(renderCitationPass(input(resources)));
    expect(result.sections[0].citations).toEqual([]);
    expect(result.sections[0].unplaced).toEqual([]);
  });

  it("leaves the compiled text of the cited passage unchanged", () => {
    const document = doc(
      ["before ", null],
      ["the cited passage", "a1"],
      [" after", null],
    );
    const before = JSON.stringify(document);
    const result = expectOk(
      renderCitationPass(
        input([resource("r1", document, [annotation("a1", "src-a")])]),
      ),
    );
    expect(JSON.stringify(document)).toBe(before);
    expect(result.sections[0].document).toBe(document);
  });

  it("carries the engine's formatting runs to the output", () => {
    const result = expectOk(
      renderCitationPass(
        input([resource("r1", doc(["p", "a1"]), [annotation("a1", "src-a")])]),
      ),
    );
    const runs = result.sections[0].citations[0].runs;
    const italic = runs.filter((r) => r.italic === true);
    expect(joined(italic)).toContain("The Alpha Book");
  });

  it("passes a page locator to the engine", () => {
    const result = expectOk(
      renderCitationPass(
        input([
          resource("r1", doc(["p", "a1"]), [
            annotation("a1", "src-a", {
              locator: { type: "page", value: "42" },
            }),
          ]),
        ]),
      ),
    );
    expect(joined(result.sections[0].citations[0].runs)).toContain("42");
  });

  it("numbers notes once across the whole manuscript in compile order", () => {
    const resources = [
      resource("r1", doc(["a", "a1"], [" b", "a2"]), [
        annotation("a1", "src-a"),
        annotation("a2", "src-b"),
      ]),
      resource("r2", doc(["c", "a3"]), [annotation("a3", "src-a")]),
    ];
    const result = expectOk(renderCitationPass(input(resources)));
    const numbers = result.sections.flatMap((s) =>
      s.citations.map((c) => c.noteNumber),
    );
    expect(numbers).toEqual([1, 2, 3]);
    // a later citation of the same Source is a subsequent note, not the first form
    const first = joined(result.sections[0].citations[0].runs);
    const third = joined(result.sections[1].citations[0].runs);
    expect(third).not.toBe(first);
  });

  it("renders a citation inside a compiled Source body like any other", () => {
    const resources = [
      resource("src-a", doc(["from a source body", "a1"], [" self", "a2"]), [
        annotation("a1", "src-b"),
        annotation("a2", "src-a"),
      ]),
    ];
    const result = expectOk(renderCitationPass(input(resources)));
    expect(result.sections[0].citations).toHaveLength(1);
    const [c] = result.sections[0].citations;
    expect(c.noteNumber).toBe(1);
    expect(joined(c.runs)).toContain("Brown");
  });

  it("fails naming the read when a cited Source cannot be read", () => {
    const result = renderCitationPass(
      input([resource("r1", doc(["p", "a1"]), [annotation("a1", "src-a")])], {
        "src-a": { status: "unreadable" },
      }),
    );
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.failure).toBe("read-failed");
      expect(result.message).toMatch(/Source/);
      expect("sections" in result).toBe(false);
    }
  });

  it("fails rather than guess when a cited Source was never handed over", () => {
    const result = renderCitationPass(
      input(
        [resource("r1", doc(["p", "a1"]), [annotation("a1", "src-a")])],
        {},
      ),
    );
    expect(result).toMatchObject({ status: "failed", failure: "read-failed" });
  });

  it("fails when the style did not load", () => {
    const result = renderCitationPass(
      input(
        [resource("r1", doc(["p", "a1"]), [annotation("a1", "src-a")])],
        DEFAULT_SOURCES,
        { style: FAILED_STYLE },
      ),
    );
    expect(result).toMatchObject({
      status: "failed",
      failure: "style-load-failed",
      message: "The citation style could not be loaded.",
    });
  });

  it("fails naming the engine when the adapter fails", () => {
    if (!style.ok) throw new Error("style fixture");
    const result = renderCitationPass(
      input(
        [resource("r1", doc(["p", "a1"]), [annotation("a1", "src-a")])],
        DEFAULT_SOURCES,
        { style: { ...style, style: "<not-a-style/>" } },
      ),
    );
    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      expect(result.failure).toBe("engine-failed");
      expect(result.message).toMatch(/engine/i);
      expect("sections" in result).toBe(false);
    }
  });

  it("offers a hook for the three incomplete cases and never skips them", () => {
    const seen: string[] = [];
    const resources = [
      resource("r1", doc(["a", "a1"], [" b", "a2"], [" c", "a3"]), [
        annotation("a1", "gone", { sourceName: "Old Name" }),
        annotation("a2", "bare"),
        annotation("a3", "thin"),
      ]),
    ];
    const sources: Record<string, CitationSourceInput> = {
      gone: { status: "removed" },
      bare: { status: "present", name: "Bare", citationFields: undefined },
      thin: {
        status: "present",
        name: "Thin",
        citationFields: { referenceType: "book", title: "Only A Title" },
      },
    };
    const result = expectOk(
      renderCitationPass(
        input(resources, sources, {
          renderIncomplete: (gap, runs) => {
            seen.push(`${gap.kind}:${gap.sourceName ?? ""}`);
            return [...runs, { text: " [x]" }];
          },
        }),
      ),
    );
    expect(seen).toEqual([
      "source-removed:Old Name",
      "missing-detail:Bare",
      "missing-detail:Thin",
    ]);
    const cs = result.sections[0].citations;
    expect(cs).toHaveLength(3);
    expect(cs.map((c) => c.noteNumber)).toEqual([1, 2, 3]);
    expect(cs.every((c) => joined(c.runs).endsWith(" [x]"))).toBe(true);
    expect(cs.map((c) => c.incomplete?.kind)).toEqual([
      "source-removed",
      "missing-detail",
      "missing-detail",
    ]);
    expect(joined(cs[2].runs)).toContain("Only a Title");
  });

  it("reports a citation whose mark is not in the document instead of dropping it", () => {
    const result = expectOk(
      renderCitationPass(
        input([
          resource("r1", doc(["plain", null]), [annotation("a1", "src-a")]),
        ]),
      ),
    );
    expect(result.sections[0].citations).toEqual([]);
    expect(result.sections[0].unplaced.map((u) => u.annotationId)).toEqual([
      "a1",
    ]);
  });
});
