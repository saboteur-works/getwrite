// Last Updated: 2026-11-14

/**
 * Feature 116, Task 22 (FR-11, FR-14): citation collection and locator
 * resolution. One test per rule of the task's "Done when".
 */
import { describe, expect, it } from "vitest";
import {
  collectCitations,
  resolveCitationLocator,
  type CollectCitationsInput,
} from "../../src/lib/models/citations-collect";
import type {
  Annotation,
  AnnotationLocator,
  AnnotationTarget,
} from "../../src/lib/models/types";

const HOST = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SOURCE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EXCERPT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = "2026-11-14T00:00:00.000Z";

function note(id: string, target?: AnnotationTarget): Annotation {
  return {
    id,
    body: "",
    quote: "q",
    createdAt: NOW,
    updatedAt: NOW,
    ...(target === undefined ? {} : { target }),
  };
}

function input(
  annotations: readonly Annotation[],
  extra: Partial<CollectCitationsInput> = {},
): CollectCitationsInput {
  return {
    resourceId: HOST,
    included: true,
    annotations,
    excerptAnnotationsBySource: {},
    ...extra,
  };
}

describe("collectCitations: the FR-11 definition", () => {
  it("an annotation whose target.sourceId is not its resource is a citation", () => {
    const out = collectCitations(input([note("n1", { sourceId: SOURCE })]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      annotationId: "n1",
      resourceId: HOST,
      sourceId: SOURCE,
    });
  });

  it("an excerpt (target on its host Source) is never a citation", () => {
    const out = collectCitations(
      input([
        note("e1", {
          sourceId: HOST,
          excerptId: EXCERPT,
          locator: { type: "page", value: "3" },
        }),
      ]),
    );
    expect(out).toEqual([]);
  });

  it("a Source citing itself is left out", () => {
    expect(collectCitations(input([note("s1", { sourceId: HOST })]))).toEqual(
      [],
    );
  });

  it("an annotation with no target is not a citation", () => {
    expect(collectCitations(input([note("p1")]))).toEqual([]);
  });

  it("a resource left out of the compile contributes no citation", () => {
    const out = collectCitations(
      input([note("n1", { sourceId: SOURCE })], { included: false }),
    );
    expect(out).toEqual([]);
  });

  it("keeps annotation order and carries the saved Source name", () => {
    const out = collectCitations(
      input([
        note("n1", { sourceId: SOURCE, sourceName: "Book" }),
        note("p"),
        note("n2", { sourceId: SOURCE }),
      ]),
    );
    expect(out.map((c) => c.annotationId)).toEqual(["n1", "n2"]);
    expect(out[0].sourceName).toBe("Book");
    expect(out[1].sourceName).toBeUndefined();
  });
});

describe("resolveCitationLocator: FR-14 selection", () => {
  const excerptLocator: AnnotationLocator = { type: "page", value: "99" };
  const excerptHost: Record<string, readonly Annotation[]> = {
    [SOURCE]: [
      note(EXCERPT, {
        sourceId: SOURCE,
        excerptId: EXCERPT,
        locator: excerptLocator,
      }),
    ],
  };

  it("page, paragraph and line are CSL label kinds", () => {
    for (const type of ["page", "paragraph", "line"] as const) {
      expect(
        resolveCitationLocator(
          { sourceId: SOURCE, locator: { type, value: "7" } },
          {},
        ),
      ).toEqual({ kind: "label", label: type, value: "7" });
    }
  });

  it("a timestamp is literal text flagged never to be a label", () => {
    expect(
      resolveCitationLocator(
        { sourceId: SOURCE, locator: { type: "timestamp", value: "at 12:30" } },
        {},
      ),
    ).toEqual({ kind: "literal", text: "at 12:30", neverLabel: true });
  });

  it("a locator with no type is literal text, never a label", () => {
    expect(
      resolveCitationLocator(
        { sourceId: SOURCE, locator: { value: "ch. 2" } },
        {},
      ),
    ).toEqual({ kind: "literal", text: "ch. 2", neverLabel: true });
  });

  it("a value is text and is never interpreted or trimmed", () => {
    const value = "  12-14, <b>x</b> 0x10 ";
    expect(
      resolveCitationLocator(
        { sourceId: SOURCE, locator: { type: "page", value } },
        {},
      ),
    ).toEqual({ kind: "label", label: "page", value });
  });

  it("the citation's own locator wins over the excerpt's", () => {
    expect(
      resolveCitationLocator(
        {
          sourceId: SOURCE,
          excerptId: EXCERPT,
          locator: { type: "line", value: "4" },
        },
        excerptHost,
      ),
    ).toEqual({ kind: "label", label: "line", value: "4" });
  });

  it("with no own locator an excerpt citation uses the excerpt's locator", () => {
    expect(
      resolveCitationLocator(
        { sourceId: SOURCE, excerptId: EXCERPT },
        excerptHost,
      ),
    ).toEqual({ kind: "label", label: "page", value: "99" });
  });

  it("neither locator returns none", () => {
    expect(resolveCitationLocator({ sourceId: SOURCE }, {})).toEqual({
      kind: "none",
    });
    expect(
      resolveCitationLocator(
        { sourceId: SOURCE, excerptId: EXCERPT },
        { [SOURCE]: [note(EXCERPT, { sourceId: SOURCE, excerptId: EXCERPT })] },
      ),
    ).toEqual({ kind: "none" });
  });

  it("an excerpt not found among the Source's annotations gives none", () => {
    expect(
      resolveCitationLocator({ sourceId: SOURCE, excerptId: EXCERPT }, {}),
    ).toEqual({ kind: "none" });
  });

  it("collectCitations attaches the resolved locator", () => {
    const out = collectCitations(
      input([note("n1", { sourceId: SOURCE, excerptId: EXCERPT })], {
        excerptAnnotationsBySource: excerptHost,
      }),
    );
    expect(out[0].locator).toEqual({
      kind: "label",
      label: "page",
      value: "99",
    });
  });
});
