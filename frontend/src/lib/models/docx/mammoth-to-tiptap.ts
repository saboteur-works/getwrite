// Last Updated: 2026-09-13

/**
 * @module mammoth-to-tiptap
 *
 * DOCX → `mammoth` HTML → TipTap JSON conversion for the DOCX importer
 * (`specs/features/docx-importer.md`, FR-4/FR-13/FR-18).
 *
 * **Pipeline.** `convertDocxToTiptap` runs `mammoth.convertToHtml` over the
 * raw `.docx` bytes, then parses the resulting HTML string with
 * `fast-xml-parser`'s `preserveOrder` mode (already a direct dependency via
 * the Scrivener importer's `scrivx-parser.ts`; no new HTML-parsing
 * dependency is added). `preserveOrder` mode is required — not the
 * library's default mode — because it returns an array-based AST that
 * preserves document order and mixed inline content (text runs
 * interleaved with `<strong>`/`<em>`/`<a>`/etc. within one paragraph); the
 * default mode groups same-tag siblings into arrays keyed by tag name,
 * which would scramble a paragraph's own run order. Verified suitable
 * because `mammoth`'s own HTML writer
 * (`node_modules/mammoth/lib/writers/html-writer.js`) always emits
 * well-formed, properly escaped, self-closed-void-element HTML (e.g.
 * `<img ... />`), so no HTML-specific (tag-soup-tolerant) parser is needed.
 *
 * **Mark names.** Bold/italic become TipTap `"bold"`/`"italic"` marks —
 * the same on-disk names `rtf-to-tiptap.ts` uses (confirmed there against
 * `content.tiptap.json` on disk) — since `mammoth`'s default style map
 * converts `run.isBold`/`run.isItalic` to `<strong>`/`<em>`
 * (`node_modules/mammoth/lib/document-to-html.js`). Like
 * `rtf-to-tiptap.ts`, this module defines its own local `DocxTipTap*`
 * types rather than reusing `types.ts`'s `TipTapDocument`/`TipTapNode`
 * directly: those declare no `marks` field (used only within
 * `schemas.ts`), so widening them here would either lose marks or require
 * changing a schema this module doesn't own. The local types are
 * structurally compatible with the same `{ type: "doc", content: [...] }`
 * envelope.
 *
 * **Footnotes/endnotes (FR-13, resolved OQ-1 — TEMPORARY, pending a real
 * footnote node).** `mammoth` itself already renders each note reference
 * as `<sup><a href="#footnote-N" id="footnote-ref-N">[n]</a></sup>` at the
 * point of reference (`n` numbered sequentially across footnotes *and*
 * endnotes combined, in document order — verified against
 * `document-to-html.js`'s `noteReference`/`noteNumber` handling), and
 * appends every referenced note's body as an `<ol>` of `<li id="footnote-N"
 * | "endnote-N">` as the second-to-last top-level element of the document
 * (verified: `document-to-html.js`'s `"document"` element converter always
 * concatenates `[...body, notesOl, commentsDl]`, though empty `<ol>`/`<dl>`
 * elements render as nothing at all rather than empty tags — verified by
 * running `mammoth` against fixtures with no notes/comments). This module:
 *
 * - Unwraps the `<sup><a>[n]</a></sup>` reference into plain `"[n]"` text
 *   with **no mark at all** — not even the surrounding run's own bold/
 *   italic — per FR-13/OQ-1's "no superscript mark exists" rationale,
 *   which this converter takes as "the reference marker is not part of the
 *   prose formatting" generally.
 * - Detects the trailing notes `<ol>` structurally (every `<li>` inside it
 *   has an `id` starting with `"footnote-"` or `"endnote-"`) and extracts
 *   it into a separate, ordered `notes: { n, text }[]` array — `n` is the
 *   `<li>`'s 1-based position in that list, which matches the in-text
 *   `"[n]"` numbering exactly, since `mammoth` builds both from the same
 *   `noteReferences` order. The notes `<ol>` itself is never added to the
 *   returned TipTap document's `content` — appending it as the resource's
 *   own numbered "Notes" paragraph list is Task 7/Task 9's job, not this
 *   module's.
 * - A note's own back-link (`<a href="#footnote-ref-N">↑</a>`, appended by
 *   `mammoth` inside the note body's own last paragraph) is stripped from
 *   the extracted note text.
 *
 * **Comments (FR-4/FR-18).** `mammoth`'s default style map ignores
 * `commentReference`/`comment` entirely (verified: converting the
 * `comments.docx` fixture emits no comment markup at all, matching the
 * README's "comments ignored by default"), so no comment content ever
 * reaches this module's HTML input in the first place. As a defensive
 * second layer — in case a future `mammoth` version or option change
 * altered that default — any top-level `<dl>` (the comments container
 * `document-to-html.js` would emit if comments were enabled) is dropped
 * unconditionally rather than converted, so a comment can never end up in
 * imported prose. Detecting *that* comments existed at all, for the FR-6
 * report's count, is FR-18's own `word/comments.xml` inspection — a
 * separate module — not this one's job.
 *
 * **Tracked changes (FR-4/FR-18, resolved OQ-10).** `mammoth` itself
 * imports tracked-change content as accepted-as-shown — inserted-run text
 * kept, deleted-run text dropped, with no emitted message either way
 * (verified against `body-reader.js` and confirmed empirically against the
 * `tracked-changes.docx` fixture below) — so this module requires no
 * special handling for `w:ins`/`w:del`: the HTML `mammoth` hands it already
 * reflects the accepted-as-shown text. Detecting *that* tracked changes
 * were present, for the FR-6 report, is again FR-18's own
 * `word/document.xml` inspection.
 *
 * **Images/embedded media (FR-18).** Every `<img>` `mammoth` emits (it
 * converts an image to a `data:` URI `<img>` by default) is stripped
 * entirely during the HTML → TipTap step — never an `image` TipTap node,
 * never stray `<img>` text. A paragraph containing only a (now-stripped)
 * image converts to an empty paragraph rather than being dropped itself,
 * since the paragraph's own presence in the document is still meaningful
 * structure.
 *
 * **Unrecognized inline/block content.** An inline tag this module does
 * not specifically recognize (e.g. `<u>`/`<s>`/`<span>` from
 * underline/strikethrough/highlight, which FR-4 does not require carrying
 * a mark for) has its text passed through transparently rather than
 * dropped. A top-level block tag this module does not specifically
 * recognize (a real bullet/numbered list, a table — neither appears in
 * this feature's fixture set) falls back to flattening its text into a
 * single paragraph, so no top-level content is ever silently discarded.
 */
import mammoth from "mammoth";
import { XMLParser } from "fast-xml-parser";

/** A TipTap mark this converter can produce, matching the on-disk mark
 * names `rtf-to-tiptap.ts` also uses (FR-4). */
export interface DocxTipTapMark {
  type: "bold" | "italic";
}

/** A single run of text within a block node, with zero or more marks. */
export interface DocxTipTapTextNode {
  type: "text";
  text: string;
  marks?: DocxTipTapMark[];
}

/** A `<br>` line break within a paragraph or heading. */
export interface DocxTipTapHardBreakNode {
  type: "hardBreak";
}

/** One node within a block node's `content`. */
export type DocxTipTapInlineNode = DocxTipTapTextNode | DocxTipTapHardBreakNode;

/** A paragraph node; `content` is empty for a blank paragraph (including a
 * paragraph whose only content was a stripped image). */
export interface DocxTipTapParagraphNode {
  type: "paragraph";
  content: DocxTipTapInlineNode[];
}

/** A heading node carrying its source `<h1>`-`<h6>` level. */
export interface DocxTipTapHeadingNode {
  type: "heading";
  attrs: { level: 1 | 2 | 3 | 4 | 5 | 6 };
  content: DocxTipTapInlineNode[];
}

/** A top-level block node in the converted document. */
export type DocxTipTapBlockNode = DocxTipTapParagraphNode | DocxTipTapHeadingNode;

/**
 * TipTap document root produced by this converter. Structurally compatible
 * with the broader `TipTapDocument` interface in `types.ts` (same
 * `{ type: "doc", content: [...] }` envelope) — see the module doc for why
 * this converter declares its own, `marks`-carrying node types instead of
 * importing `types.ts`'s.
 */
export interface DocxTipTapDocument {
  type: "doc";
  content: DocxTipTapBlockNode[];
}

/**
 * A single footnote or endnote, in the order its reference first appears in
 * the running text. `n` matches the `"[n]"` marker left at the reference
 * point (FR-13/resolved OQ-1).
 */
export interface DocxNoteRef {
  readonly n: number;
  readonly text: string;
}

/**
 * Result of {@link convertDocxToTiptap}. Consumed directly by Task 7's
 * heading-level splitter (`heading-split.ts`, which slices `document` and
 * partitions `notes` by which section referenced each one) and, downstream,
 * by Task 9's resource-creation step (which appends `notes` as a resource's
 * "Notes" paragraph list) and the FR-6 report builder (`messages`, for
 * section (a)'s skipped/unconvertible items).
 */
export interface ConvertDocxToTiptapResult {
  readonly document: DocxTipTapDocument;
  readonly notes: readonly DocxNoteRef[];
  readonly messages: readonly string[];
}

/** A `fast-xml-parser` `preserveOrder`-mode node: either a text leaf
 * (`{ "#text": string }`) or an element (`{ [tagName]: Node[], ":@"?:
 * attrs }`). `fast-xml-parser` types this as `any`; this module narrows it
 * itself via the helpers below rather than propagating `any`. */
type XmlPreserveOrderNode = Record<string, unknown>;

function isXmlTextNode(node: XmlPreserveOrderNode): node is { "#text": string } {
  return typeof node["#text"] === "string";
}

/** The element's tag name — the one key on the node other than the `":@"`
 * attributes key — or `undefined` for a text node. */
function getTagName(node: XmlPreserveOrderNode): string | undefined {
  return Object.keys(node).find((key) => key !== ":@");
}

function getChildren(node: XmlPreserveOrderNode): XmlPreserveOrderNode[] {
  const tag = getTagName(node);
  if (tag === undefined) return [];
  const value = node[tag];
  return Array.isArray(value) ? (value as XmlPreserveOrderNode[]) : [];
}

/** Attribute values as parsed (prefixed `"@_"` per this module's parser
 * configuration), e.g. `getAttr(node, "id")` reads the element's `id`. */
function getAttr(node: XmlPreserveOrderNode, name: string): string | undefined {
  const attrs = node[":@"];
  if (attrs === null || typeof attrs !== "object") return undefined;
  const value = (attrs as Record<string, unknown>)[`@_${name}`];
  return typeof value === "string" ? value : undefined;
}

/** Adds `type` to `marks` if not already present, returning a new array
 * (marks arrays are never mutated in place, since a run's marks are shared
 * with siblings via structural sharing while recursing). */
function withMark(marks: DocxTipTapMark[], type: DocxTipTapMark["type"]): DocxTipTapMark[] {
  if (marks.some((mark) => mark.type === type)) return marks;
  return [...marks, { type }];
}

/** `true` for the `<a href="#footnote-ref-N">`/`<a href="#endnote-ref-N">`
 * back-link `mammoth` appends inside a note's own body (see module doc). */
function isNoteBackLink(anchor: XmlPreserveOrderNode): boolean {
  const href = getAttr(anchor, "href");
  return (
    href !== undefined &&
    (href.startsWith("#footnote-ref-") || href.startsWith("#endnote-ref-"))
  );
}

/** `true` for the `<a id="footnote-ref-N">`/`<a id="endnote-ref-N">` anchor
 * `mammoth` emits at a note's point of reference, wrapped in `<sup>`. */
function isNoteReferenceAnchor(anchor: XmlPreserveOrderNode): boolean {
  const id = getAttr(anchor, "id");
  return id !== undefined && (id.startsWith("footnote-ref-") || id.startsWith("endnote-ref-"));
}

/**
 * Plain-text content of `nodes`, recursing through every element but
 * dropping stripped image tags and a note's own back-link anchor. Used both
 * for a note-reference anchor's `"[n]"` text and for a note's own body
 * text.
 */
function collectPlainText(nodes: XmlPreserveOrderNode[]): string {
  let text = "";
  for (const node of nodes) {
    if (isXmlTextNode(node)) {
      text += node["#text"];
      continue;
    }
    const tag = getTagName(node);
    if (tag === "img") continue;
    if (tag === "a" && isNoteBackLink(node)) continue;
    text += collectPlainText(getChildren(node));
  }
  return text;
}

/**
 * If `supNode` is a `<sup>` wrapping a footnote/endnote reference anchor
 * (per {@link isNoteReferenceAnchor}), returns that anchor's `"[n]"` text;
 * otherwise `undefined` (an ordinary, non-note superscript run).
 */
function extractNoteReferenceText(supNode: XmlPreserveOrderNode): string | undefined {
  const anchor = getChildren(supNode).find(
    (child) => getTagName(child) === "a" && isNoteReferenceAnchor(child),
  );
  if (anchor === undefined) return undefined;
  return collectPlainText(getChildren(anchor));
}

/**
 * Converts a run of inline HTML nodes (the children of a paragraph,
 * heading, or note `<li>`) into TipTap inline nodes, threading the active
 * bold/italic marks through nested `<strong>`/`<em>` wrappers.
 */
function convertInline(
  nodes: XmlPreserveOrderNode[],
  marks: DocxTipTapMark[],
): DocxTipTapInlineNode[] {
  const result: DocxTipTapInlineNode[] = [];

  for (const node of nodes) {
    if (isXmlTextNode(node)) {
      const text = node["#text"];
      if (text.length === 0) continue;
      result.push(marks.length > 0 ? { type: "text", text, marks } : { type: "text", text });
      continue;
    }

    const tag = getTagName(node);
    if (tag === undefined) continue;

    // FR-18: strip every image/embedded media element mammoth emits.
    if (tag === "img") continue;

    if (tag === "br") {
      result.push({ type: "hardBreak" });
      continue;
    }

    if (tag === "strong") {
      result.push(...convertInline(getChildren(node), withMark(marks, "bold")));
      continue;
    }

    if (tag === "em") {
      result.push(...convertInline(getChildren(node), withMark(marks, "italic")));
      continue;
    }

    if (tag === "sup") {
      const noteReferenceText = extractNoteReferenceText(node);
      if (noteReferenceText !== undefined) {
        // FR-13/resolved OQ-1: plain "[n]" text, no mark at all.
        result.push({ type: "text", text: noteReferenceText });
        continue;
      }
      // An ordinary (non-note) superscript run: no superscript mark exists
      // in the editor's schema, so the text passes through unmarked for
      // that, keeping whatever bold/italic is already active.
      result.push(...convertInline(getChildren(node), marks));
      continue;
    }

    if (tag === "a") {
      if (isNoteBackLink(node)) continue;
      // A hyperlink: flattened to its visible text (no link mark exists in
      // the schema), mirroring rtf-to-tiptap.ts's HYPERLINK convention.
      result.push(...convertInline(getChildren(node), marks));
      continue;
    }

    // Any other inline wrapper (underline/strikethrough/highlight/span,
    // none of which FR-4 requires a mark for) passes its text through
    // transparently rather than being dropped.
    result.push(...convertInline(getChildren(node), marks));
  }

  return result;
}

/**
 * `true` when `olNode` is the trailing notes list mammoth always appends
 * after the document body when at least one footnote/endnote was
 * referenced — every `<li>` inside it has an `id` of the form
 * `"footnote-N"`/`"endnote-N"` (never the `"-ref-"` reference-anchor form,
 * which only appears on the in-text `<a>`, not the list's own `<li>`).
 */
function isNotesList(olNode: XmlPreserveOrderNode): boolean {
  const items = getChildren(olNode).filter((child) => getTagName(child) === "li");
  if (items.length === 0) return false;
  return items.every((li) => {
    const id = getAttr(li, "id");
    return id !== undefined && (id.startsWith("footnote-") || id.startsWith("endnote-"));
  });
}

/**
 * Extracts {@link DocxNoteRef}s from the notes `<ol>`, in list order (which
 * matches the in-text `"[n]"` numbering — see the module doc). Each
 * `<li>`'s own back-link paragraph text ("↑") is excluded; multiple
 * paragraphs within one note are joined with a blank line.
 */
function extractNotes(olNode: XmlPreserveOrderNode): DocxNoteRef[] {
  const items = getChildren(olNode).filter((child) => getTagName(child) === "li");
  return items.map((li, index) => {
    const blocks = getChildren(li).filter((child) => !isXmlTextNode(child));
    const paragraphs = blocks
      .map((block) => collectPlainText(getChildren(block)).trim())
      .filter((paragraph) => paragraph.length > 0);
    return { n: index + 1, text: paragraphs.join("\n\n") };
  });
}

const PARSER = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: false,
});

/** The synthetic root element name this module wraps `mammoth`'s HTML
 * fragment in before parsing (mammoth's HTML has no single root element,
 * which `fast-xml-parser` requires). */
const WRAPPER_TAG = "gw-docx-root";

/**
 * Converts a `.docx` file's raw bytes into a TipTap document plus its
 * footnotes/endnotes and mammoth's own conversion messages. Pure aside from
 * the `mammoth.convertToHtml` call itself, which does no filesystem I/O of
 * its own — the caller is responsible for having already read the file's
 * bytes (e.g. via `io.ts`'s `readFile`).
 */
export async function convertDocxToTiptap(
  docxBytes: Buffer | Uint8Array,
): Promise<ConvertDocxToTiptapResult> {
  const buffer = Buffer.isBuffer(docxBytes) ? docxBytes : Buffer.from(docxBytes);
  const converted = await mammoth.convertToHtml({ buffer });
  const messages = converted.messages.map((message) => `${message.type}: ${message.message}`);

  const parsed = PARSER.parse(
    `<${WRAPPER_TAG}>${converted.value}</${WRAPPER_TAG}>`,
  ) as XmlPreserveOrderNode[];
  const rootNode = parsed.find((node) => getTagName(node) === WRAPPER_TAG);
  const topLevelNodes = rootNode === undefined ? [] : getChildren(rootNode);

  const content: DocxTipTapBlockNode[] = [];
  const notes: DocxNoteRef[] = [];

  for (const node of topLevelNodes) {
    if (isXmlTextNode(node)) continue; // no visible top-level whitespace mammoth emits
    const tag = getTagName(node);
    if (tag === undefined) continue;

    // FR-4/FR-18: comments are never imported. mammoth ignores them by
    // default already (see module doc); this is a defensive second layer.
    if (tag === "dl") continue;

    if (tag === "ol" && isNotesList(node)) {
      notes.push(...extractNotes(node));
      continue;
    }

    const headingLevelMatch = /^h([1-6])$/.exec(tag);
    if (headingLevelMatch !== null) {
      const level = Number(headingLevelMatch[1]) as 1 | 2 | 3 | 4 | 5 | 6;
      content.push({
        type: "heading",
        attrs: { level },
        content: convertInline(getChildren(node), []),
      });
      continue;
    }

    if (tag === "p") {
      content.push({ type: "paragraph", content: convertInline(getChildren(node), []) });
      continue;
    }

    // An unrecognized top-level block (a real list or table — neither
    // appears in this feature's fixture set): flatten its text into one
    // paragraph rather than silently dropping it.
    content.push({ type: "paragraph", content: convertInline(getChildren(node), []) });
  }

  return {
    document: { type: "doc", content },
    notes,
    messages,
  };
}
