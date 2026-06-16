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
import { baseSchemaExtensions } from "../../../components/Editor/editorExtensions";

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
  if (manager) return manager;
  manager = new MarkdownManager({
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
  return getManager().serialize(doc);
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
