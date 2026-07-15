export interface ResourceMeta {
  id: string;
  name: string;
  type: string;
}

export interface CompileBody {
  projectId: string;
  resourceIds: string[];
  resources: ResourceMeta[];
  includeHeaders: boolean;
  projectName: string;
}

/**
 * How a construct that GitHub Flavored Markdown cannot represent was handled on
 * export:
 * - `html-fallback`: preserved losslessly as inline HTML (output is not pure
 *   Markdown).
 * - `dropped`: presentational styling with no Markdown form; the text content
 *   is preserved but the styling is normalized away.
 */
export type MarkdownLossKind = "html-fallback" | "dropped";

/**
 * A single category of content that could not be represented as plain GFM
 * during Markdown serialization, surfaced so users are not surprised by lossy
 * or HTML-laced output.
 */
export interface MarkdownConstructWarning {
  /** Stable identifier for the construct category (e.g. `image-link`). */
  construct: string;
  /** Human-readable label for display. */
  label: string;
  /** How the construct was handled on export. */
  kind: MarkdownLossKind;
  /** Number of occurrences in the serialized document(s). */
  count: number;
}

/** Result of serializing a document to Markdown with its loss warnings. */
export interface MarkdownSerialization {
  markdown: string;
  warnings: MarkdownConstructWarning[];
}
