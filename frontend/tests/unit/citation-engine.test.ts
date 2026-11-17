/**
 * Task 32: the citation engine adapter, run against the vendored Hayagriva
 * WebAssembly build (specs/features/citations-at-compile/experiments/task-9.md).
 *
 * The style and locale below are throwaway test strings: Task 33 supplies the
 * bundled Chicago style and en-US locale and the adapter takes both as text.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  initCitationEngine,
  renderCitations,
  runsToPlainText,
  type CitationOccurrence,
  type CitationRun,
  occurrenceLocator,
} from "../../src/lib/citations/citation-engine";
import type { CslItem } from "../../src/lib/models/citations-csl-mapper";
import {
  resolveCitationLocator,
  type ResolvedCitationLocator,
} from "../../src/lib/models/citations-collect";
import type { Annotation } from "../../src/lib/models/types";
import { loadBundledStyle } from "../../src/lib/citations/style-loader";

const WASM_PATH = path.resolve(
  process.cwd(),
  "src/lib/citations/engine/hayagriva_wasm_bg.wasm",
);

const STYLE = `<?xml version="1.0" encoding="utf-8"?>
<style xmlns="http://purl.org/net/xbiblio/csl" class="note" version="1.0">
  <info><title>Test note style</title><id>http://example.invalid/test-note</id><updated>2026-01-01T00:00:00+00:00</updated></info>
  <citation>
    <layout suffix=".">
      <choose>
        <if position="subsequent">
          <group delimiter=", ">
            <names variable="author"><name form="short"/></names>
            <text variable="title" font-style="italic" form="short"/>
            <text variable="locator"/>
          </group>
        </if>
        <else>
          <group delimiter=", ">
            <names variable="author"/>
            <text variable="title" font-style="italic"/>
            <text variable="locator"/>
          </group>
        </else>
      </choose>
    </layout>
  </citation>
  <bibliography>
    <sort><key variable="author"/><key variable="title"/></sort>
    <layout suffix="."><group delimiter=". "><names variable="author"/><text variable="title" font-style="italic"/></group></layout>
  </bibliography>
</style>`;

const LOCALE = `<?xml version="1.0" encoding="utf-8"?>
<locale xmlns="http://purl.org/net/xbiblio/csl" version="1.0" xml:lang="en-US"><terms><term name="page" form="short">p.</term></terms></locale>`;

const ZED: CslItem = {
  id: "zed",
  type: "book",
  title: "Zed",
  author: [{ family: "Zee", given: "A" }],
};
const ALPHA: CslItem = {
  id: "alpha",
  type: "book",
  title: "Alpha",
  author: [{ family: "Abe", given: "B" }],
};
const TALK: CslItem = {
  id: "talk",
  type: "interview",
  title: "A Talk",
  author: [{ family: "Moe", given: "C" }],
};

function occ(
  itemId: string,
  locator: CitationOccurrence["locator"] = null,
): CitationOccurrence {
  return { itemIds: [itemId], locator };
}

function italicTexts(runs: readonly CitationRun[]): string[] {
  return runs.filter((r) => r.italic === true).map((r) => r.text);
}

beforeAll(async () => {
  await initCitationEngine(readFileSync(WASM_PATH));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("renderCitations: notes", () => {
  it("renders a note with an italic title run and a locator", () => {
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED],
      citations: [occ("zed", { label: "page", value: "4" })],
      placement: "note",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.citations).toHaveLength(1);
    const [note] = out.citations;
    expect(italicTexts(note.runs)).toEqual(["Zed"]);
    expect(runsToPlainText(note.runs)).toContain("Zed");
    expect(runsToPlainText(note.runs)).toContain("4");
  });

  it("numbers notes once, in order, across the whole manuscript", () => {
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED, ALPHA],
      citations: [occ("zed"), occ("alpha"), occ("zed"), occ("alpha")],
      placement: "note",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.citations.map((c) => c.noteNumber)).toEqual([1, 2, 3, 4]);
  });

  it("renders a repeated citation of one Source as the style says", () => {
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED],
      citations: [occ("zed"), occ("zed")],
      placement: "note",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const first = runsToPlainText(out.citations[0].runs);
    const second = runsToPlainText(out.citations[1].runs);
    expect(first).toContain("A");
    expect(second).not.toBe(first);
    expect(second).toContain("Zee");
    expect(second).not.toContain("A Zee");
  });

  it("returns no citation entries for no occurrences, as a success", () => {
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED],
      citations: [],
      placement: "note",
    });
    expect(out).toMatchObject({ ok: true, citations: [] });
  });
});

describe("renderCitations: in-text", () => {
  it("renders an in-text string with no note number", () => {
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED],
      citations: [occ("zed")],
      placement: "in-text",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.citations[0].noteNumber).toBeNull();
    expect(italicTexts(out.citations[0].runs)).toEqual(["Zed"]);
  });
});

describe("renderCitations: bibliography", () => {
  it("lists each item once in the style's order", () => {
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED, ALPHA],
      citations: [occ("zed"), occ("alpha"), occ("zed")],
      placement: "note",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.bibliography.map((b) => b.key)).toEqual(["alpha", "zed"]);
    expect(italicTexts(out.bibliography[0].runs)).toEqual(["Alpha"]);
  });

  it("names an item the engine gives no bibliography text, never drops it silently", () => {
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED, TALK],
      citations: [occ("zed"), occ("talk")],
      placement: "note",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const keys = out.bibliography.map((b) => b.key);
    const missing = ["zed", "talk"].filter((k) => !keys.includes(k));
    expect(out.omittedFromBibliography).toEqual(missing);
    expect(keys).toContain("zed");
  });
});

describe("renderCitations: failure outcomes", () => {
  it("names the style stage for a malformed style", () => {
    const out = renderCitations({
      styleXml: "<x/>",
      localeXml: LOCALE,
      items: [ZED],
      citations: [occ("zed")],
      placement: "note",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.stage).toBe("style");
    expect(out.message.length).toBeGreaterThan(0);
  });

  it("names the item an unknown id points at", () => {
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED],
      citations: [occ("missing")],
      placement: "note",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.stage).toBe("citation");
  });

  it("refuses a duplicate item id as a failure", () => {
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED, { ...ALPHA, id: "zed" }],
      citations: [occ("zed")],
      placement: "note",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.stage).toBe("items");
  });

  it("refuses an occurrence with no item id", () => {
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED],
      citations: [{ itemIds: [], locator: null }],
      placement: "note",
    });
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.stage).toBe("citations");
  });
});

describe("renderCitations: no network", () => {
  it("makes no fetch request while rendering", () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const out = renderCitations({
      styleXml: STYLE,
      localeXml: LOCALE,
      items: [ZED],
      citations: [occ("zed")],
      placement: "note",
    });
    expect(out.ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

/** A note style that prints the locator's label, to show what the engine got. */
const LABEL_STYLE = STYLE.replaceAll(
  '<text variable="locator"/>',
  '<group delimiter=" "><label variable="locator" form="short"/><text variable="locator"/></group>',
);

async function bundled(): Promise<{ style: string; locale: string }> {
  const loaded = await loadBundledStyle("chicago-notes-bibliography");
  if (!loaded.ok) throw new Error("the bundled style did not load");
  return { style: loaded.style, locale: loaded.locale };
}

function renderNote(
  styleXml: string,
  localeXml: string,
  resolved: ResolvedCitationLocator,
): string {
  const out = renderCitations({
    styleXml,
    localeXml,
    items: [ZED],
    citations: [{ itemIds: ["zed"], ...occurrenceLocator(resolved) }],
    placement: "note",
  });
  expect(out.ok).toBe(true);
  if (!out.ok) return "";
  return runsToPlainText(out.citations[0].runs);
}

const NONE: ResolvedCitationLocator = { kind: "none" };
const TIMESTAMP: ResolvedCitationLocator = {
  kind: "literal",
  text: "12:30",
  neverLabel: true,
};

describe("renderCitations: locator labels (Task 34)", () => {
  it("renders a page locator with the locale's page term", () => {
    const text = renderNote(LABEL_STYLE, LOCALE, {
      kind: "label",
      label: "page",
      value: "42",
    });
    expect(text).toContain("p. 42");
  });

  it("renders a page locator in the bundled style as that style words it", async () => {
    const { style, locale } = await bundled();
    const text = renderNote(style, locale, {
      kind: "label",
      label: "page",
      value: "42",
    });
    expect(text).toMatch(/, 42\.$/);
  });

  it("renders a paragraph locator with the bundled style's and locale's term", async () => {
    const { style, locale } = await bundled();
    const text = renderNote(style, locale, {
      kind: "label",
      label: "paragraph",
      value: "3",
    });
    expect(text).toContain("para. 3");
  });

  it("renders a line locator with the bundled style's and locale's term", async () => {
    const { style, locale } = await bundled();
    const text = renderNote(style, locale, {
      kind: "label",
      label: "line",
      value: "118",
    });
    expect(text).toContain("line 118");
  });

  it("appends a timestamp as literal text before the closing full stop", async () => {
    const { style, locale } = await bundled();
    const withTime = renderNote(style, locale, TIMESTAMP);
    const without = renderNote(style, locale, NONE);
    expect(withTime).toContain("at 12:30");
    expect(withTime.endsWith(".")).toBe(true);
    expect(withTime).toBe(`${without.slice(0, -1)}, at 12:30.`);
  });

  it("never passes a timestamp to the engine as a label", () => {
    expect(occurrenceLocator(TIMESTAMP).locator).toBeNull();
    const text = renderNote(LABEL_STYLE, LOCALE, TIMESTAMP);
    expect(text).toContain("at 12:30");
    expect(text).not.toContain("p. ");
  });

  it("renders a citation with no locator without one", () => {
    const text = renderNote(LABEL_STYLE, LOCALE, NONE);
    expect(text).not.toContain("p. ");
    expect(text).not.toContain("at ");
    expect(occurrenceLocator(NONE)).toEqual({ locator: null });
  });

  it("treats a locator value as text", () => {
    const text = renderNote(LABEL_STYLE, LOCALE, {
      kind: "label",
      label: "page",
      value: "<b>4</b> & 5",
    });
    expect(text).toContain("p. <b>4</b> & 5");
    const time = renderNote(LABEL_STYLE, LOCALE, {
      kind: "literal",
      text: " <i>1:05</i> ",
      neverLabel: true,
    });
    expect(time).toContain("at  <i>1:05</i> ");
  });

  it("uses the citation's own locator, else the excerpt's, else none", () => {
    const excerpt: Annotation = {
      id: "x1",
      body: "",
      quote: "q",
      target: { sourceId: "s1", locator: { type: "page", value: "9" } },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const bySource = { s1: [excerpt] };
    const own = resolveCitationLocator(
      {
        sourceId: "s1",
        excerptId: "x1",
        locator: { type: "line", value: "2" },
      },
      bySource,
    );
    const inherited = resolveCitationLocator(
      { sourceId: "s1", excerptId: "x1" },
      bySource,
    );
    const neither = resolveCitationLocator({ sourceId: "s1" }, bySource);
    expect(occurrenceLocator(own).locator).toEqual({
      label: "line",
      value: "2",
    });
    expect(occurrenceLocator(inherited).locator).toEqual({
      label: "page",
      value: "9",
    });
    expect(renderNote(LABEL_STYLE, LOCALE, inherited)).toContain("p. 9");
    expect(occurrenceLocator(neither)).toEqual({ locator: null });
  });

  it("applies a locator to the first item id only", () => {
    const out = renderCitations({
      styleXml: LABEL_STYLE,
      localeXml: LOCALE,
      items: [ZED, ALPHA],
      citations: [
        {
          itemIds: ["zed", "alpha"],
          ...occurrenceLocator({ kind: "label", label: "page", value: "7" }),
        },
      ],
      placement: "note",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const text = runsToPlainText(out.citations[0].runs);
    expect(text.match(/p\. 7/g)).toHaveLength(1);
  });
});
