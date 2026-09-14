// Last Updated: 2026-09-13

/**
 * @module generate-docx-fixtures
 *
 * One-time generation script for Feature 45 (Word/DOCX project importer,
 * `specs/features/docx-importer.md`, FR-12) synthetic `.docx` fixtures.
 *
 * This is **not a test** and is never run at test-run time — its output is
 * committed to git and consumed directly by the importer's test suite,
 * mirroring `specs/features/scrivener-cli-importer/tasks.md`'s Task 1
 * committed-fixture convention (a synthetic `.scriv` fixture built from
 * scratch and checked in, rather than regenerated on every test run).
 *
 * Run from `frontend/`:
 *
 *   node --experimental-strip-types tests/fixtures/docx/generate-docx-fixtures.ts
 *
 * Uses only the `docx` package (already a dependency, see FR-12) plus
 * `node:fs`/`node:path` — no additional runner or dependency is introduced.
 * Each fixture is deliberately minimal: one instance of the shape it exists
 * to exercise, not full coverage breadth.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Document,
  EndnoteReferenceRun,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  InsertedTextRun,
  DeletedTextRun,
  CommentRangeStart,
  CommentRangeEnd,
  CommentReference,
  Packer,
  Paragraph,
  TextRun,
} from "docx";

const FIXTURES_DIR = path.dirname(fileURLToPath(import.meta.url));

/** A 1x1 transparent PNG, embedded as raw bytes for the `with-image` fixture. */
const ONE_PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function writeDocx(fileName: string, doc: Document): Promise<void> {
  const buffer = await Packer.toBuffer(doc);
  const outPath = path.join(FIXTURES_DIR, fileName);
  writeFileSync(outPath, buffer);
  // eslint-disable-next-line no-console
  console.log(`wrote ${outPath} (${buffer.byteLength} bytes)`);
}

/** `multi-heading.docx` — headings at levels 1-3, bold/italic runs. */
function buildMultiHeadingDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun("Chapter One")],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun("A Section")],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [new TextRun("A Subsection")],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "This word is bold.", bold: true }),
              new TextRun(" "),
              new TextRun({ text: "This word is italic.", italics: true }),
            ],
          }),
        ],
      },
    ],
  });
}

/** `footnotes-endnotes.docx` — at least one footnote and one endnote reference. */
function buildFootnotesEndnotesDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun("A sentence with a footnote."),
              new FootnoteReferenceRun(1),
              new TextRun(" And one with an endnote."),
              new EndnoteReferenceRun(1),
            ],
          }),
        ],
      },
    ],
    footnotes: {
      1: {
        children: [
          new Paragraph({
            children: [new TextRun("This is the footnote text.")],
          }),
        ],
      },
    },
    endnotes: {
      1: {
        children: [
          new Paragraph({
            children: [new TextRun("This is the endnote text.")],
          }),
        ],
      },
    },
  });
}

/** `core-properties.docx` — non-empty `docProps/core.xml` title and author. */
function buildCorePropertiesDoc(): Document {
  return new Document({
    title: "Synthetic Core Properties Fixture",
    creator: "GetWrite Fixture Generator",
    sections: [
      { children: [new Paragraph({ children: [new TextRun("Body text.")] })] },
    ],
  });
}

/** `comments.docx` — a comment anchored to a run of body text. */
function buildCommentsDoc(): Document {
  return new Document({
    comments: {
      children: [
        {
          id: 1,
          author: "A Reviewer",
          date: new Date("2026-01-01T00:00:00Z"),
          children: [
            new Paragraph({ children: [new TextRun("This is a comment.")] }),
          ],
        },
      ],
    },
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new CommentRangeStart(1),
              new TextRun("Commented text."),
              new CommentRangeEnd(1),
              new TextRun({ children: [new CommentReference(1)] }),
            ],
          }),
        ],
      },
    ],
  });
}

/** `tracked-changes.docx` — both an inserted and a deleted run. */
function buildTrackedChangesDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new TextRun("Unchanged text. "),
              new InsertedTextRun({
                id: 1,
                author: "An Editor",
                date: "2026-01-01T00:00:00Z",
                children: [new TextRun("Inserted text.")],
              }),
              new DeletedTextRun({
                id: 2,
                author: "An Editor",
                date: "2026-01-01T00:00:00Z",
                children: [new TextRun("Deleted text.")],
              }),
            ],
          }),
        ],
      },
    ],
  });
}

/** `with-image.docx` — one embedded image. */
function buildWithImageDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: ONE_PIXEL_PNG,
                transformation: { width: 1, height: 1 },
              }),
            ],
          }),
        ],
      },
    ],
  });
}

/** `no-headings.docx` — plain paragraphs, no heading styles at all. */
function buildNoHeadingsDoc(): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun("First paragraph, no heading.")],
          }),
          new Paragraph({
            children: [new TextRun("Second paragraph, still no heading.")],
          }),
        ],
      },
    ],
  });
}

/** `folder-source/**` — a folder-walk fixture tree (FR-1/FR-3/FR-15 skip categories). */
async function buildFolderSourceTree(): Promise<void> {
  const root = path.join(FIXTURES_DIR, "folder-source");
  const nested = path.join(root, "nested-subfolder");
  const hiddenDir = path.join(root, ".hidden-dir");
  mkdirSync(nested, { recursive: true });
  mkdirSync(hiddenDir, { recursive: true });

  const nestedDoc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ children: [new TextRun("A nested document.")] }),
        ],
      },
    ],
  });
  const nestedBuffer = await Packer.toBuffer(nestedDoc);
  writeFileSync(path.join(nested, "nested.docx"), nestedBuffer);
  console.log(
    `wrote ${path.join(nested, "nested.docx")} (${nestedBuffer.byteLength} bytes)`,
  );

  writeFileSync(
    path.join(root, "notes.txt"),
    "Not a docx file — should be skipped.\n",
  );
  console.log(`wrote ${path.join(root, "notes.txt")}`);

  writeFileSync(
    path.join(root, "~$scratch.docx"),
    Buffer.from("not a real docx, a lock file"),
  );
  console.log(`wrote ${path.join(root, "~$scratch.docx")}`);

  writeFileSync(
    path.join(root, ".hidden-file.docx"),
    Buffer.from("hidden dotfile placeholder"),
  );
  console.log(`wrote ${path.join(root, ".hidden-file.docx")}`);

  const hiddenDirDoc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun("A document inside a hidden dir.")],
          }),
        ],
      },
    ],
  });
  const hiddenDirBuffer = await Packer.toBuffer(hiddenDirDoc);
  writeFileSync(path.join(hiddenDir, "inside-hidden.docx"), hiddenDirBuffer);
  console.log(
    `wrote ${path.join(hiddenDir, "inside-hidden.docx")} (${hiddenDirBuffer.byteLength} bytes)`,
  );
}

async function main(): Promise<void> {
  await writeDocx("multi-heading.docx", buildMultiHeadingDoc());
  await writeDocx("footnotes-endnotes.docx", buildFootnotesEndnotesDoc());
  await writeDocx("core-properties.docx", buildCorePropertiesDoc());
  await writeDocx("comments.docx", buildCommentsDoc());
  await writeDocx("tracked-changes.docx", buildTrackedChangesDoc());
  await writeDocx("with-image.docx", buildWithImageDoc());
  await writeDocx("no-headings.docx", buildNoHeadingsDoc());
  await buildFolderSourceTree();
}

main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});
