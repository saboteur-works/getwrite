import React from "react";

/**
 * @module StoredDocumentView
 *
 * Read-only renderer for a stored TipTap document (Feature 110, FR-14). It
 * maps the JSON to plain React nodes: no TipTap editor is created and
 * `getActiveEditor` is never touched. Text is always a React text child
 * (never HTML). A node this renderer does not support is shown as a visible
 * placeholder and is never dropped silently.
 *
 * Supported nodes follow `Editor/editorExtensions.ts` (StarterKit, headings,
 * lists, blockquote, code block): `doc`, `paragraph`, `heading`, `text`,
 * `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`,
 * `hardBreak`, `horizontalRule`. Supported marks: `bold`, `italic`,
 * `strike`, `underline`, `code`. Any other mark (colour, highlight,
 * annotation, link) shows its text unstyled; the text is never lost.
 */

export interface StoredDocumentViewProps {
  /** The parsed stored TipTap document (JSON). Not validated by the caller. */
  document: unknown;
}

interface StoredMark {
  type?: unknown;
}

interface StoredNode {
  type?: unknown;
  text?: unknown;
  attrs?: { level?: unknown } | null;
  marks?: unknown;
  content?: unknown;
}

const PLACEHOLDER_SUFFIX = "not shown here";

function isNode(value: unknown): value is StoredNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function placeholder(label: string, key: React.Key): React.ReactElement {
  return (
    <p
      key={key}
      role="note"
      className="my-2 border border-dashed border-gw-border px-2 py-1 text-gw-label text-gw-secondary"
    >
      {`[${label}: ${PLACEHOLDER_SUFFIX}]`}
    </p>
  );
}

function inlinePlaceholder(label: string, key: React.Key): React.ReactElement {
  return (
    <span key={key} className="text-gw-label text-gw-secondary">
      {`[${label}: ${PLACEHOLDER_SUFFIX}]`}
    </span>
  );
}

function nodeLabel(node: StoredNode): string {
  return typeof node.type === "string" && node.type.length > 0
    ? `Unsupported content (${node.type})`
    : "Unsupported content";
}

function childrenOf(node: StoredNode): unknown[] {
  return Array.isArray(node.content) ? node.content : [];
}

function applyMarks(text: React.ReactNode, marks: unknown): React.ReactNode {
  if (!Array.isArray(marks)) return text;
  let out = text;
  for (const mark of marks as StoredMark[]) {
    if (!isNode(mark)) continue;
    if (mark.type === "bold") out = <strong>{out}</strong>;
    else if (mark.type === "italic") out = <em>{out}</em>;
    else if (mark.type === "strike") out = <s>{out}</s>;
    else if (mark.type === "underline") out = <u>{out}</u>;
    else if (mark.type === "code") out = <code>{out}</code>;
  }
  return out;
}

function renderInline(node: unknown, key: React.Key): React.ReactNode {
  if (!isNode(node)) return inlinePlaceholder("Unsupported content", key);
  if (node.type === "text" && typeof node.text === "string") {
    return (
      <React.Fragment key={key}>
        {applyMarks(node.text, node.marks)}
      </React.Fragment>
    );
  }
  if (node.type === "hardBreak") return <br key={key} />;
  return inlinePlaceholder(nodeLabel(node), key);
}

function renderInlineChildren(node: StoredNode): React.ReactNode[] {
  return childrenOf(node).map((child, i) => renderInline(child, i));
}

function renderBlocks(node: StoredNode): React.ReactNode[] {
  return childrenOf(node).map((child, i) => renderBlock(child, i));
}

function headingLevel(node: StoredNode): 1 | 2 | 3 | 4 | 5 | 6 {
  const level = node.attrs?.level;
  return typeof level === "number" && level >= 1 && level <= 6
    ? (Math.floor(level) as 1 | 2 | 3 | 4 | 5 | 6)
    : 1;
}

function renderBlock(node: unknown, key: React.Key): React.ReactNode {
  if (!isNode(node)) return placeholder("Unsupported content", key);
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{renderInlineChildren(node)}</p>;
    case "heading": {
      const Tag = `h${headingLevel(node)}` as const;
      return <Tag key={key}>{renderInlineChildren(node)}</Tag>;
    }
    case "bulletList":
      return <ul key={key}>{renderBlocks(node)}</ul>;
    case "orderedList":
      return <ol key={key}>{renderBlocks(node)}</ol>;
    case "listItem":
      return <li key={key}>{renderBlocks(node)}</li>;
    case "blockquote":
      return <blockquote key={key}>{renderBlocks(node)}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{renderInlineChildren(node)}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} />;
    default:
      return placeholder(nodeLabel(node), key);
  }
}

/**
 * Renders a stored TipTap document read-only. A value that is not a `doc`
 * node renders one visible placeholder, never an empty view.
 */
export default function StoredDocumentView({
  document,
}: StoredDocumentViewProps): React.ReactElement {
  if (!isNode(document) || document.type !== "doc") {
    return placeholder("The document", "root");
  }
  return <div className="stored-document">{renderBlocks(document)}</div>;
}
