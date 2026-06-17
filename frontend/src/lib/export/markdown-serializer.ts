/**
 * @module markdown-serializer
 *
 * Headless, server-safe conversion between the GetWrite TipTap document schema
 * and GitHub Flavored Markdown. Built on `@tiptap/markdown`'s `MarkdownManager`,
 * which consumes the same extension set as the editor without requiring a live
 * editor instance — so this module can run inside API routes (export/compile)
 * as well as in the browser.
 *
 * The schema is sourced from {@link baseSchemaExtensions} (shared with the
 * editor) plus the two runtime-configured schema extensions the editor adds at
 * mount time — CustomHeading (StarterKit's heading is disabled in favour of it)
 * and Math — configured here with neutral defaults.
 */
import { MarkdownManager } from "@tiptap/markdown";
import type { JSONContent } from "@tiptap/core";
import Math from "@tiptap/extension-mathematics";
import CustomHeading from "../../../components/Editor/Extensions/CustomHeading";
import { unescapeWikiLinkBrackets } from "../../../components/Editor/Extensions/WikiLinkDecoration";
import { baseSchemaExtensions } from "../../../components/Editor/editorExtensions";
import type {
  MarkdownConstructWarning,
  MarkdownLossKind,
  MarkdownSerialization,
} from "./types";

/**
 * Full document schema for serialization: the shared base plus the schema
 * extensions the editor configures at runtime, with neutral options.
 */
const schemaExtensions = [
  ...baseSchemaExtensions,
  CustomHeading.configure({}),
  Math,
];

let manager: MarkdownManager | null = null;

/** Lazily construct and memoise a single MarkdownManager for the schema. */
function getManager(): MarkdownManager {
  manager ??= new MarkdownManager({
    extensions: schemaExtensions,
    markedOptions: { gfm: true },
  });
  return manager;
}

/**
 * Serialize a TipTap document (or document fragment) to GitHub Flavored
 * Markdown.
 *
 * @param doc - A TipTap JSON document, typically the root `doc` node.
 * @returns The document rendered as GFM. Returns an empty string for empty
 *   input.
 */
export function documentToMarkdown(doc: JSONContent): string {
  return unescapeWikiLinkBrackets(getManager().serialize(doc));
}

/**
 * Parse a GitHub Flavored Markdown string into a TipTap JSON document.
 *
 * @param markdown - The Markdown source to parse.
 * @returns The parsed TipTap JSON document.
 */
export function markdownToDocument(markdown: string): JSONContent {
  return getManager().parse(markdown);
}

/** Default paragraph line-height; see `GetWriteParagraphLeading`. */
const DEFAULT_PARAGRAPH_LEADING = "1.5";

/** `textStyle` attributes that carry presentational styling Markdown cannot keep. */
const TEXT_STYLE_ATTRS = ["color", "backgroundColor", "fontSize", "fontFamily"];

/**
 * Catalogue of constructs Markdown cannot represent as plain GFM, in stable
 * display order. Each maps a detector-emitted id to its label and loss kind.
 */
const CONSTRUCT_CATALOGUE: Record<
  string,
  { label: string; kind: MarkdownLossKind }
> = {
  "image-link": { label: "Image with GetWrite link", kind: "html-fallback" },
  "paragraph-leading": { label: "Paragraph line spacing", kind: "dropped" },
  "text-style": { label: "Text colour & font styling", kind: "dropped" },
};

/** Add `by` (default 1) to the counter for `key` in `counts`. */
function increment(counts: Map<string, number>, key: string, by = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

/** Record one occurrence of a lossy construct found at `node`. */
function tallyNode(node: JSONContent, counts: Map<string, number>): void {
  if (node.type === "image" && node.attrs?.resourceId) {
    increment(counts, "image-link");
  }

  if (node.type === "paragraph") {
    const leading = node.attrs?.paragraphLeading;
    if (leading != null && leading !== DEFAULT_PARAGRAPH_LEADING) {
      increment(counts, "paragraph-leading");
    }
  }

  for (const mark of node.marks ?? []) {
    if (
      mark.type === "textStyle" &&
      TEXT_STYLE_ATTRS.some((attr) => mark.attrs?.[attr] != null)
    ) {
      increment(counts, "text-style");
    }
  }
}

/** Recursively walk a document, tallying every lossy construct it contains. */
function walk(node: JSONContent, counts: Map<string, number>): void {
  tallyNode(node, counts);
  for (const child of node.content ?? []) {
    walk(child, counts);
  }
}

/** Build the ordered warning list from a construct → count tally. */
function countsToWarnings(
  counts: Map<string, number>,
): MarkdownConstructWarning[] {
  return Object.entries(CONSTRUCT_CATALOGUE).flatMap(
    ([construct, { label, kind }]) => {
      const count = counts.get(construct) ?? 0;
      return count > 0 ? [{ construct, label, kind, count }] : [];
    },
  );
}

/**
 * Inspect a TipTap document for constructs that GitHub Flavored Markdown cannot
 * represent (and that are therefore emitted as inline HTML or dropped).
 *
 * @param doc - A TipTap JSON document.
 * @returns One warning per affected construct, in stable display order, each
 *   with the number of occurrences. Empty when the document is fully GFM-
 *   representable.
 */
export function collectMarkdownWarnings(
  doc: JSONContent,
): MarkdownConstructWarning[] {
  const counts = new Map<string, number>();
  walk(doc, counts);
  return countsToWarnings(counts);
}

/**
 * Serialize a document to Markdown together with its loss warnings, so callers
 * (export/compile) can emit the file and surface what could not be represented
 * in a single pass.
 */
export function serializeMarkdown(doc: JSONContent): MarkdownSerialization {
  return {
    markdown: documentToMarkdown(doc),
    warnings: collectMarkdownWarnings(doc),
  };
}

/**
 * Combine warning lists from several documents into one aggregated list,
 * summing occurrence counts per construct. Used when compiling multiple
 * resources into a single Markdown file (FR-8).
 */
export function mergeMarkdownWarnings(
  lists: MarkdownConstructWarning[][],
): MarkdownConstructWarning[] {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const { construct, count } of list) {
      increment(counts, construct, count);
    }
  }
  return countsToWarnings(counts);
}
