import type { JSONContent } from "@tiptap/core";
import {
  serializeMarkdown,
  mergeMarkdownWarnings,
} from "./markdown-serializer";
import type { MarkdownConstructWarning } from "./types";

/** One resource's contribution to a compiled Markdown document. */
export interface MarkdownSection {
  name: string;
  /** The resource's TipTap document, or `undefined` if it has no content. */
  doc: JSONContent | undefined;
}

export interface CompileMarkdownOptions {
  /** Prefix each section with an `# <name>` heading (used when compiling >1). */
  includeHeaders: boolean;
}

export interface CompileMarkdownResult {
  markdown: string;
  /** Loss warnings aggregated across all included sections. */
  warnings: MarkdownConstructWarning[];
}

/**
 * Assemble an ordered list of resource documents into a single GitHub Flavored
 * Markdown string, mirroring `compileToText`'s structure (sections separated by
 * two blank lines, optional per-section headers). Returns the document together
 * with the loss warnings aggregated across every section.
 */
export function compileToMarkdown(
  sections: MarkdownSection[],
  options: CompileMarkdownOptions,
): CompileMarkdownResult {
  if (sections.length === 0) return { markdown: "", warnings: [] };

  const warningLists: MarkdownConstructWarning[][] = [];

  const parts = sections.map(({ name, doc }) => {
    const { markdown, warnings } = doc
      ? serializeMarkdown(doc)
      : { markdown: "", warnings: [] };
    warningLists.push(warnings);
    return options.includeHeaders ? `# ${name}\n\n${markdown}` : markdown;
  });

  return {
    markdown: parts.join("\n\n\n"),
    warnings: mergeMarkdownWarnings(warningLists),
  };
}
