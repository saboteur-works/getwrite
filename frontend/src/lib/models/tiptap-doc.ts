import type { TipTapDocument, TipTapNode } from "./types";

/**
 * Builds a minimal TipTap document from plain text, one paragraph per line.
 *
 * The model layer's own copy of the conversion `src/lib/tiptap-text.ts`
 * provides to components. It exists separately because `tiptap-text.ts`
 * imports from the `./models` barrel, so importing it from inside `models/`
 * would pull that barrel back into its own members. This file imports only
 * `./types`, which imports nothing.
 *
 * Used when writing a new resource's first canonical revision: the editor
 * reads that payload back and only recognises a serialized document, so a
 * plain-text payload is loaded as HTML and collapses to a single paragraph.
 *
 * @param plain - Plain text whose newlines separate paragraphs.
 * @returns A `doc` node with one paragraph per line; empty lines stay empty.
 */
export function plainTextToTipTapDocument(plain: string): TipTapDocument {
  const content: TipTapNode[] = plain
    .split(/\r?\n/)
    .map((line) => ({
      type: "paragraph",
      content: line === "" ? [] : [{ type: "text", text: line }],
    }));

  return { type: "doc", content };
}
