/**
 * @module txt-to-tiptap
 *
 * Pure plain-text (`.txt`) → TipTap converter for the plain-text-import CLI
 * pipeline (FR-6). Mirrors the node shapes `rtf-to-tiptap.ts`'s
 * `convertRtfToTiptap` and `mammoth-to-tiptap.ts`'s `convertDocxToTiptap`
 * already emit — a `{ type: "doc", content: [...] }` envelope of
 * `"paragraph"` nodes, each containing an ordered array of `"text"` runs and
 * `"hardBreak"` nodes — so downstream code (persistence, schema validation)
 * treats a plain-text import's document exactly like any other converter's
 * output.
 *
 * Per FR-6 (resolving OQ-2, OQ-5, OQ-7, confirmed by the product owner and
 * final — no re-litigation needed):
 *
 * - A leading UTF-8 byte-order mark (U+FEFF), if present, is stripped before
 *   any other parsing.
 * - A blank line is the paragraph separator: one or more consecutive blank
 *   lines between two paragraph blocks are collapsed to a single break,
 *   mirroring how `\par` (or a run of them) separates RTF paragraphs.
 * - Within a single paragraph block, a lone `\n` is a soft wrap, not a new
 *   paragraph — it is preserved as a TipTap `hardBreak` node, exactly the
 *   node type/shape `rtf-to-tiptap.ts`'s `\line` handling already produces
 *   (`{ type: "hardBreak" }`), never as a literal space or newline
 *   character.
 *
 * This module is pure — no I/O. Reading the source file from disk (as UTF-8,
 * via `readFile(path, "utf8")`) is the orchestrator's responsibility (a
 * later task); this function only ever receives an already-decoded string.
 */

/** A single run of plain text within a paragraph. Plain-text source carries
 * no formatting, so — unlike RTF/DOCX's text nodes — this never carries a
 * `marks` field. */
export interface PlainTextTipTapTextNode {
  type: "text";
  text: string;
}

/**
 * A soft-wrap line break within a paragraph block (a lone `\n` joining two
 * lines of the same block), converted to the same TipTap `hardBreak` node
 * shape `rtf-to-tiptap.ts`'s `\line` handling produces — distinct from a
 * blank-line paragraph separator, which starts a new paragraph node instead.
 */
export interface PlainTextTipTapHardBreakNode {
  type: "hardBreak";
}

/** One node within a paragraph's `content`: a text run or a soft-wrap hard
 * break. */
export type PlainTextTipTapParagraphContentNode =
  | PlainTextTipTapTextNode
  | PlainTextTipTapHardBreakNode;

/** A paragraph node; its `content` is empty for a blank paragraph. */
export interface PlainTextTipTapParagraphNode {
  type: "paragraph";
  content: PlainTextTipTapParagraphContentNode[];
}

/**
 * TipTap document root produced by this converter — the same `{ type:
 * "doc", content: [...] }` envelope `RtfTipTapDocument`/`DocxTipTapDocument`
 * use.
 */
export interface PlainTextTipTapDocument {
  type: "doc";
  content: PlainTextTipTapParagraphNode[];
}

const UTF8_BOM = "﻿";

/**
 * Splits normalized (`\n`-only line endings) text into paragraph blocks,
 * treating one or more consecutive blank lines (a line with no characters)
 * as a single separator between blocks. A block's own lines are still
 * joined by `\n` internally — the soft-wrap handling in
 * {@link buildParagraphContent} splits them back out.
 */
function splitIntoParagraphBlocks(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line === "") {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
      // A blank line with no accumulated content is either a leading blank
      // line or one of a run of consecutive blank-line separators — both
      // are consumed silently, collapsing the run to a single separator.
      continue;
    }
    current.push(line);
  }

  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  return blocks;
}

/**
 * Converts one paragraph block's raw text (its internal `\n`s still intact)
 * into its paragraph content array: each line becomes a `"text"` node, and
 * each soft wrap between two lines becomes a `"hardBreak"` node — never a
 * literal space or newline character (FR-6).
 */
function buildParagraphContent(
  block: string,
): PlainTextTipTapParagraphContentNode[] {
  const lines = block.split("\n");
  const content: PlainTextTipTapParagraphContentNode[] = [];

  lines.forEach((line, index) => {
    if (line !== "") {
      content.push({ type: "text", text: line });
    }
    if (index < lines.length - 1) {
      content.push({ type: "hardBreak" });
    }
  });

  return content;
}

/**
 * Converts a `.txt` file's raw content (already read into memory as a
 * string) into a GetWrite TipTap document, applying FR-6's fixed parsing
 * rules. Pure — no I/O; callers read the file first.
 *
 * An all-blank or empty input produces a single empty paragraph rather than
 * throwing, mirroring `convertRtfToTiptap`'s equivalent empty-document
 * result.
 */
export function convertPlainTextToTiptap(
  rawContent: string,
): PlainTextTipTapDocument {
  const withoutBom = rawContent.startsWith(UTF8_BOM)
    ? rawContent.slice(UTF8_BOM.length)
    : rawContent;

  // Normalize line endings to `\n` before any blank-line/soft-wrap
  // detection, so a `\r\n`- or bare `\r`-delimited source file (e.g. a
  // Windows-authored `.txt`) parses identically to a `\n`-delimited one.
  const normalized = withoutBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const blocks = splitIntoParagraphBlocks(normalized);

  const paragraphs: PlainTextTipTapParagraphNode[] =
    blocks.length > 0
      ? blocks.map((block) => ({
          type: "paragraph",
          content: buildParagraphContent(block),
        }))
      : [{ type: "paragraph", content: [] }];

  return { type: "doc", content: paragraphs };
}
