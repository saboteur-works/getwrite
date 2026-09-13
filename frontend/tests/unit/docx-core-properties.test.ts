import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { readFileBuffer } from "../../src/lib/models/io";
import { readDocxCoreProperties } from "../../src/lib/models/docx/core-properties";

const FIXTURES_DIR = path.join(
  __dirname,
  "..",
  "fixtures",
  "docx",
);

describe("readDocxCoreProperties", () => {
  it("reads the title and author from a .docx's docProps/core.xml", async () => {
    const docxBytes = await readFileBuffer(
      path.join(FIXTURES_DIR, "core-properties.docx"),
    );

    const result = await readDocxCoreProperties(docxBytes);

    // Exact values generate-docx-fixtures.ts's buildCorePropertiesDoc()
    // sets via `docx`'s `title`/`creator` Document options.
    expect(result).toEqual({
      title: "Synthetic Core Properties Fixture",
      author: "GetWrite Fixture Generator",
    });
  });

  it("returns both fields undefined when docProps/core.xml has no title or author", async () => {
    const zip = new JSZip();
    zip.file(
      "docProps/core.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        "</cp:coreProperties>",
    );
    const docxBytes = await zip.generateAsync({ type: "nodebuffer" });

    const result = await readDocxCoreProperties(docxBytes);

    expect(result.title).toBeUndefined();
    expect(result.author).toBeUndefined();
  });

  it("returns both fields undefined when docProps/core.xml is absent entirely", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "<document />");
    const docxBytes = await zip.generateAsync({ type: "nodebuffer" });

    const result = await readDocxCoreProperties(docxBytes);

    expect(result.title).toBeUndefined();
    expect(result.author).toBeUndefined();
  });

  it("treats an empty title/author element as absent, not an empty string", async () => {
    const zip = new JSZip();
    zip.file(
      "docProps/core.xml",
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/">' +
        "<dc:title></dc:title><dc:creator>   </dc:creator>" +
        "</cp:coreProperties>",
    );
    const docxBytes = await zip.generateAsync({ type: "nodebuffer" });

    const result = await readDocxCoreProperties(docxBytes);

    expect(result.title).toBeUndefined();
    expect(result.author).toBeUndefined();
  });
});
