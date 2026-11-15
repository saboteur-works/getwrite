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
} from "../../src/lib/citations/citation-engine";
import type { CslItem } from "../../src/lib/models/citations-csl-mapper";

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
