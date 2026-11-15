/**
 * Feature 116 Task 41: the DOCX document carries rendered notes as Word
 * footnotes, with their formatting runs, and the bibliography at the end.
 * Page placement of a note is left to Word and is not asserted here.
 */
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  buildDocxDocument,
  Packer,
  type DocxCitationsInput,
} from "../../src/lib/export/CompileDocxDocument";
import type { CompileSection } from "../../src/lib/export/compile-text";

const sections: CompileSection[] = [
  { name: "One", content: "First line.\nSecond line here." },
  { name: "Two", content: "Other text." },
];

interface Unzipped {
  doc: string;
  footnotes: string | undefined;
  names: string[];
}

async function unzipBuild(
  citations: DocxCitationsInput | undefined,
): Promise<Unzipped> {
  const zip = await JSZip.loadAsync(
    await Packer.toBuffer(
      buildDocxDocument(sections, { includeHeaders: true }, citations),
    ),
  );
  return {
    doc: (await zip.file("word/document.xml")?.async("string")) ?? "",
    footnotes: await zip.file("word/footnotes.xml")?.async("string"),
    names: Object.keys(zip.files).sort(),
  };
}

const citations: DocxCitationsInput = {
  sections: [
    {
      notes: [
        {
          offset: 5,
          noteNumber: 1,
          runs: [
            { text: "Author, " },
            { text: "A Title", italic: true },
            { text: ", p. " },
            { text: "4", bold: true },
          ],
        },
        {
          offset: 18,
          noteNumber: 2,
          runs: [{ text: "Second", smallCaps: true }],
        },
      ],
    },
    { notes: [] },
  ],
  bibliography: {
    heading: "Bibliography",
    entries: [
      { runs: [{ text: "Author. " }, { text: "A Title", italic: true }] },
      { runs: [{ text: "Other." }] },
    ],
  },
};

function noteBody(footnotes: string | undefined, id: number): string {
  const re = new RegExp(
    `<w:footnote\\b[^>]*w:id="${id}"[^>]*>([\\s\\S]*?)</w:footnote>`,
  );
  return re.exec(footnotes ?? "")?.[1] ?? "";
}

describe("buildDocxDocument citations", () => {
  it("with no citations the output equals the two-argument build", async () => {
    const a = await unzipBuild(undefined);
    const zipB = await JSZip.loadAsync(
      await Packer.toBuffer(
        buildDocxDocument(sections, { includeHeaders: true }),
      ),
    );
    const bDoc = await zipB.file("word/document.xml")?.async("string");
    expect(a.doc).toBe(bDoc);
    expect(a.names).toEqual(Object.keys(zipB.files).sort());
    expect(a.doc).not.toContain("footnoteReference");
  });

  it("writes footnotes.xml and each reference resolves to a note with its runs", async () => {
    const { doc, footnotes } = await unzipBuild(citations);
    expect(footnotes).toBeDefined();
    const refs = [
      ...doc.matchAll(/<w:footnoteReference[^>]*w:id="(\d+)"/g),
    ].map((m) => Number(m[1]));
    expect(refs).toEqual([1, 2]);
    const one = noteBody(footnotes, 1);
    expect(one).toContain("Author, ");
    expect(one).toMatch(/<w:i\/>(?:(?!<\/w:r>)[\s\S])*A Title/);
    expect(one).toMatch(/<w:b\/>(?:(?!<\/w:r>)[\s\S])*>4</);
    expect(noteBody(footnotes, 2)).toMatch(/<w:smallCaps\/>/);
  });

  it("splits the text at the anchor so the reference follows the cited characters", async () => {
    const { doc } = await unzipBuild(citations);
    const before = doc.indexOf(">First</w:t>");
    const ref = doc.indexOf("footnoteReference");
    const after = doc.indexOf("> line.</w:t>");
    expect(before).toBeGreaterThan(-1);
    expect(ref).toBeGreaterThan(before);
    expect(after).toBeGreaterThan(ref);
  });

  it("puts the bibliography after the manuscript with its heading", async () => {
    const { doc } = await unzipBuild(citations);
    expect(doc.indexOf("Bibliography")).toBeGreaterThan(
      doc.indexOf("Other text."),
    );
    expect(doc.indexOf("Author. ")).toBeGreaterThan(
      doc.indexOf("Bibliography"),
    );
    expect(doc.indexOf("Other.")).toBeGreaterThan(doc.indexOf("Author. "));
  });

  it("escapes markup and never makes a link of a run", async () => {
    const hostile: DocxCitationsInput = {
      sections: [
        {
          notes: [
            {
              offset: 3,
              noteNumber: 1,
              runs: [
                { text: "<b>x</b> & <script>", link: "https://example.com/a" },
              ],
            },
          ],
        },
        { notes: [] },
      ],
      bibliography: {
        heading: "Refs <i>",
        entries: [{ runs: [{ text: "<w:p/>&amp;", link: "https://e.org" }] }],
      },
    };
    const { doc, footnotes } = await unzipBuild(hostile);
    expect(footnotes).toContain("&lt;b&gt;x&lt;/b&gt; &amp; &lt;script&gt;");
    expect(footnotes).not.toContain("<script>");
    expect(doc).toContain("&lt;w:p/&gt;&amp;amp;");
    expect(doc).toContain("Refs &lt;i&gt;");
    expect(doc).not.toContain("<w:hyperlink");
    expect(footnotes).not.toContain("<w:hyperlink");
    expect(doc + (footnotes ?? "")).not.toContain("example.com");
  });

  it("an in-text citation (no note number) is inline text, not a footnote", async () => {
    const { doc, footnotes } = await unzipBuild({
      sections: [
        {
          notes: [
            { offset: 5, noteNumber: null, runs: [{ text: "(Smith 2020)" }] },
          ],
        },
        { notes: [] },
      ],
    });
    expect(doc).toContain("(Smith 2020)");
    expect(doc).not.toContain("footnoteReference");
    expect(footnotes ?? "").not.toContain("Smith");
  });

  it("refuses an anchor outside the section text rather than dropping the note", () => {
    expect(() =>
      buildDocxDocument(
        sections,
        { includeHeaders: true },
        {
          sections: [
            { notes: [{ offset: 999, noteNumber: 1, runs: [{ text: "x" }] }] },
            { notes: [] },
          ],
        },
      ),
    ).toThrow(RangeError);
  });

  it("refuses a section list that does not match the manuscript", () => {
    expect(() =>
      buildDocxDocument(sections, { includeHeaders: true }, { sections: [] }),
    ).toThrow(RangeError);
  });
});
