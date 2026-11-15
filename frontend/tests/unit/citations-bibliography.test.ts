/**
 * Feature 116, Task 40 (FR-11, FR-17): the bibliography. Runs the real
 * adapter, the vendored engine and the bundled Chicago style; the cited
 * Sources come from the Task 38 pass, as the compile will hand them over.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  initCitationEngine,
  runsToPlainText,
} from "../../src/lib/citations/citation-engine";
import { loadBundledStyle } from "../../src/lib/citations/style-loader";
import type { StyleLoadOutcome } from "../../src/lib/citations/style-loader";
import { buildBibliography } from "../../src/lib/models/citations-bibliography";
import {
  renderCitationPass,
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

const book = (
  name: string,
  family: string,
  title: string,
): CitationSourceInput => ({
  status: "present",
  name,
  citationFields: {
    referenceType: "book",
    authors: [{ family, given: "Pat" }],
    title,
    publisher: "Press",
    date: "2001",
  },
});

const SOURCES: Record<string, CitationSourceInput> = {
  "src-z": book("Zed", "Zimmer", "The Zed Book"),
  "src-a": book("Alpha", "Adams", "The Alpha Book"),
  "src-b": book("Beta", "Brown", "The Beta Book"),
  "src-i": {
    status: "present",
    name: "Talk",
    citationFields: {
      referenceType: "interview",
      interviewee: [{ family: "Roe", given: "Jane" }],
      date: "2020",
    },
  },
};

function annotation(id: string, sourceId: string): Annotation {
  return {
    id,
    body: "",
    quote: "passage",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    target: { sourceId },
  };
}

function resource(
  resourceId: string,
  cites: Array<[string, string]>,
  included = true,
): CitationRenderResource {
  const document: TipTapDocument = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: cites.map(([id]) => ({
          type: "text",
          text: "passage",
          marks: [{ type: "annotation", attrs: { id } }],
        })),
      },
    ],
  };
  return {
    resourceId,
    included,
    document,
    annotations: cites.map(([id, src]) => annotation(id, src)),
  };
}

function bibliographyFor(resources: CitationRenderResource[]) {
  const pass = renderCitationPass({
    resources,
    sources: SOURCES,
    excerptAnnotationsBySource: {},
    style,
  });
  if (pass.status !== "ok") throw new Error(pass.message);
  return buildBibliography({ items: pass.items, style });
}

function expectOk(result: ReturnType<typeof buildBibliography>) {
  if (result.status !== "ok") throw new Error(result.message);
  return result;
}

const keys = (r: { entries: { key: string }[] }): string[] =>
  r.entries.map((e) => e.key);

describe("buildBibliography", () => {
  it("lists a cited Source once", () => {
    const r = expectOk(bibliographyFor([resource("r1", [["a1", "src-a"]])]));
    expect(keys(r)).toEqual(["src-a"]);
    expect(runsToPlainText(r.entries[0].runs)).toContain("The Alpha Book");
  });

  it("lists a Source cited twice once", () => {
    const r = expectOk(
      bibliographyFor([
        resource("r1", [["a1", "src-a"]]),
        resource("r2", [["a2", "src-a"]]),
      ]),
    );
    expect(keys(r)).toEqual(["src-a"]);
  });

  it("cites and lists a Source that is itself excluded from the compile", () => {
    const r = expectOk(
      bibliographyFor([
        resource("r1", [["a1", "src-a"]]),
        resource("src-a", [], false),
      ]),
    );
    expect(keys(r)).toEqual(["src-a"]);
  });

  it("does not list a Source cited only in a resource left out of the compile", () => {
    const r = expectOk(
      bibliographyFor([
        resource("r1", [["a1", "src-a"]]),
        resource("r2", [["a2", "src-b"]], false),
      ]),
    );
    expect(keys(r)).toEqual(["src-a"]);
  });

  it("does not list a Source that is not cited", () => {
    const r = expectOk(bibliographyFor([resource("r1", [["a1", "src-a"]])]));
    expect(keys(r)).not.toContain("src-b");
    expect(keys(r)).not.toContain("src-z");
  });

  it("takes order and formatting from the style through the adapter", () => {
    const r = expectOk(
      bibliographyFor([
        resource("r1", [
          ["a1", "src-z"],
          ["a2", "src-b"],
          ["a3", "src-a"],
        ]),
      ]),
    );
    // Chicago orders the bibliography by author, not by citation order.
    expect(keys(r)).toEqual(["src-a", "src-b", "src-z"]);
    const italic = r.entries[0].runs.filter((run) => run.italic === true);
    expect(runsToPlainText(italic)).toContain("The Alpha Book");
  });

  it("takes the heading from the table keyed by style id", () => {
    const r = expectOk(bibliographyFor([resource("r1", [["a1", "src-a"]])]));
    expect(r.heading).toBe("Bibliography");
  });

  it("keeps a Source the engine gave no bibliography text visible", () => {
    const r = expectOk(
      bibliographyFor([
        resource("r1", [
          ["a1", "src-a"],
          ["a2", "src-i"],
        ]),
      ]),
    );
    expect(keys(r)).toEqual(["src-a"]);
    expect(r.omittedFromBibliography).toEqual(["src-i"]);
  });

  it("fails naming the style when it did not load, never an empty bibliography", () => {
    const failedStyle: StyleLoadOutcome = {
      ok: false,
      reason: "load-failed",
      failed: "style",
      message: "The citation style could not be loaded.",
    };
    const r = buildBibliography({ items: [], style: failedStyle });
    expect(r).toEqual({
      status: "failed",
      failure: "style-load-failed",
      message: "The citation style could not be loaded.",
    });
  });

  it("fails naming the engine stage when the adapter fails", () => {
    if (!style.ok) throw new Error("style");
    const r = buildBibliography({
      items: [
        { id: "x", type: "book", title: "T" },
        { id: "x", type: "book", title: "T2" },
      ],
      style,
    });
    expect(r.status).toBe("failed");
    if (r.status !== "failed") return;
    expect(r.failure).toBe("engine-failed");
    expect(r.message).toBe(
      "The citation engine failed while building the bibliography (items).",
    );
  });
});
